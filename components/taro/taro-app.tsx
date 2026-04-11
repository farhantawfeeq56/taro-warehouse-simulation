'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
} from '@/lib/taro/types';
import { createEmptyWarehouse, generateDemoWarehouse, generateRandomOrders } from '@/lib/taro/demo-generator';
import { runSimulation } from '@/core/simulationEngine';
import { parseWarehouseCsv, SAMPLE_WAREHOUSE_CSV_TEMPLATE } from '@/lib/taro/warehouse-import';
import { DEFAULT_WAREHOUSE_PROFILE, DEFAULT_LABOR_PROFILE } from '@/lib/taro/constants';
import { WarehouseCanvas } from './warehouse-canvas';
import { OrdersPanel } from './orders-panel';
import { ResultsPanel } from './results-panel';
import { Toolbar } from './toolbar';
import { EntryOverlay } from './entry-overlay';
import { Button } from '@/components/ui/button';
import { RotateCcw, Play, Minus, Plus, FileText } from 'lucide-react';
export function TaroApp() {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => createEmptyWarehouse(30, 24));
  const [orders, setOrders] = useState<Order[]>([]);
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
  const [showEntryOverlay, setShowEntryOverlay] = useState(true);
  const animationRef = useRef<number | null>(null);
  const replaySpeedRef = useRef(replaySpeed);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<string>('');
  const [executionPlanStrategy, setExecutionPlanStrategy] = useState<StrategyType | null>(null);

  useEffect(() => {
    replaySpeedRef.current = replaySpeed;
  }, [replaySpeed]);

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

  const getActiveRoute = useCallback((): StrategyResult | null => {
    if (!simulationResults || !activeStrategy) return null;
    return simulationResults.strategies.find(s => s.strategy === activeStrategy) || null;
  }, [simulationResults, activeStrategy]);

  const resetWarehouse = useCallback(() => {
    setWarehouse(createEmptyWarehouse(30, 24));
    setOrders([]);
    setSimulationResults(null);
    setActiveStrategy(null);
    setAnimationProgress(0);
    setExecutionPlanStrategy(null);
    setZVisualizationMode('all');
    setShowEntryOverlay(true);
    setImportSummary('');
  }, []);

  const generateDemo = useCallback(() => {
    const demoWarehouse = generateDemoWarehouse();
    setWarehouse(demoWarehouse);
    const demoOrders = generateRandomOrders(demoWarehouse, 4);
    setOrders(demoOrders);
    setSimulationResults(null);
    setActiveStrategy(null);
    setAnimationProgress(0);
    setExecutionPlanStrategy(null);
    setShowEntryOverlay(false);
    setImportSummary('');
  }, []);

  const runSimulationHandler = useCallback(() => {
    if (!warehouse.workerStart || orders.length === 0) {
      return;
    }

    setIsSimulating(true);
    setActiveStrategy(null);
    setAnimationProgress(0);
    setExecutionPlanStrategy(null);

    requestAnimationFrame(() => {
      const results = runSimulation(warehouse, orders, workerCount, {
        warehouseProfile,
        laborProfile,
      });

      setSimulationResults(results);
      setIsSimulating(false);
      startStrategyAnimation(results.bestStrategy);
    });
  }, [warehouse, orders, workerCount, warehouseProfile, laborProfile, startStrategyAnimation]);

  const handleStrategySelect = useCallback((strategy: StrategyType) => {
    startStrategyAnimation(strategy);
  }, [startStrategyAnimation]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const canSimulate = warehouse.workerStart !== null &&
                      orders.length > 0 &&
                      orders.some(o => o.items.length > 0);

  const downloadCsvTemplate = useCallback(() => {
    const blob = new Blob([SAMPLE_WAREHOUSE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'warehouse-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

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
      setShowEntryOverlay(false);
      setImportSummary(`Loaded ${summary.locationCount} locations across ${summary.rackCount} racks`);
      setExecutionPlanStrategy(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to parse CSV.';
      alert(`CSV import failed: ${message}`);
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleBuildManually = useCallback(() => {
    setShowEntryOverlay(false);
    setImportSummary('');
    setExecutionPlanStrategy(null);
  }, []);

  const hasContent = warehouse.shelves.length > 0 ||
                     warehouse.workerStart !== null ||
                     orders.length > 0;

  return (
    <div className="h-full flex flex-col bg-background font-sans relative">
      {showEntryOverlay && !hasContent && (
        <EntryOverlay
          onTryDemo={generateDemo}
          onImport={handleImport}
          onBuildManually={handleBuildManually}
          onDownloadTemplate={downloadCsvTemplate}
        />
      )}
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
            <h1 className="text-base font-bold tracking-tight">Taro</h1>
            <p className="text-xs text-muted-foreground leading-tight">Warehouse Picking Simulator</p>
            {importSummary && <p className="text-xs text-emerald-600 mt-1">{importSummary}</p>}
          </div>

        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={resetWarehouse}
            className="h-8 text-xs"
            title="Clear all items and reset simulation"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>

          {/* Worker count stepper */}
          <div className="flex items-center gap-1.5 border border-border rounded-lg px-2 py-1 bg-muted/30 h-8">
            <span className="text-xs text-muted-foreground font-medium">Workers</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWorkerCount(c => Math.max(1, c - 1))}
                disabled={workerCount <= 1}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Decrease worker count"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-xs font-mono font-semibold w-4 text-center">{workerCount}</span>
              <button
                onClick={() => setWorkerCount(c => Math.min(3, c + 1))}
                disabled={workerCount >= 3}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Increase worker count"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2 border border-border rounded-lg px-2 py-1 bg-muted/30 h-8">
            <label className="text-xs text-muted-foreground font-medium">Scale</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={warehouseProfile.scale}
              onChange={(e) => setWarehouseProfile(prev => ({ ...prev, scale: Number(e.target.value) || DEFAULT_WAREHOUSE_PROFILE.scale }))}
              className="w-14 h-5 text-xs bg-background border border-border rounded px-1"
              title="Meters per grid cell"
            />
          </div>

          <div className="hidden xl:flex items-center gap-2 border border-border rounded-lg px-2 py-1 bg-muted/30 h-8">
            <label className="text-xs text-muted-foreground font-medium">Speed</label>
            <input
              type="number"
              min={1}
              step={1}
              value={warehouseProfile.workerSpeed}
              onChange={(e) => setWarehouseProfile(prev => ({ ...prev, workerSpeed: Number(e.target.value) || DEFAULT_WAREHOUSE_PROFILE.workerSpeed }))}
              className="w-14 h-5 text-xs bg-background border border-border rounded px-1"
              title="Worker speed (meters per minute)"
            />
          </div>

          <div className="hidden xl:flex items-center gap-2 border border-border rounded-lg px-2 py-1 bg-muted/30 h-8">
            <label className="text-xs text-muted-foreground font-medium">Pick s</label>
            <input
              type="number"
              min={0}
              step={1}
              value={warehouseProfile.pickTimePerItem}
              onChange={(e) => setWarehouseProfile(prev => ({ ...prev, pickTimePerItem: Number(e.target.value) || DEFAULT_WAREHOUSE_PROFILE.pickTimePerItem }))}
              className="w-12 h-5 text-xs bg-background border border-border rounded px-1"
              title="Seconds per pick"
            />
          </div>

          <div className="hidden xl:flex items-center gap-2 border border-border rounded-lg px-2 py-1 bg-muted/30 h-8">
            <label className="text-xs text-muted-foreground font-medium">$/hr</label>
            <input
              type="number"
              min={1}
              step={1}
              value={laborProfile.costPerHour}
              onChange={(e) => setLaborProfile({ costPerHour: Number(e.target.value) || DEFAULT_LABOR_PROFILE.costPerHour })}
              className="w-14 h-5 text-xs bg-background border border-border rounded px-1"
              title="Labor cost per hour"
            />
          </div>

          <Button
            size="sm"
            onClick={runSimulationHandler}
            disabled={!canSimulate || isSimulating}
            className="h-8 text-xs"
            title="Run picking strategy simulation"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Simulate Strategies
          </Button>

          {simulationResults && (
            <Button
              size="sm"
              onClick={() => {
                setExecutionPlanStrategy(simulationResults.bestStrategy);
                startStrategyAnimation(simulationResults.bestStrategy);
              }}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              title="Generate execution plan output for the best strategy"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Generate Execution Plan
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
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden gap-0">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              zVisualizationMode={zVisualizationMode}
              onZVisualizationChange={setZVisualizationMode}
            />
          </div>

          {/* Canvas */}
          <WarehouseCanvas
            warehouse={warehouse}
            onWarehouseChange={setWarehouse}
            selectedTool={selectedTool}
            activeRoute={getActiveRoute()}
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

        {/* Right Panel - Results */}
        <ResultsPanel
          results={simulationResults}
          isSimulating={isSimulating}
          activeStrategy={activeStrategy}
          onStrategySelect={handleStrategySelect}
          animationProgress={animationProgress}
          workerCount={workerCount}
          executionPlan={executionPlanStrategy ? simulationResults?.strategies.find(s => s.strategy === executionPlanStrategy) ?? null : null}
        />
      </div>
    </div>
  );
}
