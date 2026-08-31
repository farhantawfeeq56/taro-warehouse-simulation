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
import { MultiWarehouseScroll } from './multi-warehouse-scroll';
import { CompareView } from './compare-view';
import { RightSidebar } from './right-sidebar';
import { LayoutConfigOverlay, type LayoutConfig } from './layout-config-overlay';
import { ValidationModal } from './validation-modal';
import { CompareGateModal, type CompareGateState } from './compare-gate-modal';
import { findDuplicateGroups } from '@/lib/taro/warehouse-compare';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { getMissingSkuIds, validateItems, type ItemsValidationResult } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import type { ExperimentRecommendation } from '@/lib/taro/experiment-recommendation';
import { reconcile } from '@/lib/taro/corrector';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';

interface TaroAppProps {
  /**
   * Legacy prop (dashboard era) — no longer used. The app always boots a
   * fresh in-memory session; kept for callers that still pass it.
   */
  initialProjectId?: string;
}

/** Per-warehouse simulation state — a sim belongs to the warehouse it ran on. */
interface WarehouseSimState {
  results: SimulationResults | null;
  activeStrategy: StrategyType | null;
  executionPlanStrategy: StrategyType | null;
  blockState: SimulationBlockState | null;
}

/** Empty per-warehouse simulation state (no results, nothing selected). */
const EMPTY_SIM: WarehouseSimState = {
  results: null,
  activeStrategy: null,
  executionPlanStrategy: null,
  blockState: null,
};

export function TaroApp(_props: TaroAppProps) {
  // Session-scoped id — every visit generates a brand-new warehouse. The
  // value is only used to name the entry and to key per-warehouse state;
  // nothing is ever persisted.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    crypto.randomUUID(),
  );
  const [workspaceWarehouses, setWorkspaceWarehouses] = useState<WorkspaceWarehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);

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
  const activeWarehouseIdRef = useRef(activeWarehouseId);
  activeWarehouseIdRef.current = activeWarehouseId;
  const workspaceWarehousesRef = useRef(workspaceWarehouses);
  workspaceWarehousesRef.current = workspaceWarehouses;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // ── Per-warehouse orders ────────────────────────────────────────────────
  // Each warehouse owns its own generated order set. The active warehouse's
  // orders are mirrored into `orders` below (single source of truth for all
  // the existing panels), and the map keeps every warehouse independent so
  // switching warehouses restores its own orders.
  const [ordersByWarehouse, setOrdersByWarehouse] = useState<Record<string, Order[]>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const ordersByWarehouseRef = useRef(ordersByWarehouse);
  ordersByWarehouseRef.current = ordersByWarehouse;

  // Keep `orders` in sync with the active warehouse's own order set.
  useEffect(() => {
    if (!activeWarehouseId) return;
    const map = ordersByWarehouseRef.current;
    if (activeWarehouseId in map) {
      setOrders(map[activeWarehouseId]);
    } else if (Object.keys(map).length > 0) {
      setOrders([]);
    }
  }, [activeWarehouseId]);

  const [isLoading, setIsLoading] = useState(true);
  // Warehouse generation — shown in LayoutConfigOverlay Apply button
  const [isGenerating, setIsGenerating] = useState(false);
  // Demo orders generation
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  // CSV import
  const [isImporting, setIsImporting] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolType>('select');
  const [zVisualizationMode, setZVisualizationMode] = useState<ZVisualizationMode>('all');
  // Simulation state is keyed by warehouse id — running on one warehouse
  // never leaks routes/results onto another when you scroll.
  const [simByWarehouse, setSimByWarehouse] = useState<Record<string, WarehouseSimState>>({});
  const [isSimulating, setIsSimulating] = useState(false);
  // Animation progress ref → read by the canvas at 60 fps without React re-renders.
  // Throttled state mirror for the SystemStatePanel progress bars (~10 fps).
  const animationProgressRef = useRef(0);
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationProgressLastRenderedRef = useRef(0);
  const [workerCount, setWorkerCount] = useState(5);
  const [warehouseProfile, setWarehouseProfile] = useState<WarehouseProfile>({ ...DEFAULT_WAREHOUSE_PROFILE });
  const [laborProfile, setLaborProfile] = useState<LaborProfile>({ ...DEFAULT_LABOR_PROFILE });
  const [replaySpeed, setReplaySpeed] = useState<1 | 5 | 10>(1);
  const animationRef = useRef<number | null>(null);
  const replaySpeedRef = useRef(replaySpeed);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [validationContext, setValidationContext] = useState<SimulationValidationContext | null>(null);
  const [validationResult, setValidationResult] = useState<ItemsValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showLayoutConfig, setShowLayoutConfig] = useState(false);
  // When true, the LayoutConfigOverlay is in "add new warehouse" mode (the
  // existing single overlay is the edit-existing mode). Two overlays must stay
  // separate: edit-mode's onApply overwrites the active warehouse, whereas
  // add-mode must APPEND a brand-new warehouse.
  const [showNewWarehouseConfig, setShowNewWarehouseConfig] = useState(false);
  const [hasExistingWarehouse, setHasExistingWarehouse] = useState(false);
  // ── Comparison view (in-app route) ─────────────────────────────────────
  // `compareViewOpen` swaps the main canvas for a dedicated comparison page.
  // `compareBaseWarehouseId` is the warehouse the user clicked "Compare" on;
  // it becomes the fixed base column of the comparison table.
  const [compareViewOpen, setCompareViewOpen] = useState(false);
  const [compareBaseWarehouseId, setCompareBaseWarehouseId] = useState<string | null>(null);
  const [highlightedMissingSkuIds, setHighlightedMissingSkuIds] = useState<Set<string> | null>(null);
  const [orderCount, setOrderCount] = useState(50);
  const [avgOrderSize, setAvgOrderSize] = useState(3);

  const handleOpenLayoutConfig = useCallback((warehouseId: string) => {
    // First select the warehouse, then open the layout config
    setActiveWarehouseId(warehouseId);
    setShowLayoutConfig(true);
  }, []);

  // ── Workspace: Add ─────────────────────────────────────────────────────
  // Adds a blank skeleton warehouse and opens the layout config overlay so
  // the user immediately shapes it. The new warehouse becomes active (and the
  // scroll view auto-scrolls to it).
  const resetAnimationState = useCallback(() => {
    setAnimationProgress(0);
    animationProgressRef.current = 0;
    animationProgressLastRenderedRef.current = 0;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const handleAddWarehouse = useCallback(() => {
    // Don't append anything here — the new-warehouse overlay owns creation.
    // Only open the overlay; onApply appends the brand-new warehouse.
    setShowNewWarehouseConfig(true);
  }, []);

  // ── Workspace: Duplicate ───────────────────────────────────────────────
  const handleDuplicateWarehouse = useCallback((sourceWarehouseId: string) => {
    const source = workspaceWarehousesRef.current.find((w) => w.id === sourceWarehouseId);
    if (!source) return;

    // In-memory duplicate — deep copy the layout (grid is an array of cell
    // objects; the corrector treats these as immutable, so a fresh array +
    // fresh cell objects keep the copies fully independent).
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
      position: null,
      warehouse: copy,
      configuration: source.configuration,
    };
    setWorkspaceWarehouses((prev) => [...prev, newEntry]);

    // The duplicate inherits the source's orders so it's immediately ready.
    if (sourceWarehouseId in ordersByWarehouseRef.current) {
      setOrdersByWarehouse((prev) => ({
        ...prev,
        [newId]: ordersByWarehouseRef.current[sourceWarehouseId],
      }));
    }

    // Auto-select the new duplicate (scroll view follows). The duplicate
    // starts with no simulation state of its own.
    setActiveWarehouseId(newId);
    setIsSimulating(false);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    resetAnimationState();
  }, [resetAnimationState]);

  // ── Workspace: Rename ──────────────────────────────────────────────────
  const handleRenameWarehouse = useCallback((warehouseId: string, name: string) => {
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) => (ww.id === warehouseId ? { ...ww, name } : ww)),
    );
  }, []);

  // ── Workspace: Delete ──────────────────────────────────────────────────
  const handleDeleteWarehouse = useCallback((warehouseId: string) => {
    if (workspaceWarehousesRef.current.length <= 1) {
      alert('Cannot delete the last warehouse. Create another warehouse first.');
      return;
    }

    const removedIndex = workspaceWarehousesRef.current.findIndex((w) => w.id === warehouseId);
    const isActive = activeWarehouseIdRef.current === warehouseId;

    setWorkspaceWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));
    setOrdersByWarehouse((prev) => {
      const next = { ...prev };
      delete next[warehouseId];
      return next;
    });

    if (isActive) {
      const remaining = workspaceWarehousesRef.current.filter((w) => w.id !== warehouseId);
      if (remaining.length > 0) {
        // Pick the one at the same index, or the last one.
        const nextIndex = Math.min(removedIndex, remaining.length - 1);
        setActiveWarehouseId(remaining[nextIndex].id);
      } else {
        setActiveWarehouseId(null);
      }
    }

    setSimByWarehouse(prev => {
      const next = { ...prev };
      delete next[warehouseId];
      return next;
    });
    setIsSimulating(false);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    resetAnimationState();
  }, [resetAnimationState]);

  // ── Workspace: Compare ────────────────────────────────────────────────
  // Comparison needs at least two DIFFERENT warehouses to be meaningful.
  // Single warehouse → gate modal offers Add / Back. Duplicate layouts →
  // gate modal names them and tells the user to change one.
  const [compareGate, setCompareGate] = useState<CompareGateState | null>(null);
  const handleCompareWarehouse = useCallback((warehouseId: string) => {
    const all = workspaceWarehousesRef.current;
    if (all.length < 2) {
      setCompareGate({ mode: 'single', warehouseName: all[0]?.name ?? '' });
      return;
    }
    const dupGroups = findDuplicateGroups(all);
    if (dupGroups.length > 0) {
      setCompareGate({ mode: 'duplicates', groups: dupGroups });
      return;
    }
    // Jump to the comparison page with this warehouse pre-selected as the
    // base. The rest of the workspace state (warehouses, orders) stays in
    // TaroApp memory — the compare view is an in-app route, not a Next
    // navigation, so nothing is lost.
    setCompareBaseWarehouseId(warehouseId);
    setCompareViewOpen(true);
  }, []);

  // ── Workspace: Generate experiment warehouse ────────────────────────────
  // The AI recommendation hands us a full WarehouseConfiguration. We run the
  // same session pipeline as the normal New-Warehouse flow, append the result
  // to the workspace, and jump back to the warehouse screen so the user sees
  // the new experiment immediately.
  const handleGenerateExperiment = useCallback(
    async (constraintsRaw: string, recommendation: ExperimentRecommendation) => {
      // Session-only: generate entirely in the browser — no database.
      const result = generateWarehouseSession(
        recommendation.configuration,
        orderCount,
        avgOrderSize,
      );
      const newId = crypto.randomUUID();
      // Constraints (if any) go into the name so the experiment is identifiable.
      const suffix = constraintsRaw
        ? ` · ${constraintsRaw.trim().slice(0, 24)}`
        : '';
      const newName = `Experiment — ${recommendation.axis}${suffix}`;

      // Hidden corrector — orders may reference unplaced SKUs; reconcile
      // against the new warehouse before commit (same as New Warehouse).
      const corrected = reconcile(result.warehouse, result.orders);

      const newEntry: WorkspaceWarehouse = {
        id: newId,
        name: newName,
        position: null,
        warehouse: corrected.warehouse,
        configuration: recommendation.configuration,
      };

      // APPEND + activate, then close the compare page so the user lands on
      // the warehouse screen and sees the new experiment.
      setWorkspaceWarehouses((prev) => [...prev, newEntry]);
      setOrdersByWarehouse((prev) => ({ ...prev, [newId]: corrected.orders }));
      setActiveWarehouseId(newId);
      setOrders(corrected.orders);
      setHasExistingWarehouse(true);

      if (result.quantityViolations.length > 0) {
        console.warn('[Taro] Quantity invariant violations after experiment placement:', result.quantityViolations);
      }

      // No simulation state of its own until the user runs one.
      setSimByWarehouse((prev) => ({ ...prev, [newId]: { ...EMPTY_SIM } }));
      setIsSimulating(false);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
      resetAnimationState();

      // Leave the compare page — the warehouse screen shows the new experiment.
      setCompareViewOpen(false);
      setCompareBaseWarehouseId(null);
    },
    [orderCount, avgOrderSize, resetAnimationState],
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
    // Edits invalidate this warehouse's simulation — clear only its own state.
    const editingId = activeWarehouseIdRef.current;
    if (editingId) setSimByWarehouse(prev => ({ ...prev, [editingId]: EMPTY_SIM }));
    setIsSimulating(false);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    animationProgressRef.current = 0;
  }, []);

  // Debounced (no-op) persistence of canvas edits — layout edits stay in
  // memory for the session; the timer keeps the reconcile (hidden corrector)
  // debounce behaviour identical to the persisted flow.
  const saveLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deferred reconcile timer for the Generate/Update transition — lets the
  // canvas paint the raw warehouse before the (idempotent) hidden corrector
  // runs off the main paint path.
  const activeReconcileTimerRef = useRef<number | null>(null);
  const handleWarehouseChangePersisted = useCallback((
    whId: string,
    newWh: Warehouse,
  ) => {
    setWorkspaceWarehouses((prev) =>
      prev.map((ww) =>
        ww.id === whId ? { ...ww, warehouse: newWh } : ww,
      ),
    );
    // Edits invalidate this warehouse's simulation — clear only its own state.
    setSimByWarehouse(prev => ({ ...prev, [whId]: EMPTY_SIM }));
    setIsSimulating(false);
    setValidationContext(null);
    setValidationResult(null);
    setShowValidationModal(false);
    setHighlightedMissingSkuIds(null);
    animationProgressRef.current = 0;

    if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
    saveLayoutTimerRef.current = setTimeout(() => {
      // Hidden corrector — run ONCE after drawing pauses (debounced, not
      // per-cell) so readiness stays clean. Idempotent.
      const corrected = reconcile(newWh, ordersRef.current);
      const isActive = whId === activeWarehouseIdRef.current;
      if (isActive && corrected.orders !== ordersRef.current) {
        setOrders(corrected.orders);
        // Keep per-warehouse orders in sync too.
        setOrdersByWarehouse((prev) => ({ ...prev, [whId]: corrected.orders }));
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

  // The active warehouse's OWN simulation state — never another warehouse's.
  const activeSim = activeWarehouseId
    ? simByWarehouse[activeWarehouseId] ?? EMPTY_SIM
    : EMPTY_SIM;

  const activeRoute = useMemo((): StrategyResult | null => {
    if (!activeSim.results || !activeSim.activeStrategy) return null;
    return activeSim.results.strategies.find(s => s.strategy === activeSim.activeStrategy) || null;
  }, [activeSim]);

  const executionPlan = useMemo((): StrategyResult | null => {
    if (!activeSim.executionPlanStrategy || !activeSim.results) return null;
    return activeSim.results.strategies.find(s => s.strategy === activeSim.executionPlanStrategy) ?? null;
  }, [activeSim]);

  const [animationReplayId, setAnimationReplayId] = useState(0);

  const startStrategyAnimation = useCallback((warehouseId: string, strategy: StrategyType) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setSimByWarehouse(prev => ({
      ...prev,
      [warehouseId]: { ...(prev[warehouseId] ?? EMPTY_SIM), activeStrategy: strategy },
    }));
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
      // The simulation belongs to the warehouse that was active when clicked —
      // results land in its own state even if the user scrolls away mid-run.
      const targetId = activeWarehouseIdRef.current;
      if (!targetId) return;

      setSimByWarehouse(prev => ({ ...prev, [targetId]: EMPTY_SIM }));
      setIsSimulating(true);
      animationProgressRef.current = 0;
      animationProgressLastRenderedRef.current = 0;
      setAnimationProgress(0);
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

          setSimByWarehouse(prev => ({
            ...prev,
            [targetId]: {
              results,
              activeStrategy: results.bestStrategy,
              executionPlanStrategy: null,
              blockState: null,
            },
          }));
          setIsSimulating(false);
          setValidationContext(null);
          setValidationResult(null);
          startStrategyAnimation(targetId, results.bestStrategy);
        } catch (error) {
          console.error('Simulation failed:', error);
          setIsSimulating(false);

          if (error instanceof UnreachableLocationError) {
            setSimByWarehouse(prev => ({
              ...prev,
              [targetId]: {
                ...(prev[targetId] ?? EMPTY_SIM),
                blockState: {
                  simulationState: 'UNREACHABLE_LOCATIONS',
                  title: 'Unreachable Locations',
                  description: 'The warehouse layout blocks workers from reaching some pick locations. Please check the layout; workers might not be able to go through.',
                },
              },
            }));
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
      setIsSimulating(false);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
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
      const id = activeWarehouseIdRef.current;
      if (id) setSimByWarehouse(prev => ({ ...prev, [id]: EMPTY_SIM }));
      animationProgressRef.current = 0;
      animationProgressLastRenderedRef.current = 0;
      setAnimationProgress(0);
      setIsSimulating(false);
      return;
    }

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
    const id = activeWarehouseIdRef.current;
    if (id) startStrategyAnimation(id, strategy);
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
      const { warehouse: importedWarehouse } = parseWarehouseCsv(csvText);
      // Hidden corrector — CSV rows can collide on ids or land out of bounds;
      // repair before commit so readiness + simulation are clean.
      const corrected = reconcile(importedWarehouse, []);
      updateActiveWarehouse(corrected.warehouse);
      setOrders([]);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingSkuIds(null);
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
      // Store per-warehouse so each warehouse keeps its own order set.
      setOrdersByWarehouse((prev) => ({
        ...prev,
        [activeWarehouseIdRef.current ?? '']: corrected.orders,
      }));
    } catch (err) {
      console.error('Failed to generate orders:', err);
      // Fallback: generate client-side
      const fallbackOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
      const corrected = reconcile(warehouse, fallbackOrders);
      setOrders(corrected.orders);
      setOrdersByWarehouse((prev) => ({
        ...prev,
        [activeWarehouseIdRef.current ?? '']: corrected.orders,
      }));
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
      setOrdersByWarehouse({ [skeletonId]: [] });
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
          <SkeletonSwap ready={!isLoading} delay={0} minVisible={250} lines={4} label="Workspace">
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
          </SkeletonSwap>
        </div>
      )}

      {/* DB error banner */}

      {/* Main Content */}
      {compareViewOpen ? (
        <CompareView
          warehouses={workspaceWarehouses}
          ordersByWarehouse={ordersByWarehouse}
          baseWarehouseId={compareBaseWarehouseId}
          workerCount={workerCount}
          warehouseProfile={warehouseProfile}
          laborProfile={laborProfile}
          onExit={() => {
            setCompareViewOpen(false);
            setCompareBaseWarehouseId(null);
          }}
          onGenerateExperiment={handleGenerateExperiment}
        />
      ) : (
      <div className="flex-1 flex overflow-hidden">
        {/* Center — warehouse div + right sidebar div, side by side in a flex row. */}
        <div className="flex-1 flex overflow-hidden relative">
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
            <div className="flex-1 flex flex-col overflow-hidden gap-0 relative min-w-0">
              {/* Multi-warehouse canvas — page-per-warehouse vertical scroll
                  (only one warehouse visible at a time). */}
              <MultiWarehouseScroll
                warehouses={workspaceWarehouses}
                activeWarehouseId={activeWarehouseId}
                onActiveChange={setActiveWarehouseId}
                onWarehouseChange={handleWarehouseChangePersisted}
                onAddWarehouse={handleAddWarehouse}
                onDuplicateWarehouse={handleDuplicateWarehouse}
                onRenameWarehouse={handleRenameWarehouse}
                onDeleteWarehouse={handleDeleteWarehouse}
                onCompareWarehouse={handleCompareWarehouse}
                selectedTool={selectedTool}
                activeRoute={activeRoute}
                animationProgressRef={animationProgressRef}
                zVisualizationMode={zVisualizationMode}
                animationReplayId={animationReplayId}
              />
            </div>
          )}

          {/* Right sidebar — in-flow div (tools + config + simulation), pushes the canvas left. */}
          <RightSidebar
            orders={orders}
            onGenerateOrders={handleAddDemoOrders}
            warehouse={warehouse ?? undefined}
            orderCount={orderCount}
            avgOrderSize={avgOrderSize}
            onOrderCountChange={setOrderCount}
            onAvgOrderSizeChange={setAvgOrderSize}
            simulationResults={activeSim.results}
            readiness={readiness}
            isSimulating={isSimulating}
            activeStrategy={activeSim.activeStrategy}
            onStrategySelect={handleStrategySelect}
            animationProgress={animationProgress}
            workerCount={workerCount}
            onWorkerCountChange={setWorkerCount}
            executionPlan={executionPlan}
            validationContext={validationContext}
            blockState={activeSim.blockState}
            onViewUnresolvableItems={(itemIds) => setHighlightedMissingSkuIds(new Set(itemIds))}
            onSimulate={handleSimulateClick}
            onZVisualizationChange={setZVisualizationMode}
            isGeneratingOrders={isGeneratingOrders}
            configuration={activeWarehouseConfig}
            onEditConfig={() => {
              if (activeWarehouseId) handleOpenLayoutConfig(activeWarehouseId);
            }}
          />
        </div>

      </div>
      )}

      {/* Validation Modal */}
      {validationContext && (
        <ValidationModal
          open={showValidationModal}
          validationContext={validationContext}
          onClose={() => setShowValidationModal(false)}
          onFixItems={handleFixItems}
        />
      )}

      {/* Compare gate — single warehouse or duplicate layouts. */}
      <CompareGateModal
        state={compareGate}
        onClose={() => setCompareGate(null)}
        onAddWarehouse={() => {
          setCompareGate(null);
          handleAddWarehouse();
        }}
      />

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
              // Commit the RAW generated warehouse + orders FIRST so the canvas
              // paints immediately (the renderer only needs the grid/shelves —
              // reconciliation adds no visible cells). Reconcile is deferred a
              // tick so the main thread isn't blocked on A* reachability before
              // the first paint; the hidden corrector still lands before the
              // readiness memo (which gates Simulate) is re-read.
              setWorkspaceWarehouses((prev) =>
                prev.map((ww) =>
                  ww.id === activeWarehouseIdRef.current
                    ? {
                        ...ww,
                        id: warehouseId,
                        warehouse: result.warehouse,
                        configuration,
                      }
                    : ww,
                ),
              );
              setActiveWarehouseId(warehouseId);
              setOrders(result.orders);
              // Keep per-warehouse orders in sync so switching restores them.
              setOrdersByWarehouse((prev) => ({ ...prev, [warehouseId]: result.orders }));
              setHasExistingWarehouse(true);

              if (result.quantityViolations.length > 0) {
                console.warn('[Taro] Quantity invariant violations after placement:', result.quantityViolations);
              }

              const totalBinsWanted = config.inventory.reduce((sum, i) => sum + (i.storageFootprint ?? 1), 0);
              setSimByWarehouse(prev => ({
                ...prev,
                [warehouseId]: {
                  ...EMPTY_SIM,
                  blockState: result.unplacedSkus.length > 0
                    ? {
                        simulationState: 'NO_VALID_ITEMS',
                        title: `${result.unplacedSkus.length} SKU${result.unplacedSkus.length === 1 ? '' : 's'} could not be placed`,
                        description: `The warehouse layout has only ${result.binCount} storage bins but the generated inventory requires ${totalBinsWanted} (placed ${result.placedBinCount}). Increase the rack count or reduce the SKU count / storage footprint so every SKU can be slotted. Unplaced: ${result.unplacedSkus.join(', ')}.`,
                      }
                    : null,
                },
              }));

              setIsSimulating(false);
              setAnimationProgress(0);
              setValidationContext(null);
              setValidationResult(null);
              setShowValidationModal(false);
              setHighlightedMissingSkuIds(null);
              resetAnimationState();

              // Deferred reconcile — after the canvas has painted the raw
              // warehouse, run the hidden corrector (idempotent; fixes stray
              // ids / unreachable bins) and commit the cleaned state. The
              // readiness memo reads the final state, so Simulate stays gated
              // correctly. The timer is keyed to the just-generated warehouseId
              // so a later action can't clobber this fix.
              const reconcileTimer = window.setTimeout(() => {
                // Read the LATEST warehouse for this id (the user may have
                // drawn on the canvas in the deferred gap) so reconciliation
                // never clobbers manual edits — fall back to the generated
                // result if the entry no longer exists.
                const latest = workspaceWarehousesRef.current.find((w) => w.id === warehouseId)?.warehouse ?? result.warehouse;
                const corrected = reconcile(
                  latest,
                  ordersRef.current,
                );
                setWorkspaceWarehouses((prev) =>
                  prev.map((ww) =>
                    ww.id === warehouseId
                      ? { ...ww, warehouse: corrected.warehouse }
                      : ww,
                  ),
                );
                setOrders(corrected.orders);
                // Keep per-warehouse orders in sync too.
                setOrdersByWarehouse((prev) => ({
                  ...prev,
                  [warehouseId]: corrected.orders,
                }));
              }, 0);
              activeReconcileTimerRef.current = reconcileTimer;
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

      {/* New-warehouse overlay — APPENDS a brand-new warehouse (never overwrites). */}
      {showNewWarehouseConfig && activeProjectId && (
        <LayoutConfigOverlay
          onClose={() => setShowNewWarehouseConfig(false)}
          canClose
          isGenerating={isGenerating}
          onApply={async (config) => {
            setIsGenerating(true);
            try {
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
              const newId = crypto.randomUUID();
              const newName = `Warehouse ${workspaceWarehousesRef.current.length + 1}`;

              // Hidden corrector — orders may reference unplaced SKUs;
              // reconcile against the new warehouse before commit.
              const corrected = reconcile(result.warehouse, result.orders);

              // APPEND the new warehouse (don't replace/update anything).
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
              setOrdersByWarehouse((prev) => ({ ...prev, [newId]: corrected.orders }));
              setActiveWarehouseId(newId);
              setOrders(corrected.orders);
              setHasExistingWarehouse(true);

              if (result.quantityViolations.length > 0) {
                console.warn('[Taro] Quantity invariant violations after placement:', result.quantityViolations);
              }

              const totalBinsWanted = config.inventory.reduce((sum, i) => sum + (i.storageFootprint ?? 1), 0);
              setSimByWarehouse(prev => ({
                ...prev,
                [newId]: {
                  ...EMPTY_SIM,
                  blockState: result.unplacedSkus.length > 0
                    ? {
                        simulationState: 'NO_VALID_ITEMS',
                        title: `${result.unplacedSkus.length} SKU${result.unplacedSkus.length === 1 ? '' : 's'} could not be placed`,
                        description: `The warehouse layout has only ${result.binCount} storage bins but the generated inventory requires ${totalBinsWanted} (placed ${result.placedBinCount}). Increase the rack count or reduce the SKU count / storage footprint so every SKU can be slotted. Unplaced: ${result.unplacedSkus.join(', ')}.`,
                      }
                    : null,
                },
              }));

              setIsSimulating(false);
              setAnimationProgress(0);
              setValidationContext(null);
              setValidationResult(null);
              setShowValidationModal(false);
              setHighlightedMissingSkuIds(null);
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
