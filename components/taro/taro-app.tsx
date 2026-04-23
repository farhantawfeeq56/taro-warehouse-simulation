'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
} from '@/lib/taro/types';
import { generateDemoWarehouse, generateRandomOrders, createEmptyWarehouse } from '@/lib/taro/demo-generator';
import { runSimulation } from '@/core/simulationEngine';
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseCanvas } from './warehouse-canvas';
import { OrdersPanel } from './orders-panel';
import { SystemStatePanel } from './results-panel';
import { Toolbar } from './toolbar';
import { ValidationModal } from './validation-modal';
import { ReadinessIndicator } from './readiness-indicator';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { getMissingItemIds, validateItems, type ItemsValidationResult } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import type { SimulationReadiness } from '@/lib/taro/readiness';

interface SimulationBlockState {
  /** Set when simulation cannot run; drives right-panel blocked UI. */
  simulationState?: 'NO_VALID_ITEMS';
  title: string;
  description: string;
}

export function TaroApp() {
  const { initialWarehouse, initialOrders } = useMemo(() => {
    const w = generateDemoWarehouse();
    const o = generateRandomOrders(w, 4);
    return { initialWarehouse: w, initialOrders: o };
  }, []);

  const [warehouse, setWarehouse] = useState<Warehouse>(initialWarehouse);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [selectedTool, setSelectedTool] = useState<ToolType>('shelf');
  const [zVisualizationMode, setZVisualizationMode] = useState<ZVisualizationMode>('all');
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<StrategyType | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
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
  const [highlightedMissingItemIds, setHighlightedMissingItemIds] = useState<Set<string> | null>(null);
  const [simulationBlockState, setSimulationBlockState] = useState<SimulationBlockState | null>(null);

  // 1. Derived Data
  const readiness = useMemo(() => evaluateReadiness(warehouse, orders, zVisualizationMode), [warehouse, orders, zVisualizationMode]);
  const canSimulate = readiness.isReady;

  const activeRoute = useMemo((): StrategyResult | null => {
    if (!simulationResults || !activeStrategy) return null;
    return simulationResults.strategies.find(s => s.strategy === activeStrategy) || null;
  }, [simulationResults, activeStrategy]);

  const executionPlan = useMemo((): StrategyResult | null => {
    if (!executionPlanStrategy || !simulationResults) return null;
    return simulationResults.strategies.find(s => s.strategy === executionPlanStrategy) ?? null;
  }, [executionPlanStrategy, simulationResults]);

  const startStrategyAnimation = useCallback((strategy: StrategyType) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setActiveStrategy(strategy);
    setAnimationProgress(0);

    const baseDuration = 3000;
    let lastTime: number | null = null;
    let elapsed = 0;

    const animate = (currentTime: number) => {
      const delta = lastTime !== null ? currentTime - lastTime : 0;
      lastTime = currentTime;
      elapsed += delta * replaySpeedRef.current;

      const progress = Math.min(elapsed / baseDuration, 1);
      setAnimationProgress(progress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
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
      setAnimationProgress(0);
      setExecutionPlanStrategy(null);
      setHighlightedMissingItemIds(null);
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
        }
      });
    },
    [warehouse, orders, workerCount, warehouseProfile, laborProfile, startStrategyAnimation]
  );

  const handleClearWarehouse = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the entire warehouse layout and all orders? This cannot be undone.')) {
      setWarehouse(createEmptyWarehouse(30, 24));
      setOrders([]);
      setSimulationResults(null);
      setIsSimulating(false);
      setActiveStrategy(null);
      setAnimationProgress(0);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingItemIds(null);
      setSimulationBlockState(null);
      setImportSummary('');
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, []);

  const handleSimulateClick = useCallback(() => {
    if (!readiness.isReady) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setSimulationResults(null);
      setActiveStrategy(null);
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
      const missingItemIds = getMissingItemIds(validationContext);
      setHighlightedMissingItemIds(missingItemIds);
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
      setWarehouse(importedWarehouse);
      setOrders([]);
      setSimulationResults(null);
      setActiveStrategy(null);
      setAnimationProgress(0);
      setImportSummary(`Loaded ${summary.locationCount} locations across ${summary.rackCount} racks`);
      setExecutionPlanStrategy(null);
      setValidationContext(null);
      setValidationResult(null);
      setShowValidationModal(false);
      setHighlightedMissingItemIds(null);
      setSimulationBlockState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse CSV.';
      alert(`CSV import failed: ${message}`);
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleAddDemoOrders = useCallback(() => {
    const demoOrders = generateRandomOrders(warehouse, 4);
    setOrders(demoOrders);
  }, [warehouse]);

  // 4. Side Effects
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
          workerCount={workerCount}
          highlightedMissingItemIds={highlightedMissingItemIds}
          onClearHighlights={() => setHighlightedMissingItemIds(null)}
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden gap-0">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              onClear={handleClearWarehouse}
              zVisualizationMode={zVisualizationMode}
              onZVisualizationChange={setZVisualizationMode}
            />
          </div>

          {/* Canvas */}
          <WarehouseCanvas
            warehouse={warehouse}
            onWarehouseChange={setWarehouse}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgress={animationProgress}
            zVisualizationMode={zVisualizationMode}
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
          onViewUnresolvableItems={(itemIds) => setHighlightedMissingItemIds(new Set(itemIds))}
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
    </div>
  );
}
