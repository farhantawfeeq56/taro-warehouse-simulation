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
  Comparison,
  ComparisonRunResult,
  ComparisonRunRecord,
} from '@/lib/taro/types';
import { warehouseSignature, ordersSignature } from '@/lib/taro/signatures';
import {
  generateRandomOrders,
  createEmptyWarehouse,
  generateSkeletonWarehouse,
} from '@/lib/taro/demo-generator';
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseFlow } from './warehouse-flow';
import { WorkbenchPanel } from './workbench-panel';
import { ComparisonPanel } from './comparison-panel';
import { WorkspacePanelAccessVariants } from './workspace-panel-access-variants';
import { Toolbar } from './toolbar';
import { GitCompareArrows, Loader2 } from 'lucide-react';
import { LayoutConfigOverlay, type LayoutConfig } from './layout-config-overlay';
import { ValidationModal } from './validation-modal';
import { Button } from '@/components/ui/button';
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
  createComparisonAction,
  updateComparisonAction,
  deleteComparisonAction,
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
  // Multi-select set for shift-click operations on canvas and workspace list.
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(new Set());
  // Comparisons — loaded from DB via the snapshot, persisted to the server.
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  // Which comparison is currently selected / being viewed (drives right panel).
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  // Cached simulation results per comparison (wrapped in a record with run-time
  // signatures so we can detect staleness).
  const [comparisonResultsById, setComparisonResultsById] = useState<
    Record<string, ComparisonRunRecord>
  >({});
  const [isComparing, setIsComparing] = useState(false);

  // Link mode — when non-null, the canvas is in "link warehouses to this
  // comparison" mode (see plan-comparison-canvas-association.md).
  const [linkModeComparisonId, setLinkModeComparisonId] = useState<string | null>(null);

  // Derived: the currently selected warehouse (drives all panels).
  const warehouse = useMemo(() => {
    if (!activeWarehouseId) return null;
    return workspaceWarehouses.find((w) => w.id === activeWarehouseId)?.warehouse ?? null;
  }, [activeWarehouseId, workspaceWarehouses]);

  // Derived: scoreboard data for each comparison node (derived from cached runs).
  const comparisonScores = useMemo(() => {
    const scores: Record<
      string,
      { winnerId: string | null; winnerName: string; winnerEfficiency: number } | null
    > = {};
    for (const [compId, record] of Object.entries(comparisonResultsById)) {
      const results = record.results;
      const valid = results.filter((r) => r.bestResult && !r.error);
      if (valid.length === 0) {
        scores[compId] = null;
      } else {
        const best = valid.reduce((a, b) =>
          (b.bestResult?.efficiency ?? 0) > (a.bestResult?.efficiency ?? 0)
            ? b
            : a,
        );
        scores[compId] = {
          winnerId: best.warehouseId,
          winnerName: best.warehouseName,
          winnerEfficiency: best.bestResult?.efficiency ?? 0,
        };
      }
    }
    return scores;
  }, [comparisonResultsById]);

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
  const comparisonsRef = useRef(comparisons);
  comparisonsRef.current = comparisons;

  const [orders, setOrders] = useState<Order[]>([]);

  // Derived: per-comparison staleness — true when a member warehouse or orders
  // changed since the last run.  Declared here (after `orders`) because the
  // memo reads `orders` directly.
  const comparisonStaleness = useMemo(() => {
    const stale: Record<string, boolean> = {};
    const currentOrdersSig = ordersSignature(orders);
    for (const [compId, record] of Object.entries(comparisonResultsById)) {
      const comp = comparisons.find((c) => c.id === compId);
      if (!comp) continue;
      const memLengthChanged =
        comp.warehouseIds.length !== Object.keys(record.warehouseSignatures).length;
      const memberChanged =
        memLengthChanged ||
        comp.warehouseIds.some((wid) => {
          const wh = wwWarehouseMap[wid];
          return wh
            ? warehouseSignature(wh) !== record.warehouseSignatures[wid]
            : true;
        });
      const ordersChanged = currentOrdersSig !== record.ordersSignature;
      stale[compId] = memberChanged || ordersChanged;
    }
    return stale;
  }, [comparisonResultsById, comparisons, wwWarehouseMap, orders]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Warehouse generation — shown in LayoutConfigOverlay Apply button
  const [isGenerating, setIsGenerating] = useState(false);
  // Warehouse duplicate/delete — drives spinner on canvas node buttons
  const [duplicatingWarehouseId, setDuplicatingWarehouseId] = useState<string | null>(null);
  const [deletingWarehouseId, setDeletingWarehouseId] = useState<string | null>(null);
  // Comparison creation — drives spinner on New Comparison button
  const [isCreatingComparison, setIsCreatingComparison] = useState(false);
  // Comparison deletion — drives spinner on WorkspacePanel delete button
  const [deletingComparisonId, setDeletingComparisonId] = useState<string | null>(null);
  // "Compare Selected" floating button
  const [isCreatingFromSelection, setIsCreatingFromSelection] = useState(false);
  // Demo orders generation
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  // In-flight rename tracking
  const [renamingWarehouseId, setRenamingWarehouseId] = useState<string | null>(null);
  const [renamingComparisonId, setRenamingComparisonId] = useState<string | null>(null);
  // Link-mode toggle membership — shows spinner on the badge
  const [togglingMembershipWarehouseId, setTogglingMembershipWarehouseId] = useState<string | null>(null);
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

  const handleNewComparison = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    setIsCreatingComparison(true);
    try {
      const comp = await createComparisonAction(projectId);
      setComparisons((prev) => [...prev, comp]);
      setActiveComparisonId(comp.id);
    } catch (err) {
      console.error('Failed to create comparison:', err);
    } finally {
      setIsCreatingComparison(false);
    }
  }, []);

  const handleSelectComparison = useCallback(
    (comparisonId: string, opts?: { additive?: boolean }) => {
      // Selecting a different comparison exits link mode.
      setLinkModeComparisonId((prev) =>
        prev === comparisonId ? prev : null,
      );
      setActiveComparisonId(comparisonId);
      setActiveWarehouseId(null);
    },
    [],
  );

  const handleRenameComparison = useCallback(async (comparisonId: string, name: string) => {
    setComparisons((prev) =>
      prev.map((c) => (c.id === comparisonId ? { ...c, name } : c)),
    );
    setRenamingComparisonId(comparisonId);
    try {
      await updateComparisonAction(comparisonId, { name });
    } catch (err) {
      console.error('Failed to rename comparison:', err);
    } finally {
      setRenamingComparisonId(null);
    }
  }, []);

  const handleDeleteComparison = useCallback(async (comparisonId: string) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    setComparisons((prev) => prev.filter((c) => c.id !== comparisonId));
    if (activeComparisonId === comparisonId) {
      setActiveComparisonId(null);
    }
    setDeletingComparisonId(comparisonId);
    try {
      await deleteComparisonAction(comparisonId, projectId);
    } catch (err) {
      console.error('Failed to delete comparison:', err);
    } finally {
      setDeletingComparisonId(null);
    }
  }, []);

  const handleAddComparisonWarehouse = useCallback(
    async (comparisonId: string, warehouseId: string) => {
      const comp = comparisons.find((c) => c.id === comparisonId);
      if (!comp) return;
      const next = [...comp.warehouseIds, warehouseId];
      setComparisons((prev) =>
        prev.map((c) => (c.id === comparisonId ? { ...c, warehouseIds: next } : c)),
      );
      try {
        await updateComparisonAction(comparisonId, { warehouseIds: next });
      } catch (err) {
        console.error('Failed to add warehouse to comparison:', err);
      }
    },
    [comparisons],
  );

  const handleRemoveComparisonWarehouse = useCallback(
    async (comparisonId: string, warehouseId: string) => {
      const comp = comparisons.find((c) => c.id === comparisonId);
      if (!comp) return;
      const next = comp.warehouseIds.filter((id) => id !== warehouseId);
      setComparisons((prev) =>
        prev.map((c) =>
          c.id === comparisonId ? { ...c, warehouseIds: next } : c,
        ),
      );
      try {
        await updateComparisonAction(comparisonId, { warehouseIds: next });
      } catch (err) {
        console.error('Failed to remove warehouse from comparison:', err);
      }
    },
    [comparisons],
  );

  const handleRunComparison = useCallback(
    (comparisonId: string) => {
      const comp = comparisons.find((c) => c.id === comparisonId);
      // Guard: we need a valid comparison with at least one member and orders.
      // NOTE: `warehouse` (the singularity active warehouse) is intentionally
      // NOT checked because Run targets the *comparison* — each member
      // warehouse's layout is read from workspaceWarehousesRef.current in the
      // loop below.
      if (!comp || comp.warehouseIds.length === 0 || orders.length === 0) return;

      setIsComparing(true);
      requestAnimationFrame(() => {
        try {
          const results: ComparisonRunResult[] = [];
          for (const wid of comp.warehouseIds) {
            const ww = workspaceWarehousesRef.current.find((w) => w.id === wid);
            if (!ww || !ww.warehouse.workerStart) {
              results.push({
                comparisonId,
                warehouseId: wid,
                warehouseName: ww?.name ?? 'Unknown',
                bestResult: null,
                allResults: [],
                error: 'Warehouse not found or missing worker start',
              });
              continue;
            }
            try {
              const simResults = runSimulation(
                ww.warehouse,
                orders,
                workerCount,
                { warehouseProfile, laborProfile },
              );
              const strategies = simResults.strategies;
              const best =
                strategies.length > 0
                  ? strategies.reduce((a, b) =>
                      b.efficiency > a.efficiency ? b : a,
                    )
                  : null;
              results.push({
                comparisonId,
                warehouseId: wid,
                warehouseName: ww.name,
                bestResult: best,
                allResults: strategies,
                error: null,
              });
            } catch {
              results.push({
                comparisonId,
                warehouseId: wid,
                warehouseName: ww.name,
                bestResult: null,
                allResults: [],
                error: 'Simulation failed',
              });
            }
          }
          // Capture signatures for staleness detection
          const warehouseSignatures: Record<string, string> = {};
          for (const wid of comp.warehouseIds) {
            const ww = workspaceWarehousesRef.current.find((w) => w.id === wid);
            if (ww) {
              warehouseSignatures[wid] = warehouseSignature(ww.warehouse);
            }
          }
          setComparisonResultsById((prev) => ({
            ...prev,
            [comparisonId]: {
              results,
              ranAt: Date.now(),
              warehouseSignatures,
              ordersSignature: ordersSignature(orders),
            },
          }));
          setActiveComparisonId(comparisonId);
        } finally {
          setIsComparing(false);
        }
      });
    },
    [comparisons, orders, workerCount, warehouseProfile, laborProfile],
  );

  // ── Link-mode helpers ────────────────────────────────────────────────

  const handleToggleComparisonMembership = useCallback(
    (comparisonId: string, warehouseId: string) => {
      setComparisons((prev) => {
        const comp = prev.find((c) => c.id === comparisonId);
        if (!comp) return prev;
        const isMember = comp.warehouseIds.includes(warehouseId);
        const nextWarehouseIds = isMember
          ? comp.warehouseIds.filter((id) => id !== warehouseId)
          : [...comp.warehouseIds, warehouseId];
        // Persist optimistically
        setTogglingMembershipWarehouseId(warehouseId);
        updateComparisonAction(comparisonId, {
          warehouseIds: nextWarehouseIds,
        })
          .catch(console.error)
          .finally(() => setTogglingMembershipWarehouseId(null));
        return prev.map((c) =>
          c.id === comparisonId ? { ...c, warehouseIds: nextWarehouseIds } : c,
        );
      });
    },
    [],
  );

  const handleStartLink = useCallback((comparisonId: string) => {
    setActiveComparisonId(comparisonId);
    setActiveWarehouseId(null);
    setLinkModeComparisonId(comparisonId);
  }, []);

  const handleExitLink = useCallback(() => {
    setLinkModeComparisonId(null);
  }, []);

  // Auto-exit link mode when the target comparison is no longer available.
  useEffect(() => {
    if (
      linkModeComparisonId &&
      !comparisons.find((c) => c.id === linkModeComparisonId)
    ) {
      setLinkModeComparisonId(null);
    }
  }, [linkModeComparisonId, comparisons]);

  // ── "Compare Selected" handler ───────────────────────────────────────

  const handleCompareSelected = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || selectedWarehouseIds.size < 2) return;

    const warehouseIds = [...selectedWarehouseIds];
    setIsCreatingFromSelection(true);
    try {
      const comp = await createComparisonAction(projectId, undefined, warehouseIds);
      setComparisons((prev) => [...prev, comp]);
      setActiveComparisonId(comp.id);
      setActiveWarehouseId(null);
      setSelectedWarehouseIds(new Set());
      setLinkModeComparisonId(null);
    } catch (err) {
      console.error('Failed to create comparison from selection:', err);
    } finally {
      setIsCreatingFromSelection(false);
    }
  }, [selectedWarehouseIds]);

  /**
   * Unified warehouse selection handler used by both the canvas and the
   * workspace list. Without modifiers, replaces the selection and sets the
   * warehouse as active. With shift, toggles the warehouse in the multi-select
   * set and also sets it as active so the right-hand panel follows.
   */
  const handleSelectWarehouse = useCallback(
    (warehouseId: string, opts?: { additive?: boolean }) => {
      setLinkModeComparisonId(null); // exit link mode on warehouse select
      setActiveComparisonId(null);
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
    if (!activeProjectId) return;
    setDuplicatingWarehouseId(sourceWarehouseId);
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
    } finally {
      setDuplicatingWarehouseId(null);
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

    setRenamingWarehouseId(warehouseId);
    try {
      await renameWarehouseAction(warehouseId, name, projectId);
    } catch (err) {
      console.error('Failed to rename warehouse:', err);
      // Revert by reloading on error — simplest rollback
      const snapshot = await loadProject(projectId);
      setWorkspaceWarehouses(snapshot.workspaceWarehouses);
    } finally {
      setRenamingWarehouseId(null);
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

    setDeletingWarehouseId(warehouseId);
    try {
      await deleteWarehouseAction(warehouseId, projectId);

      // Remove from local state
      const removedIndex = workspaceWarehousesRef.current.findIndex((w) => w.id === warehouseId);
      const isActive = activeWarehouseIdRef.current === warehouseId;

      setWorkspaceWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));

      // Remove deleted warehouse from multi-select set
      setSelectedWarehouseIds((prev) => {
        if (!prev.has(warehouseId)) return prev;
        const next = new Set(prev);
        next.delete(warehouseId);
        return next;
      });

      // Remove the deleted warehouse from all comparisons that reference it.
      setComparisons((prev) =>
        prev.map((c) =>
          c.warehouseIds.includes(warehouseId)
            ? { ...c, warehouseIds: c.warehouseIds.filter((id) => id !== warehouseId) }
            : c,
        ),
      );
      // Persist each affected comparison using the current ref value (the
      // callback is memoized without `comparisons` in its deps, so the closure
      // `comparisons` would be stale from the initial render).
      for (const c of comparisonsRef.current) {
        if (c.warehouseIds.includes(warehouseId)) {
          const updated = c.warehouseIds.filter((id) => id !== warehouseId);
          updateComparisonAction(c.id, { warehouseIds: updated }).catch(
            console.error,
          );
        }
      }

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
    } finally {
      setDeletingWarehouseId(null);
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

  const handlePersistComparisonPosition = useCallback(
    async (comparisonId: string, x: number, y: number) => {
      setComparisons((prev) =>
        prev.map((c) =>
          c.id === comparisonId ? { ...c, positionX: x, positionY: y } : c,
        ),
      );
      try {
        await updateComparisonAction(comparisonId, { positionX: x, positionY: y });
      } catch (err) {
        console.error('Failed to save comparison position:', err);
      }
    },
    [],
  );

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
        saveWarehouseLayout(pid, newWh, whId).catch((err) => {
          console.error(err);
        });
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

    setIsImporting(true);
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
      setIsImporting(false);
      event.target.value = '';
    }
  }, [updateActiveWarehouse]);

  const handleAddDemoOrders = useCallback(async () => {
    if (!warehouse || !activeProjectId) return;
    setIsGeneratingOrders(true);
    try {
      const newOrders = await saveOrders(activeProjectId, warehouse, orderCount, avgOrderSize, activeWarehouseId ?? undefined);
      setOrders(newOrders);
    } catch (err) {
      console.error('Failed to save orders:', err);
      // Fallback: generate client-side
      const fallbackOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
      setOrders(fallbackOrders);
    } finally {
      setIsGeneratingOrders(false);
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
        setProjectName(snapshot.projectName);
        setWorkspaceWarehouses(snapshot.workspaceWarehouses);
        setComparisons(snapshot.comparisons ?? []);
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
          setProjectName('Offline Project');
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Workspace (warehouses + comparisons) — vartest10 collapsed access points */}
        <WorkspacePanelAccessVariants
          onBackToDashboard={onBackToDashboard ?? undefined}
          projectName={projectName}
          importSummary={importSummary}
          warehouses={workspaceWarehouses}
          activeWarehouseId={activeWarehouseId}
          selectedWarehouseIds={selectedWarehouseIds}
          onSelectWarehouse={handleSelectWarehouse}
          onRenameWarehouse={handleRenameWarehouse}
          comparisons={comparisons}
          activeComparisonId={activeComparisonId}
          onSelectComparison={handleSelectComparison}
          onRenameComparison={handleRenameComparison}
          onDeleteComparison={handleDeleteComparison}
          onAddWarehouse={handleNewWarehouse}
          onNewComparison={handleNewComparison}
          isCreatingComparison={isCreatingComparison}
          deletingComparisonId={deletingComparisonId}
        />

        {/*
         * Center — Canvas.
         *
         * The React Flow workspace (warehouse nodes + comparison nodes +
         * derived edges) is shown whenever the workspace has at least one node,
         * regardless of whether a warehouse or a comparison is currently active.
         * We deliberately do NOT gate on the singular `warehouse` (derived from
         * activeWarehouseId) — selecting a comparison intentionally nulls the
         * active warehouse, but the canvas (with its comparison nodes) must
         * stay visible so the user can operate on the comparison (e.g. Link
         * Mode). The empty-state editor only appears when there are truly no
         * warehouses at all (initial setup / loading fallback).
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
            duplicatingWarehouseId={duplicatingWarehouseId}
            deletingWarehouseId={deletingWarehouseId}
            renamingWarehouseId={renamingWarehouseId}
            togglingMembershipWarehouseId={togglingMembershipWarehouseId}
            onNewWarehouse={handleNewWarehouse}
            workerCount={workerCount}
            onWorkerCountChange={setWorkerCount}
            onPersistPosition={handlePersistPosition}
            comparisons={comparisons}
            activeComparisonId={activeComparisonId}
            warehouseNames={Object.fromEntries(
              workspaceWarehouses.map((w) => [w.id, w.name]),
            )}
            onSelectComparison={handleSelectComparison}
            onRenameComparison={handleRenameComparison}
            onDeleteComparison={handleDeleteComparison}
            onPersistComparisonPosition={handlePersistComparisonPosition}
            comparisonScores={comparisonScores}
            comparisonStaleness={comparisonStaleness}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgressRef={animationProgressRef}
            zVisualizationMode={zVisualizationMode}
            animationReplayId={animationReplayId}
            // Link mode
            linkModeComparisonId={linkModeComparisonId}
            onToggleMember={handleToggleComparisonMembership}
            onStartLink={handleStartLink}
            onExitLink={handleExitLink}
          />

          {/* Floating controls row — bottom centre */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
            {/* Compare Selected — only when 2+ selected and not in link mode */}
            {!linkModeComparisonId && selectedWarehouseIds.size >= 2 && (
              <button
                onClick={handleCompareSelected}
                disabled={isCreatingFromSelection}
                className="
                  flex items-center gap-1.5 px-3 py-1.5
                  bg-surface/90 backdrop-blur-sm text-xs font-medium
                  border border-accent/30 rounded-lg shadow-md
                  text-accent hover:bg-accent-soft hover:border-accent/50
                  active:bg-accent-subtle transition-colors
                  disabled:opacity-70 disabled:cursor-not-allowed
                "
              >
                {isCreatingFromSelection ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCompareArrows className="h-3.5 w-3.5" />
                )}
                Compare {selectedWarehouseIds.size} selected
              </button>
            )}
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
            />
          </div>
        </div>
        )}

        {/* Right Panel — warehouse workbench or comparison view */}
        {activeComparisonId && comparisons.some((c) => c.id === activeComparisonId) ? (
          <ComparisonPanel
            comparison={comparisons.find((c) => c.id === activeComparisonId)!}
            warehouses={workspaceWarehouses}
            results={comparisonResultsById[activeComparisonId]?.results ?? null}
            isRunning={isComparing}
            isStale={comparisonStaleness[activeComparisonId] ?? false}
            allWarehouseNames={
              Object.fromEntries(workspaceWarehouses.map((w) => [w.id, w.name]))
            }
            onRun={handleRunComparison}
            onAddWarehouse={handleAddComparisonWarehouse}
            onRemoveWarehouse={handleRemoveComparisonWarehouse}
          />
        ) : (
          <WorkbenchPanel
            configuration={activeWarehouseConfig}
            onEditConfig={() => setShowLayoutConfig(true)}
          orders={orders}
          onOrdersChange={setOrders}
          warehouse={warehouse ?? undefined}
          highlightedMissingSkuIds={highlightedMissingSkuIds}
          onClearHighlights={() => setHighlightedMissingSkuIds(null)}
          orderCount={orderCount}
          avgOrderSize={avgOrderSize}
          onOrderCountChange={setOrderCount}
          onAvgOrderSizeChange={setAvgOrderSize}
          onAddDemoOrders={handleAddDemoOrders}
          simulationResults={simulationResults}
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
          onSetWorkerStart={() => setSelectedTool('worker')}
          onZVisualizationChange={setZVisualizationMode}
          isGeneratingOrders={isGeneratingOrders}
          />
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

              const result = await generateAndSaveWarehouse(activeProjectId, {
                configuration,
                items: config.inventory,
                slottingBias: config.slottingBias,
                categoryClustering: config.categoryClustering,
                storageFootprint: config.storageFootprint,
                orderCount,
                avgOrderSize,
                // Only pass warehouseId when editing a persisted warehouse.
                // For first-time setup (skeleton entry not yet in DB) let
                // generateAndSaveWarehouse create a new record; the returned
                // result.warehouseId replaces the temporary id below.
                warehouseId: hasExistingWarehouse ? (activeWarehouseIdRef.current ?? undefined) : undefined,
              });

              // Update the workspace entry with new warehouse data, its own
              // configuration, and sync the id with the DB record.
              // Always use result.warehouseId afterwards so subsequent saves
              // (orders, layout, position) target the real persisted id.
              setWorkspaceWarehouses((prev) =>
                prev.map((ww) =>
                  ww.id === activeWarehouseIdRef.current
                    ? {
                        ...ww,
                        id: result.warehouseId, // sync with DB (no-op when editing)
                        warehouse: result.warehouse,
                        configuration: result.configuration,
                      }
                    : ww,
                ),
              );
              setActiveWarehouseId(result.warehouseId);
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
