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
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import {
  generateRandomOrders,
  createEmptyWarehouse,
  generateSkeletonWarehouse,
} from '@/lib/taro/demo-generator';
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseFlow } from './warehouse-flow';
import { WorkbenchDock } from './workbench-dock';
import { WorkspacePanel } from './workspace-panel';
import { Toolbar } from './toolbar';
import { LayoutConfigOverlay, type LayoutConfig } from './layout-config-overlay';
import { ValidationModal } from './validation-modal';
import { Button } from '@/components/ui/button';
import { getMissingSkuIds, validateItems, type ItemsValidationResult } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { reconcile } from '@/lib/taro/corrector';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';

interface TaroAppProps {
  /**
   * Legacy prop (dashboard era) — no longer used. The app always boots a
   * fresh in-memory session; kept for callers that still pass it.
   */
  initialProjectId?: string;
}

export function TaroApp(_props: TaroAppProps) {
  // Session-scoped id — every visit generates a brand-new warehouse. The
  // value is only used to name the entry and to key per-warehouse state;
  // nothing is ever persisted.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    crypto.randomUUID(),
  );
  const [workspaceWarehouses, setWorkspaceWarehouses] = useState<WorkspaceWarehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);
  // Multi-select set for shift-click operations on canvas and workspace list.
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(new Set());

  // Which dock panel is open — only one at a time across all docks.
  // 'workspace' | 'workbench' | null
  const [openDockId, setOpenDockId] = useState<string | null>(null);

  /** Set a dock open/closed explicitly; opening one closes any other. */
  const setDockOpen = useCallback((id: string, open: boolean) => {
    setOpenDockId(open ? id : null);
  }, []);

  // Derived: the currently selected warehouse (drives all panels).
  const warehouse = useMemo(() => {
    if (!activeWarehouseId) return null;
    return workspaceWarehouses.find((w) => w.id === activeWarehouseId)?.warehouse ?? null;
  }, [activeWarehouseId, workspaceWarehouses]);

  // Derived: lookup maps for staleness (avoid recomputing signatures in the memo)
  const wwWarehouseMap = useMemo(
    () => Object.fromEntries(workspaceWarehouses.map((w) => [w.id, w.warehouse])),
    [workspaceWarehouses],
  );

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
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const [isLoading, setIsLoading] = useState(true);
  // Warehouse generation — shown in LayoutConfigOverlay Apply button
  const [isGenerating, setIsGenerating] = useState(false);
  // Demo orders generation
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  // In-flight rename tracking
  const [renamingWarehouseId, setRenamingWarehouseId] = useState<string | null>(null);
  // CSV import
  const [isImporting, setIsImporting] = useState(false);
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
  const [projectName, setProjectName] = useState<string>('Untitled');
  const [importSummary, setImportSummary] = useState<string>('');
  const [executionPlanStrategy, setExecutionPlanStrategy] = useState<StrategyType | null>(null);
  const [validationContext, setValidationContext] = useState<SimulationValidationContext | null>(null);
  const [validationResult, setValidationResult] = useState<ItemsValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showLayoutConfig, setShowLayoutConfig] = useState(false);
  const [showNewWarehouseConfig, setShowNewWarehouseConfig] = useState(false);
  const [hasExistingWarehouse, setHasExistingWarehouse] = useState(false);
  const hasExistingWarehouseRef = useRef(hasExistingWarehouse);
  hasExistingWarehouseRef.current = hasExistingWarehouse;
  const [highlightedMissingSkuIds, setHighlightedMissingSkuIds] = useState<Set<string> | null>(null);
  const [simulationBlockState, setSimulationBlockState] = useState<SimulationBlockState | null>(null);
  const [orderCount, setOrderCount] = useState(1000);
  const [avgOrderSize, setAvgOrderSize] = useState(5);

  const handleNewWarehouse = useCallback(() => {
    setShowNewWarehouseConfig(true);
  }, []);

  /**
   * Unified warehouse selection handler used by both the canvas and the
   * workspace list. Without modifiers, replaces the selection and sets the
   * warehouse as active. With shift, toggles the warehouse in the multi-select
   * set and also sets it as active so the right-hand panel follows.
   */
  const handleSelectWarehouse = useCallback(
    (warehouseId: string, opts?: { additive?: boolean }) => {
      if (opts?.additive) {
        setSelectedWarehouseIds((prev) => {
          const next = new Set(prev);
          if (next.has(warehouseId)) {
            next.delete(warehouseId);
          } else {
            next.add(warehouseId);
          }
          return next;
        });
      } else {
        setSelectedWarehouseIds(new Set([warehouseId]));
      }
      setActiveWarehouseId(warehouseId);

      // Hidden corrector — the shared order set may reference SKUs missing
      // from the newly-selected warehouse's catalog; reconcile before the
      // readiness memo (which gates Simulate) reads them.
      const ww = workspaceWarehousesRef.current.find((w) => w.id === warehouseId);
      if (ww && ww.id !== activeWarehouseIdRef.current) {
        const corrected = reconcile(ww.warehouse, ordersRef.current);
        if (corrected.orders !== ordersRef.current) {
          setOrders(corrected.orders);
        }
        if (corrected.warehouse !== ww.warehouse) {
          setWorkspaceWarehouses((prev) =>
            prev.map((w) => (w.id === warehouseId ? { ...w, warehouse: corrected.warehouse } : w)),
          );
        }
      }
    },
    []
  );

  const handleOpenLayoutConfig = useCallback((warehouseId: string) => {
    // First select the warehouse, then open the layout config
    setActiveWarehouseId(warehouseId);
    setShowLayoutConfig(true);
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
    const source = workspaceWarehousesRef.current.find(
      (w) => w.id === sourceWarehouseId,
    );
    if (!source) return;

    // In-memory duplicate — deep copy the layout (grid is an array of cell
    // objects; React Flow / the corrector treat these as immutable, so a
    // fresh array + fresh cell objects keep the copies fully independent).
    const sourceWh = source.warehouse;
    const newId = crypto.randomUUID();
    const copy: Warehouse = {
      ...sourceWh,
      grid: sourceWh.grid.map((row) =>
        row.map((cell) => ({ ...cell, locations: cell.locations.map((l) => ({ ...l })) })),
      ),
      shelves: sourceWh.shelves.map((s) => ({ ...s })),
      locations: sourceWh.locations.map((l) => ({ ...l })),
      workerStart: sourceWh.workerStart ? { ...sourceWh.workerStart } : null,
    };
    const base = source.name.replace(/ \(copy( \d+)?\)$/, '');
    const existingCopies = workspaceWarehousesRef.current.filter((w) =>
      w.name.startsWith(base + ' (copy'),
    );
    const newEntry: WorkspaceWarehouse = {
      id: newId,
      name:
        existingCopies.length === 0
          ? `${base} (copy)`
          : `${base} (copy ${existingCopies.length + 1})`,
      position: null, // new duplicates start at auto-layout
      warehouse: copy,
      configuration: source.configuration,
    };
    setWorkspaceWarehouses((prev) => [...prev, newEntry]);

    // Auto-select the new duplicate
    setActiveWarehouseId(newId);

    // If the source was the active warehouse, adopt its orders
    const sourceOrders = ordersRef.current;
    if (sourceWarehouseId === activeWarehouseIdRef.current && sourceOrders.length > 0) {
      // Hidden corrector — reconcile the duplicate's warehouse + orders so the
      // newly-active warehouse never carries stale/invalid order lines.
      const corrected = reconcile(copy, sourceOrders);
      setOrders(corrected.orders);
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
  }, [resetAnimationState]);

  // ── Workspace: Rename ────────────────────────────────────────────────────

  const handleRenameWarehouse = useCallback(async (warehouseId: string, name: string) => {
    // Optimistically update local state
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) => (ww.id === warehouseId ? { ...ww, name } : ww)),
    );
  }, []);

  // ── Workspace: Delete ────────────────────────────────────────────────────

  const handleDeleteWarehouse = useCallback(async (warehouseId: string) => {
    // Guard: prevent deleting the last warehouse
    if (workspaceWarehousesRef.current.length <= 1) {
      alert('Cannot delete the last warehouse. Create another warehouse first.');
      return;
    }

    // Remove from local state
    const removedIndex = workspaceWarehousesRef.current.findIndex((w) => w.id === warehouseId);
    const isActive = activeWarehouseIdRef.current === warehouseId;

    setWorkspaceWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));

    // Remove the deleted warehouse from the multi-select set
    setSelectedWarehouseIds((prev) => {
      if (!prev.has(warehouseId)) return prev;
      const next = new Set(prev);
      next.delete(warehouseId);
      return next;
    });

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
  }, [resetAnimationState]);

  // ── Workspace: Position ──────────────────────────────────────────────────

  const handlePersistPosition = useCallback(async (warehouseId: string, x: number, y: number) => {
    // Update local state immediately — session-only, nothing to persist.
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) =>
        ww.id === warehouseId ? { ...ww, position: { x, y } } : ww,
      ),
    );
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

  // Debounced (no-op) persistence of canvas edits — layout edits stay in
  // memory for the session; the timer keeps the reconcile (hidden corrector)
  // debounce behaviour identical to the persisted flow.
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
      // Hidden corrector — run ONCE after drawing pauses (debounced, not
      // per-cell) so readiness stays clean. Idempotent.
      const corrected = reconcile(newWh, ordersRef.current);
      const isActive = whId === activeWarehouseIdRef.current;
      if (isActive && corrected.orders !== ordersRef.current) {
        setOrders(corrected.orders);
      }
      if (corrected.warehouse !== newWh || !isActive) {
        setWorkspaceWarehouses((prev) =>
          prev.map((ww) =>
            ww.id === whId ? { ...ww, warehouse: corrected.warehouse } : ww,
          ),
        );
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
          // Hidden corrector — fix everything before running, silently.
          const corrected = reconcile(warehouse, orders);
          const results = runSimulation(corrected.warehouse, corrected.orders, workerCount, {
            warehouseProfile,
            laborProfile,
          });

          setSimulationResults(results);
          setIsSimulating(false);
          setValidationContext(null);
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

    // Hidden corrector — fix everything silently BEFORE deciding whether the
    // simulation can run. A blocked state (missing items, unreachable
    // locations) should never surface: the corrector resolves it first.
    const corrected = reconcile(warehouse, orders);

    // Commit the corrected state unconditionally (idempotent when clean) so
    // readiness + the actual run always operate on clean data.
    if (corrected.warehouse !== warehouse || corrected.orders !== orders) {
      setWorkspaceWarehouses((prev) =>
        prev.map((ww) =>
          ww.id === activeWarehouseIdRef.current
            ? { ...ww, warehouse: corrected.warehouse }
            : ww,
        ),
      );
      setOrders(corrected.orders);
    }

    const correctedReadiness = evaluateReadiness(
      corrected.warehouse,
      corrected.orders,
      zVisualizationMode,
      validateItems(corrected.orders, corrected.warehouse),
    );

    if (!correctedReadiness.isReady) {
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
      return;
    }

    setSimulationBlockState(null);
    runSimulationFlow();
  }, [warehouse, orders, zVisualizationMode, runSimulationFlow]);

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

    setIsImporting(true);
    try {
      const csvText = await file.text();
      const { warehouse: importedWarehouse, summary } = parseWarehouseCsv(csvText);
      // Hidden corrector — CSV rows can collide on ids or land out of bounds;
      // repair before commit so readiness + simulation are clean.
      const corrected = reconcile(importedWarehouse, []);
      updateActiveWarehouse(corrected.warehouse);
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
      setIsImporting(false);
      event.target.value = '';
    }
  }, [updateActiveWarehouse]);

  const handleAddDemoOrders = useCallback(async () => {
    if (!warehouse) return;
    setIsGeneratingOrders(true);
    try {
      // Session-only: generate orders in the browser, never persist.
      const newOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
      // Hidden corrector — the generator may reference SKUs that placement
      // couldn't slot; reconcile before committing so readiness stays clean.
      const corrected = reconcile(warehouse, newOrders);
      setOrders(corrected.orders);
    } catch (err) {
      console.error('Failed to generate orders:', err);
      // Fallback: generate client-side
      const fallbackOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
      const corrected = reconcile(warehouse, fallbackOrders);
      setOrders(corrected.orders);
    } finally {
      setIsGeneratingOrders(false);
    }
  }, [warehouse, orderCount, avgOrderSize]);

  // 4. Side Effects
  useEffect(() => {
    // Boot a fresh in-memory session. Every visit generates a brand-new
    // warehouse — no database, no dashboard, no persistence.
    let cancelled = false;

    setActiveProjectId(crypto.randomUUID());
    setProjectName('Session');

    // Start with a skeleton warehouse so the user lands on the setup
    // overlay (first-time experience) but always has a warehouse behind it.
    const skeleton = generateSkeletonWarehouse();
    const skeletonId = crypto.randomUUID();
    const skeletonEntry: WorkspaceWarehouse = {
      id: skeletonId,
      name: 'Default Warehouse',
      position: null,
      warehouse: skeleton,
    };
    if (!cancelled) {
      setWorkspaceWarehouses([skeletonEntry]);
      setActiveWarehouseId(skeletonId);
      setHasExistingWarehouse(false);
      setShowLayoutConfig(true);
      setIsLoading(false);
    }

    return () => { cancelled = true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setSelectedTool((prev) => (prev === 'hand' ? 'select' : 'hand'));
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left dock stack — fixed column hugging the left edge: logo,
            warehouses, workbench */}
        <div className="fixed left-0 top-0 z-40 flex flex-col items-start gap-2 p-2 pointer-events-none">
          <div className="pointer-events-auto">
            <WorkspacePanel
              projectName={projectName}
              importSummary={importSummary}
              warehouses={workspaceWarehouses}
              activeWarehouseId={activeWarehouseId}
              selectedWarehouseIds={selectedWarehouseIds}
              onSelectWarehouse={handleSelectWarehouse}
              onRenameWarehouse={handleRenameWarehouse}
              onAddWarehouse={handleNewWarehouse}
              isOpen={openDockId === 'workspace'}
              onOpenChange={(open) => setDockOpen('workspace', open)}
            />
          </div>
          <div className="pointer-events-auto">
            <WorkbenchDock
              orders={orders}
              onGenerateOrders={handleAddDemoOrders}
              warehouse={warehouse ?? undefined}
              orderCount={orderCount}
              avgOrderSize={avgOrderSize}
              onOrderCountChange={setOrderCount}
              onAvgOrderSizeChange={setAvgOrderSize}
              simulationResults={simulationResults}
              readiness={readiness}
              isSimulating={isSimulating}
              activeStrategy={activeStrategy}
              onStrategySelect={handleStrategySelect}
              animationProgress={animationProgress}
              workerCount={workerCount}
              onWorkerCountChange={setWorkerCount}
              executionPlan={executionPlan}
              validationContext={validationContext}
              blockState={simulationBlockState}
              onViewUnresolvableItems={(itemIds) => setHighlightedMissingSkuIds(new Set(itemIds))}
              onSimulate={handleSimulateClick}
              onAddShelves={() => setSelectedTool('shelf')}
              onSetWorkerStart={() => setSelectedTool('worker')}
              onZVisualizationChange={setZVisualizationMode}
              isGeneratingOrders={isGeneratingOrders}
              isOpen={openDockId === 'workbench'}
              onOpenChange={(open) => setDockOpen('workbench', open)}
            />
          </div>
        </div>

        {/*
         * Center — Canvas.
         *
         * The React Flow workspace (warehouse nodes) is shown whenever the
         * workspace has at least one node. The empty-state editor only appears
         * when there are truly no warehouses at all (initial setup / loading
         * fallback).
         */}
        {workspaceWarehouses.length === 0 ? (
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
        <div className="flex-1 flex flex-col overflow-hidden gap-0 relative">
          {/* Canvas — React Flow workspace */}
          <WarehouseFlow
            workspaceWarehouses={workspaceWarehouses}
            activeWarehouseId={activeWarehouseId}
            onSelectWarehouse={handleSelectWarehouse}
            onWarehouseChange={handleWarehouseChangePersisted}
            onDuplicateWarehouse={handleDuplicateWarehouse}
            onRenameWarehouse={handleRenameWarehouse}
            onDeleteWarehouse={handleDeleteWarehouse}
            onOpenLayoutConfig={handleOpenLayoutConfig}
            duplicatingWarehouseId={null}
            deletingWarehouseId={null}
            renamingWarehouseId={renamingWarehouseId}
            onPersistPosition={handlePersistPosition}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgressRef={animationProgressRef}
            zVisualizationMode={zVisualizationMode}
            animationReplayId={animationReplayId}
          />

          {/* Floating controls row — bottom centre */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
            />
          </div>
        </div>
        )}

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
          isGenerating={isGenerating}
          onApply={async (config) => {
            setIsGenerating(true);
            try {
              // Build the full WarehouseConfiguration from the overlay output
              const configuration: WarehouseConfiguration = {
                layout: {
                  gridHeight: config.gridHeight,
                  rackCount: config.rackCount,
                  aisleWidth: config.aisleWidth,
                  crossAisleCount: config.crossAisleCount,
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

              // Session-only: generate entirely in the browser — no database.
              const result = generateWarehouseSession(configuration, orderCount, avgOrderSize);
              const warehouseId =
                activeWarehouseIdRef.current ?? crypto.randomUUID();

              // Update the workspace entry with new warehouse data and its own
              // configuration.
              // Hidden corrector — orders may reference unplaced SKUs;
              // reconcile both before commit so readiness stays clean.
              const corrected = reconcile(result.warehouse, result.orders);
              setWorkspaceWarehouses((prev) =>
                prev.map((ww) =>
                  ww.id === activeWarehouseIdRef.current
                    ? {
                        ...ww,
                        id: warehouseId,
                        warehouse: corrected.warehouse,
                        configuration,
                      }
                    : ww,
                ),
              );
              setActiveWarehouseId(warehouseId);
              setOrders(corrected.orders);
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
              console.error('Failed to generate warehouse:', err);
              alert('Failed to generate warehouse. Please try again.');
            } finally {
              setIsGenerating(false);
              setShowLayoutConfig(false);
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
          isGenerating={isGenerating}
          onApply={async (config) => {
            setIsGenerating(true);
            try {
              // Build the full WarehouseConfiguration from the overlay output
              const configuration: WarehouseConfiguration = {
                layout: {
                  gridHeight: config.gridHeight,
                  rackCount: config.rackCount,
                  aisleWidth: config.aisleWidth,
                  crossAisleCount: config.crossAisleCount,
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

              // Session-only: generate entirely in the browser — no database.
              const result = generateWarehouseSession(configuration, orderCount, avgOrderSize);

              // Append new warehouse to the workspace (don't replace)
              const newName = `Warehouse ${workspaceWarehousesRef.current.length + 1}`;
              // Hidden corrector — orders may reference unplaced SKUs;
              // reconcile against the new warehouse before commit.
              const corrected = reconcile(result.warehouse, result.orders);
              const newId = crypto.randomUUID();
              setWorkspaceWarehouses((prev) => [
                ...prev,
                {
                  id: newId,
                  name: newName,
                  position: null,
                  warehouse: corrected.warehouse,
                  configuration,
                },
              ]);
              setActiveWarehouseId(newId);

              // Use new warehouse's orders
              setOrders(corrected.orders);
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
              console.error('Failed to generate warehouse:', err);
              alert('Failed to generate warehouse. Please try again.');
            } finally {
              setIsGenerating(false);
              setShowNewWarehouseConfig(false);
            }
          }}
        />
      )}
    </div>
  );
}
