'use client';

import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import type { ChangeEvent } from 'react';
import type {
  Warehouse,
  Order,
  ToolType,
  SimulationResults,
  StrategyType,
  StrategyResult,
  ZVisualizationMode,
  WarehouseProfile,
  LaborProfile,
  SimulationValidationContext,
  SimulationBlockState,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import {
  generateRandomOrders,
  createEmptyWarehouse,
  generateSkeletonWarehouse,
} from '@/lib/taro/demo-generator';
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseFlow } from './warehouse-flow';
import { OrdersPanel } from './orders-panel';
import { SystemStatePanel } from './results-panel';
import { Toolbar } from './toolbar';
import { LayoutConfigOverlay, type LayoutConfig } from './layout-config-overlay';
import { ValidationModal } from './validation-modal';
import { ReadinessIndicator } from './readiness-indicator';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { getMissingSkuIds, validateItems, type ItemsValidationResult } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { validateSkuQuantityInvariant } from '@/lib/taro/inventory';
import {
  loadWorkspace,
  loadProject,
  generateAndSaveWarehouse,
  saveOrders,
  saveWarehouseLayout,
  duplicateWarehouseAction,
  renameWarehouseAction,
  deleteWarehouseAction,
  saveWarehousePositionAction,
} from '@/lib/db/actions';

interface TaroAppProps {
  /** Project to load. When omitted, falls back to the most recent project. */
  initialProjectId?: string;
  /** Called when the user requests to go back to the project dashboard. */
  onBackToDashboard?: () => void;
}

export function TaroApp({ initialProjectId, onBackToDashboard }: TaroAppProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [workspaceWarehouses, setWorkspaceWarehouses] = useState<WorkspaceWarehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);

  // Derived: the currently selected warehouse (drives all panels).
  const warehouse = useMemo(() => {
    if (!activeWarehouseId) return null;
    return workspaceWarehouses.find((w) => w.id === activeWarehouseId)?.warehouse ?? null;
  }, [activeWarehouseId, workspaceWarehouses]);

  // Derived: the active warehouse's own generation configuration.
  // Each warehouse stores its own configuration, so switching warehouses
  // correctly restores each one's slider values in the edit overlay.
  const activeWarehouseConfig = useMemo((): WarehouseConfiguration | null => {
    if (!activeWarehouseId) return null;
    return workspaceWarehouses.find((w) => w.id === activeWarehouseId)?.configuration ?? null;
  }, [activeWarehouseId, workspaceWarehouses]);

  // Stable refs so callbacks don't need to depend on changing arrays.
  const workspaceWarehousesRef = useRef(workspaceWarehouses);
  workspaceWarehousesRef.current = workspaceWarehouses;
  const activeWarehouseIdRef = useRef(activeWarehouseId);
  activeWarehouseIdRef.current = activeWarehouseId;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType>('shelf');
  const [zVisualizationMode, setZVisualizationMode] = useState<ZVisualizationMode>('all');
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<StrategyType | null>(null);
  // Animation progress ref → read by the canvas at 60 fps without React re-renders.
  // Throttled state mirror for the SystemStatePanel progress bars (~10 fps).
  const animationProgressRef = useRef(0);
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationProgressLastRenderedRef = useRef(0);
  const [workerCount, setWorkerCount] = useState(1);
  const [warehouseProfile, setWarehouseProfile] = useState<WarehouseProfile>({ ...DEFAULT_WAREHOUSE_PROFILE });
  const [laborProfile, setLaborProfile] = useState<LaborProfile>({ ...DEFAULT_LABOR_PROFILE });
  const [replaySpeed, setReplaySpeed] = useState<1 | 5 | 10>(1);
  const animationRef = useRef<number | null>(null);
  const replaySpeedRef = useRef(replaySpeed);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<string>('');
  const [executionPlanStrategy, setExecutionPlanStrategy] = useState<StrategyType | null>(null);
  const [validationContext, setValidationContext] = useState<SimulationValidationContext | null>(null);
  const [validationResult, setValidationResult] = useState<ItemsValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showLayoutConfig, setShowLayoutConfig] = useState(false);
  const [showNewWarehouseConfig, setShowNewWarehouseConfig] = useState(false);
  const [hasExistingWarehouse, setHasExistingWarehouse] = useState(false);
  const [highlightedMissingSkuIds, setHighlightedMissingSkuIds] = useState<Set<string> | null>(null);
  const [simulationBlockState, setSimulationBlockState] = useState<SimulationBlockState | null>(null);
  const [orderCount, setOrderCount] = useState(1000);
  const [avgOrderSize, setAvgOrderSize] = useState(5);

  const handleNewWarehouse = useCallback(() => {
    setShowNewWarehouseConfig(true);
  }, []);

  const resetAnimationState = useCallback(() => {
    setAnimationProgress(0);
    animationProgressRef.current = 0;
    animationProgressLastRenderedRef.current = 0;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const handleDuplicateWarehouse = useCallback(async (sourceWarehouseId: string) => {
    if (!activeProjectId) return;
    try {
      const result = await duplicateWarehouseAction(activeProjectId, sourceWarehouseId);

      // Append the duplicated warehouse to the project as a workspace entry
      const newEntry: WorkspaceWarehouse = {
        id: result.warehouseId,
        name: result.name,
        position: null, // new duplicates start at auto-layout
        warehouse: result.warehouse,
        configuration: result.configuration,
      };
      setWorkspaceWarehouses((prev) => [...prev, newEntry]);

      // Auto-select the new duplicate
      setActiveWarehouseId(result.warehouseId);

      // If the source was the active warehouse, adopt the duplicate's orders
      if (sourceWarehouseId === activeWarehouseIdRef.current) {
        setOrders(result.orders);

      }

      setSimulationResults(null);
      setSimulationBlockState(null);
      setIsSimulating(false);
      setActiveStrategy(null);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
      setImportSummary('');
      resetAnimationState();
    } catch (err) {
      console.error('Failed to duplicate warehouse:', err);
      alert('Failed to duplicate warehouse. Please try again.');
    }
  }, [activeProjectId, resetAnimationState]);

  // ── Workspace: Rename ────────────────────────────────────────────────────

  const handleRenameWarehouse = useCallback(async (warehouseId: string, name: string) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    // Optimistically update local state
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) => (ww.id === warehouseId ? { ...ww, name } : ww)),
    );

    try {
      await renameWarehouseAction(warehouseId, name, projectId);
    } catch (err) {
      console.error('Failed to rename warehouse:', err);
      // Revert by reloading on error — simplest rollback
      const snapshot = await loadProject(projectId);
      setWorkspaceWarehouses(snapshot.workspaceWarehouses);
    }
  }, []);

  // ── Workspace: Delete ────────────────────────────────────────────────────

  const handleDeleteWarehouse = useCallback(async (warehouseId: string) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    // Guard: prevent deleting the last warehouse
    if (workspaceWarehousesRef.current.length <= 1) {
      alert('Cannot delete the last warehouse. Create another warehouse first.');
      return;
    }

    try {
      await deleteWarehouseAction(warehouseId, projectId);

      // Remove from local state
      const removedIndex = workspaceWarehousesRef.current.findIndex((w) => w.id === warehouseId);
      const isActive = activeWarehouseIdRef.current === warehouseId;

      setWorkspaceWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));

      // If the deleted warehouse was active, auto-select another
      if (isActive) {
        const remaining = workspaceWarehousesRef.current.filter((w) => w.id !== warehouseId);
        if (remaining.length > 0) {
          // Pick the one at the same index, or the last one
          const nextIndex = Math.min(removedIndex, remaining.length - 1);
          setActiveWarehouseId(remaining[nextIndex].id);
        } else {
          setActiveWarehouseId(null);
        }
      }

      setSimulationResults(null);
      setSimulationBlockState(null);
      setIsSimulating(false);
      setActiveStrategy(null);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
      setImportSummary('');
      resetAnimationState();
    } catch (err) {
      console.error('Failed to delete warehouse:', err);
      alert('Failed to delete warehouse. Please try again.');
    }
  }, [resetAnimationState]);

  // ── Workspace: Position ──────────────────────────────────────────────────

  const positionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const handlePersistPosition = useCallback(async (warehouseId: string, x: number, y: number) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;

    // Update local state immediately
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) =>
        ww.id === warehouseId ? { ...ww, position: { x, y } } : ww,
      ),
    );

    // Debounced persistence (handled in WarehouseFlow with setTimeout, but persist here too)
    try {
      await saveWarehousePositionAction(warehouseId, projectId, x, y);
    } catch (err) {
      console.error('Failed to save warehouse position:', err);
    }
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Update the active warehouse's layout data (no persistence). */
  const updateActiveWarehouse = useCallback((newWh: Warehouse) => {
    setWorkspaceWarehouses((prev) => {
      const activeId = activeWarehouseIdRef.current;
      if (!activeId) return prev;
      return prev.map((ww) =>
        ww.id === activeId ? { ...ww, warehouse: newWh } : ww,
      );
    });
    setSimulationResults(null);
    setSimulationBlockState(null);
    setIsSimulating(false);
    setActiveStrategy(null);
    setExecutionPlanStrategy(null);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    setImportSummary('');
    animationProgressRef.current = 0;
  }, []);

  // Debounced persistence of canvas edits
  const saveLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleWarehouseChangePersisted = useCallback((
    whId: string,
    newWh: Warehouse,
  ) => {
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) =>
        ww.id === whId ? { ...ww, warehouse: newWh } : ww,
      ),
    );
    setSimulationResults(null);
    setSimulationBlockState(null);
    setIsSimulating(false);
    setActiveStrategy(null);
    setExecutionPlanStrategy(null);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    setImportSummary('');
    animationProgressRef.current = 0;

    if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
    saveLayoutTimerRef.current = setTimeout(() => {
      const pid = activeProjectIdRef.current;
      if (pid) {
        saveWarehouseLayout(pid, newWh, whId).catch(console.error);
      }
    }, 500);
  }, []);

  // 1. Derived Data (all guarded by warehouse being non-null)

  // Use a deferred snapshot of the warehouse for expensive validation
  // computations.  During rapid drawing the deferred value stays stale,
  // so fingerprinting, order validation, and readiness checks are skipped
  // entirely.  The canvas continues to read the live `warehouse` prop so
  // visual feedback stays instant.  When drawing pauses, the deferred
  // value catches up and all validations re-run once.
  const deferredWarehouse = useDeferredValue(warehouse);

  // Stable fingerprint of the warehouse's SKU → bin mapping.
  // Changes ONLY when inventory content changes, NOT when the user draws
  // empty shelves or repositions the worker-start point.  This is the key
  // that prevents the expensive validateItems() from running on every
  // mouse-move while drawing.
  const warehouseSkuFingerprint = useMemo(() => {
    if (!deferredWarehouse) return '';
    const parts: string[] = [];
    for (const row of deferredWarehouse.grid) {
      for (const cell of row) {
        for (const bin of cell.locations) {
          // Order-stable: sort only the concatenated string, not while building.
          parts.push(`${bin.sku}\,${bin.x}\,${bin.y}\,${bin.z}`);
        }
      }
    }
    return parts.sort().join('|');
  }, [deferredWarehouse]);

  // Expensive order-line validation — only re-runs when the SKU inventory
  // OR the order list actually changes.
  const cachedOrderValidation = useMemo(
    () => deferredWarehouse ? validateItems(orders, deferredWarehouse) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouseSkuFingerprint, orders]
  );

  const readiness = useMemo(
    () => deferredWarehouse
      ? evaluateReadiness(deferredWarehouse, orders, zVisualizationMode, cachedOrderValidation)
      : { isReady: false, status: 'NOT_READY' as const, conditions: [], completedSteps: 0, totalSteps: 5 } as SimulationReadiness,
    [deferredWarehouse, orders, zVisualizationMode, cachedOrderValidation]
  );
  const canSimulate = readiness.isReady;

  const activeRoute = useMemo((): StrategyResult | null => {
    if (!simulationResults || !activeStrategy) return null;
    return simulationResults.strategies.find(s => s.strategy === activeStrategy) || null;
  }, [simulationResults, activeStrategy]);

  const executionPlan = useMemo((): StrategyResult | null => {
    if (!executionPlanStrategy || !simulationResults) return null;
    return simulationResults.strategies.find(s => s.strategy === executionPlanStrategy) ?? null;
  }, [executionPlanStrategy, simulationResults]);

  const [animationReplayId, setAnimationReplayId] = useState(0);

  const startStrategyAnimation = useCallback((strategy: StrategyType) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setActiveStrategy(strategy);
    setAnimationProgress(0);
    animationProgressRef.current = 0;
    animationProgressLastRenderedRef.current = 0;
    setAnimationReplayId(id => id + 1);

    const baseDuration = 3000;
    let lastTime: number | null = null;
    let elapsed = 0;

    const animate = (currentTime: number) => {
      const delta = lastTime !== null ? currentTime - lastTime : 0;
      lastTime = currentTime;
      elapsed += delta * replaySpeedRef.current;

      const progress = Math.min(elapsed / baseDuration, 1);

      // Always update the ref so the canvas reads the latest value at 60 fps.
      animationProgressRef.current = progress;

      // Throttle React state updates to ~10 fps so the SystemStatePanel
      // progress bars stay responsive without driving full-tree re-renders.
      if (
        progress >= 1 ||
        currentTime - animationProgressLastRenderedRef.current > 100
      ) {
        setAnimationProgress(progress);
        animationProgressLastRenderedRef.current = currentTime;
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Ensure the final frame is rendered even when throttled.
        setAnimationProgress(1);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  const runSimulationFlow = useCallback(
    () => {
      if (!warehouse || !warehouse.workerStart || orders.length === 0) {
        return;
      }

      setSimulationResults(null);
      setSimulationBlockState(null);
      setIsSimulating(true);
      setActiveStrategy(null);
      animationProgressRef.current = 0;
      animationProgressLastRenderedRef.current = 0;
      setAnimationProgress(0);
      setExecutionPlanStrategy(null);
      setHighlightedMissingSkuIds(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);

      requestAnimationFrame(() => {
        try {
          const results = runSimulation(warehouse, orders, workerCount, {
            warehouseProfile,
            laborProfile,
          });

          setSimulationResults(results);
          setIsSimulating(false);
          setValidationContext(results.validationContext ?? null);
          setValidationResult(null);
          startStrategyAnimation(results.bestStrategy);
        } catch (error) {
          console.error('Simulation failed:', error);
          setIsSimulating(false);

          if (error instanceof UnreachableLocationError) {
            setSimulationBlockState({
              simulationState: 'UNREACHABLE_LOCATIONS',
              title: 'Unreachable Locations',
              description: 'The warehouse layout blocks workers from reaching some pick locations. Please check the layout; workers might not be able to go through.',
            });
          }
        }
      });
    },
    [warehouse, orders, workerCount, warehouseProfile, laborProfile, startStrategyAnimation]
  );

  const handleClearWarehouse = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the entire warehouse layout and all orders? This cannot be undone.')) {
      updateActiveWarehouse(createEmptyWarehouse(30, 24));
      setOrders([]);
      setSimulationResults(null);
      setIsSimulating(false);
      setActiveStrategy(null);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
      setSimulationBlockState(null);
      setImportSummary('');
      resetAnimationState();
    }
  }, [updateActiveWarehouse, resetAnimationState]);

  const handleSimulateClick = useCallback(() => {
    if (!warehouse) return;
    if (!readiness.isReady) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setSimulationResults(null);
      setActiveStrategy(null);
      animationProgressRef.current = 0;
      animationProgressLastRenderedRef.current = 0;
      setAnimationProgress(0);
      setExecutionPlanStrategy(null);
      setIsSimulating(false);

      const result = validateItems(orders, warehouse);
      setValidationResult(result);
      setValidationContext(result.context);

      // If we're not ready because of items, show the modal to explain why
      if (result.hasUnresolvableItems) {
        setShowValidationModal(true);
      }
      return;
    }

    setSimulationBlockState(null);
    runSimulationFlow();
  }, [readiness, warehouse, orders, runSimulationFlow]);

  const handleFixItems = useCallback(() => {
    setShowValidationModal(false);
    setValidationResult(null);
    if (validationContext) {
      const missingSkuIds = getMissingSkuIds(validationContext);
      setHighlightedMissingSkuIds(missingSkuIds);
    }
  }, [validationContext]);

  const handleStrategySelect = useCallback((strategy: StrategyType) => {
    startStrategyAnimation(strategy);
  }, [startStrategyAnimation]);

  const handleImport = useCallback(() => {
    csvInputRef.current?.click();
  }, []);

  const handleCsvSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const { warehouse: importedWarehouse, summary } = parseWarehouseCsv(csvText);
      updateActiveWarehouse(importedWarehouse);
      setOrders([]);
      setImportSummary(`Loaded ${summary.locationCount} locations across ${summary.rackCount} racks`);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
      setSimulationBlockState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse CSV.';
      alert(`CSV import failed: ${message}`);
    } finally {
      event.target.value = '';
    }
  }, [updateActiveWarehouse]);

  const handleAddDemoOrders = useCallback(async () => {
    if (!warehouse || !activeProjectId) return;
    try {
      const newOrders = await saveOrders(activeProjectId, warehouse, orderCount, avgOrderSize, activeWarehouseId ?? undefined);
      setOrders(newOrders);
    } catch (err) {
      console.error('Failed to save orders:', err);
      // Fallback: generate client-side
      const fallbackOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
      setOrders(fallbackOrders);
    }
  }, [warehouse, activeProjectId, orderCount, avgOrderSize]);

  // 4. Side Effects
  useEffect(() => {
    // Load workspace from database on mount
    let cancelled = false;
    async function init() {
      try {
        const snapshot = initialProjectId
          ? await loadProject(initialProjectId)
          : await loadWorkspace();
        if (cancelled) return;
        setActiveProjectId(snapshot.projectId);
        setWorkspaceWarehouses(snapshot.workspaceWarehouses);
        if (snapshot.workspaceWarehouses.length > 0) {
          setActiveWarehouseId(snapshot.workspaceWarehouses[0].id);
          setOrders(snapshot.orders);
          setHasExistingWarehouse(true);
          setShowLayoutConfig(false);
        } else {
          // No warehouse yet — create a skeleton as the single entry.
          const skeleton = generateSkeletonWarehouse();
          const skeletonId = crypto.randomUUID();
          const skeletonEntry: WorkspaceWarehouse = {
            id: skeletonId,
            name: 'Default Warehouse',
            position: null,
            warehouse: skeleton,
          };
          setWorkspaceWarehouses([skeletonEntry]);
          setActiveWarehouseId(skeletonId);
          setHasExistingWarehouse(false);
          setShowLayoutConfig(true);
        }
      } catch (err) {
        console.error('Failed to load workspace:', err);
        if (!cancelled) {
          setLoadError('Could not connect to database. Running in offline mode.');
          const skeleton = generateSkeletonWarehouse();
          const skeletonId = crypto.randomUUID();
          const skeletonEntry: WorkspaceWarehouse = {
            id: skeletonId,
            name: 'Default Warehouse',
            position: null,
            warehouse: skeleton,
          };
          setWorkspaceWarehouses([skeletonEntry]);
          setActiveWarehouseId(skeletonId);
          setShowLayoutConfig(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();
    return () => { cancelled = true };
  }, [initialProjectId]);

  useEffect(() => {
    replaySpeedRef.current = replaySpeed;
  }, [replaySpeed]);

  // Keyboard shortcut: 'h' toggles hand/pan tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'h' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setSelectedTool((prev) => (prev === 'hand' ? 'shelf' : 'hand'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-background font-sans relative">
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvSelected}
        className="hidden"
      />

      {/* Loading state */}
      {isLoading && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading workspace...</p>
          </div>
        </div>
      )}

      {/* DB error banner */}
      {loadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
          {loadError}
        </div>
      )}

      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-background shrink-0 gap-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {onBackToDashboard && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBackToDashboard}
                className="h-7 text-xs text-muted-foreground hover:text-foreground -ml-1"
              >
                ← Dashboard
              </Button>
            )}
            <div className="border-l border-border h-6" />
            <div>
              <h1 className="text-base font-bold tracking-tight">Taro - Warehouse Picking Simulator</h1>
              <p className="text-xs text-muted-foreground leading-tight">
                {hasExistingWarehouse ? 'Warehouse workspace loaded.' : 'Configure your warehouse layout to get started.'}
              </p>
              {importSummary && <p className="text-xs text-emerald-600 mt-1">{importSummary}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <ReadinessIndicator readiness={readiness} />

          {simulationResults && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSimulateClick}
              className="h-8 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Simulate again
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Orders */}
        <OrdersPanel
          orders={orders}
          onOrdersChange={setOrders}
          warehouse={warehouse ?? undefined}
          highlightedMissingSkuIds={highlightedMissingSkuIds}
          onClearHighlights={() => setHighlightedMissingSkuIds(null)}
          orderCount={orderCount}
          avgOrderSize={avgOrderSize}
          onOrderCountChange={setOrderCount}
          onAvgOrderSizeChange={setAvgOrderSize}
        />

        {/* Center - Canvas (only when warehouse is loaded) */}
        {!warehouse ? (
          <div className="flex-1 flex items-center justify-center bg-muted/20">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">{isLoading ? 'Loading...' : 'No warehouse configured.'}</p>
              {!isLoading && (
                <Button onClick={() => setShowLayoutConfig(true)}>
                  Configure Warehouse
                </Button>
              )}
            </div>
          </div>
        ) : (
        <div className="flex-1 flex flex-col overflow-hidden gap-0">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              onClear={handleClearWarehouse}
              onOpenLayoutConfig={() => setShowLayoutConfig(true)}
              onNewWarehouse={handleNewWarehouse}
              zVisualizationMode={zVisualizationMode}
              onZVisualizationChange={setZVisualizationMode}
              workerCount={workerCount}
              onWorkerCountChange={setWorkerCount}
            />
          </div>

          {/* Canvas — React Flow workspace */}
          <WarehouseFlow
            workspaceWarehouses={workspaceWarehouses}
            activeWarehouseId={activeWarehouseId}
            onSelectWarehouse={setActiveWarehouseId}
            onWarehouseChange={handleWarehouseChangePersisted}
            onDuplicateWarehouse={handleDuplicateWarehouse}
            onRenameWarehouse={handleRenameWarehouse}
            onDeleteWarehouse={handleDeleteWarehouse}
            onPersistPosition={handlePersistPosition}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgressRef={animationProgressRef}
            zVisualizationMode={zVisualizationMode}
            animationReplayId={animationReplayId}
          />

          {/* Status Bar */}
          <div className="h-8 border-t border-border flex items-center px-4 text-xs text-muted-foreground bg-muted/20 shrink-0">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-medium">Grid:</span>
                <span className="font-mono">{warehouse.width} × {warehouse.height}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Locations:</span>
                <span className="font-mono">
                  {warehouse.grid.flat().filter(cell => cell.type === 'shelf').reduce((sum, cell) => sum + cell.locations.length, 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Worker:</span>
                <span className="font-mono">{warehouse.workerStart ? `(${warehouse.workerStart.x}, ${warehouse.workerStart.y})` : '–'}</span>
              </div>
              {activeStrategy && (
                <>
                  <div className="border-l border-border ml-2 pl-6" />
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Route:</span>
                    <span className="font-mono capitalize">{activeStrategy}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Right Panel - System State */}
        <SystemStatePanel
          results={simulationResults}
          readiness={readiness}
          isSimulating={isSimulating}
          activeStrategy={activeStrategy}
          onStrategySelect={handleStrategySelect}
          animationProgress={animationProgress}
          workerCount={workerCount}
          executionPlan={executionPlan}
          validationContext={validationContext}
          blockState={simulationBlockState}
          onViewUnresolvableItems={(itemIds) => setHighlightedMissingSkuIds(new Set(itemIds))}
          onSimulate={handleSimulateClick}
          onAddShelves={() => setSelectedTool('shelf')}
          onAddDemoOrders={handleAddDemoOrders}
          onSetWorkerStart={() => setSelectedTool('worker')}
          onZVisualizationChange={setZVisualizationMode}
        />
      </div>

      {/* Validation Modal */}
      {validationContext && (
        <ValidationModal
          open={showValidationModal}
          validationContext={validationContext}
          onClose={() => setShowValidationModal(false)}
          onFixItems={handleFixItems}
        />
      )}

      {showLayoutConfig && activeProjectId && (
        <LayoutConfigOverlay
          onClose={() => {
            // Only allow closing if a warehouse already exists
            if (hasExistingWarehouse) {
              setShowLayoutConfig(false);
            }
          }}
          canClose={hasExistingWarehouse}
          initialConfig={hasExistingWarehouse ? activeWarehouseConfig ?? undefined : undefined}
          onApply={async (config) => {
            setShowLayoutConfig(false);

            try {
              // Build the full WarehouseConfiguration from the overlay output
              const configuration: WarehouseConfiguration = {
                layout: {
                  type: config.type,
                  gridHeight: config.gridHeight,
                  rackCount: config.rackCount,
                  aisleWidth: config.aisleWidth,
                  crossAisleCount: config.crossAisleCount,
                  fbWidth: config.fbWidth,
                  fbHeight: config.fbHeight,
                  fbTheta: config.fbTheta,
                  fbI2: config.fbI2,
                  fbS: config.fbS,
                  fbAp: config.fbAp,
                },
                inventory: {
                  skuCount: config.inventory.length,
                  demandDistribution: config.demandDistribution,
                  productAffinity: config.productAffinity,
                  storageFootprint: config.storageFootprint,
                },
                placement: {
                  slottingBias: config.slottingBias,
                  categoryClustering: config.categoryClustering,
                },
              };

              const result = await generateAndSaveWarehouse(activeProjectId, {
                configuration,
                items: config.inventory,
                slottingBias: config.slottingBias,
                categoryClustering: config.categoryClustering,
                storageFootprint: config.storageFootprint,
                orderCount,
                avgOrderSize,
                warehouseId: activeWarehouseIdRef.current ?? undefined,
              });

              // Update the workspace entry with new warehouse data AND its own configuration
              setWorkspaceWarehouses((prev) =>
                prev.map((ww) =>
                  ww.id === activeWarehouseIdRef.current
                    ? {
                        ...ww,
                        warehouse: result.warehouse,
                        configuration: result.configuration,
                      }
                    : ww,
                ),
              );
              setOrders(result.orders);
              setHasExistingWarehouse(true);

              if (result.quantityViolations.length > 0) {
                console.warn('[Taro] Quantity invariant violations after placement:', result.quantityViolations);
              }

              const totalBinsWanted = config.inventory.reduce((sum, i) => sum + (i.storageFootprint ?? 1), 0);
              if (result.unplacedSkus.length > 0) {
                setSimulationBlockState({
                  simulationState: 'NO_VALID_ITEMS',
                  title: `${result.unplacedSkus.length} SKU${result.unplacedSkus.length === 1 ? '' : 's'} could not be placed`,
                  description: `The warehouse layout has only ${result.binCount} storage bins but the generated inventory requires ${totalBinsWanted} (placed ${result.placedBinCount}). Increase the rack count or reduce the SKU count / storage footprint so every SKU can be slotted. Unplaced: ${result.unplacedSkus.join(', ')}.`,
                });
              } else {
                setSimulationBlockState(null);
              }

              setSimulationResults(null);
              setIsSimulating(false);
              setActiveStrategy(null);
              setAnimationProgress(0);
              setExecutionPlanStrategy(null);
              setValidationContext(null);
              setValidationResult(null);
              setShowValidationModal(false);
              setHighlightedMissingSkuIds(null);
              setImportSummary('');
              resetAnimationState();
            } catch (err) {
              console.error('Failed to generate and save warehouse:', err);
              alert('Failed to save warehouse. Please try again.');
            }
          }}
        />
      )}

      {showNewWarehouseConfig && activeProjectId && (
        <LayoutConfigOverlay
          onClose={() => {
            setShowNewWarehouseConfig(false);
          }}
          canClose={true}
          onApply={async (config) => {
            setShowNewWarehouseConfig(false);

            try {
              // Build the full WarehouseConfiguration from the overlay output
              const configuration: WarehouseConfiguration = {
                layout: {
                  type: config.type,
                  gridHeight: config.gridHeight,
                  rackCount: config.rackCount,
                  aisleWidth: config.aisleWidth,
                  crossAisleCount: config.crossAisleCount,
                  fbWidth: config.fbWidth,
                  fbHeight: config.fbHeight,
                  fbTheta: config.fbTheta,
                  fbI2: config.fbI2,
                  fbS: config.fbS,
                  fbAp: config.fbAp,
                },
                inventory: {
                  skuCount: config.inventory.length,
                  demandDistribution: config.demandDistribution,
                  productAffinity: config.productAffinity,
                  storageFootprint: config.storageFootprint,
                },
                placement: {
                  slottingBias: config.slottingBias,
                  categoryClustering: config.categoryClustering,
                },
              };

              const result = await generateAndSaveWarehouse(activeProjectId, {
                configuration,
                items: config.inventory,
                slottingBias: config.slottingBias,
                categoryClustering: config.categoryClustering,
                storageFootprint: config.storageFootprint,
                orderCount,
                avgOrderSize,
              });

              // Append new warehouse to the project (don't replace)
              const newName = `Warehouse ${workspaceWarehousesRef.current.length + 1}`;
              setWorkspaceWarehouses((prev) => [
                ...prev,
                {
                  id: result.warehouseId,
                  name: newName,
                  position: null,
                  warehouse: result.warehouse,
                  configuration: result.configuration,
                },
              ]);
              setActiveWarehouseId(result.warehouseId);

              // Use new warehouse's orders
              setOrders(result.orders);
              setHasExistingWarehouse(true);

              if (result.quantityViolations.length > 0) {
                console.warn('[Taro] Quantity invariant violations after placement:', result.quantityViolations);
              }

              const totalBinsWanted = config.inventory.reduce((sum, i) => sum + (i.storageFootprint ?? 1), 0);
              if (result.unplacedSkus.length > 0) {
                setSimulationBlockState({
                  simulationState: 'NO_VALID_ITEMS',
                  title: `${result.unplacedSkus.length} SKU${result.unplacedSkus.length === 1 ? '' : 's'} could not be placed`,
                  description: `The warehouse layout has only ${result.binCount} storage bins but the generated inventory requires ${totalBinsWanted} (placed ${result.placedBinCount}). Increase the rack count or reduce the SKU count / storage footprint so every SKU can be slotted. Unplaced: ${result.unplacedSkus.join(', ')}.`,
                });
              } else {
                setSimulationBlockState(null);
              }

              setSimulationResults(null);
              setIsSimulating(false);
              setActiveStrategy(null);
              setAnimationProgress(0);
              setExecutionPlanStrategy(null);
              setValidationContext(null);
              setValidationResult(null);
              setShowValidationModal(false);
              setHighlightedMissingSkuIds(null);
              setImportSummary('');
              resetAnimationState();
            } catch (err) {
              console.error('Failed to generate and save warehouse:', err);
              alert('Failed to save warehouse. Please try again.');
            }
          }}
        />
      )}
    </div>
  );
}
