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
} from '@/lib/taro/types';
import {
  generateDemoWarehouse,
  generateRandomOrders,
  createEmptyWarehouse,
  generateSkeletonWarehouse,
} from '@/lib/taro/demo-generator';
import {
  generateParallelLayout,
  generateCrossAisleLayout,
  generateFishboneLayout
} from '@/lib/taro/layout-generator';
import { applyInventoryPlacementDetailed } from '@/lib/taro/inventory-placement';
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseCanvas } from './warehouse-canvas';
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
import { validateSkuQuantityInvariant } from '@/lib/taro/inventory';

export function TaroApp() {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => generateSkeletonWarehouse());
  const [orders, setOrders] = useState<Order[]>([]);
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
  const [workerCount, setWorkerCount] = useState(2);
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
  const [showLayoutConfig, setShowLayoutConfig] = useState(true);
  const [highlightedMissingSkuIds, setHighlightedMissingSkuIds] = useState<Set<string> | null>(null);
  const [simulationBlockState, setSimulationBlockState] = useState<SimulationBlockState | null>(null);
  const [orderCount, setOrderCount] = useState(1000);
  const [avgOrderSize, setAvgOrderSize] = useState(5);

  const resetAnimationState = useCallback(() => {
    setAnimationProgress(0);
    animationProgressRef.current = 0;
    animationProgressLastRenderedRef.current = 0;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const handleWarehouseChange = useCallback((newWarehouse: Warehouse) => {
    setWarehouse(newWarehouse);
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

  // 1. Derived Data

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
    () => validateItems(orders, deferredWarehouse),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouseSkuFingerprint, orders]
  );

  const readiness = useMemo(
    () => evaluateReadiness(deferredWarehouse, orders, zVisualizationMode, cachedOrderValidation),
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
      if (!warehouse.workerStart || orders.length === 0) {
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
            debugMode: true,
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
      handleWarehouseChange(createEmptyWarehouse(30, 24));
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
  }, [handleWarehouseChange, resetAnimationState]);

  const handleSimulateClick = useCallback(() => {
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
      handleWarehouseChange(importedWarehouse);
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
  }, [handleWarehouseChange]);

  const handleAddDemoOrders = useCallback(() => {
    const demoOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
    setOrders(demoOrders);
  }, [warehouse, orderCount, avgOrderSize]);

  // 4. Side Effects
  useEffect(() => {
    // No longer generating initial demo warehouse as we force layout config on startup
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

      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-background shrink-0 gap-8">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold tracking-tight">Taro - Warehouse Picking Simulator

</h1>
            <p className="text-xs text-muted-foreground leading-tight">Demo warehouse generated for viewing purposes. Refresh for fresh demo.</p>
            {importSummary && <p className="text-xs text-emerald-600 mt-1">{importSummary}</p>}
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
          warehouse={warehouse}
          highlightedMissingSkuIds={highlightedMissingSkuIds}
          onClearHighlights={() => setHighlightedMissingSkuIds(null)}
          orderCount={orderCount}
          avgOrderSize={avgOrderSize}
          onOrderCountChange={setOrderCount}
          onAvgOrderSizeChange={setAvgOrderSize}
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden gap-0">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              onClear={handleClearWarehouse}
              onOpenLayoutConfig={() => setShowLayoutConfig(true)}
              zVisualizationMode={zVisualizationMode}
              onZVisualizationChange={setZVisualizationMode}
            />
          </div>

          {/* Canvas */}
          <WarehouseCanvas
            warehouse={warehouse}
            onWarehouseChange={handleWarehouseChange}
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

      {showLayoutConfig && (
        <LayoutConfigOverlay
          onClose={() => setShowLayoutConfig(false)}
          onApply={(config) => {
            let newWarehouse: Warehouse;
            
            switch (config.type) {
              case 'parallel':
                newWarehouse = generateParallelLayout(config.gridHeight, config.rackCount, config.aisleWidth);
                break;
              case 'cross-aisle':
                newWarehouse = generateCrossAisleLayout(config.gridHeight, config.rackCount, config.aisleWidth, config.crossAisleCount);
                break;
              case 'fishbone':
                newWarehouse = generateFishboneLayout(config.fbWidth, config.fbHeight, config.fbTheta, config.fbI2, config.fbS, config.fbAp);
                break;
              default:
                newWarehouse = generateParallelLayout(config.gridHeight, config.rackCount, config.aisleWidth);
            }

            const placementResult = applyInventoryPlacementDetailed(
              newWarehouse,
              {
                items: config.inventory,
                slottingBias: config.slottingBias,
                categoryClustering: config.categoryClustering,
              }
            );
            const warehouseWithInventory = placementResult.warehouse;

            setWarehouse(warehouseWithInventory);

            // Verify the quantity invariant: each SKU's total quantity
            // must equal the sum of its bin quantities. Log violations
            // as warnings so developers can catch placement bugs.
            const qtyViolations = validateSkuQuantityInvariant(
              warehouseWithInventory,
              config.inventory
            );
            if (qtyViolations.length > 0) {
              console.warn(
                '[Taro] Quantity invariant violations after placement:',
                qtyViolations
              );
            }

            // Surface any SKUs that could not be placed (more required bins
            // than available capacity, considering each SKU's storageFootprint)
            // rather than silently dropping inventory.
            const totalBinsWanted = config.inventory.reduce(
              (sum, i) => sum + (i.storageFootprint ?? 1),
              0
            );
            if (placementResult.unplacedSkus.length > 0) {
              setSimulationBlockState({
                simulationState: 'NO_VALID_ITEMS',
                title: `${placementResult.unplacedSkus.length} SKU${placementResult.unplacedSkus.length === 1 ? '' : 's'} could not be placed`,
                description: `The warehouse layout has only ${placementResult.binCount} storage bins but the generated inventory requires ${totalBinsWanted} (placed ${placementResult.placedBinCount}). Increase the rack count or reduce the SKU count / storage footprint so every SKU can be slotted. Unplaced: ${placementResult.unplacedSkus.join(', ')}.`,
              });
            } else {
              setSimulationBlockState(null);
            }

            // Regenerate orders to match new layout
            const newOrders = generateRandomOrders(warehouseWithInventory, orderCount, avgOrderSize);
            setOrders(newOrders);

            // Reset simulation state
            setSimulationResults(null);
            setIsSimulating(false);
            setActiveStrategy(null);
            setAnimationProgress(0);
            setExecutionPlanStrategy(null);
            setValidationContext(null);
            setValidationResult(null);
            setShowValidationModal(false);
            setHighlightedMissingSkuIds(null);
            // NOTE: simulationBlockState is NOT reset here because the
            // if/else above already handles it correctly. Resetting it
            // unconditionally here would silently erase the overflow block
            // set when unplacedSkus.length > 0 (React batches synchronous
            // state updates, so the later null would always win).
            setImportSummary('');
            resetAnimationState();
          }}
        />
      )}
    </div>
  );
}
