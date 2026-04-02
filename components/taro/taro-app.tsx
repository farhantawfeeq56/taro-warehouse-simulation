'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Warehouse, Order, ToolType, SimulationResults, StrategyType, StrategyResult, PickTask } from '@/lib/taro/types';
import { createEmptyWarehouse, generateDemoWarehouse, generateRandomOrders } from '@/lib/taro/demo-generator';
import { runSimulation } from '@/lib/taro/simulation';
import { generateTaskCSV, parseTaskCSV } from '@/lib/taro/csv';
import { WarehouseCanvas } from './warehouse-canvas';
import { OrdersPanel } from './orders-panel';
import { ResultsPanel } from './results-panel';
import { Toolbar } from './toolbar';
import { EntryOverlay } from './entry-overlay';
import { Button } from '@/components/ui/button';
import { RotateCcw, Play, Minus, Plus, Rocket, Wand2 } from 'lucide-react';
interface TaroAppProps {
  onDeployStrategy?: (tasks: PickTask[]) => void;
}

export function TaroApp({ onDeployStrategy }: TaroAppProps = {}) {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => createEmptyWarehouse(30, 24));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolType>('shelf');
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<StrategyType | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [workerCount, setWorkerCount] = useState(2);
  const [replaySpeed, setReplaySpeed] = useState<1 | 5 | 10>(1);
  const [showEntryOverlay, setShowEntryOverlay] = useState(true);
  const animationRef = useRef<number | null>(null);

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
    setShowHeatmap(false);
    setShowEntryOverlay(true);
  }, []);

  const generateDemo = useCallback(() => {
    const demoWarehouse = generateDemoWarehouse();
    setWarehouse(demoWarehouse);
    const demoOrders = generateRandomOrders(demoWarehouse.items, 4);
    setOrders(demoOrders);
    setSimulationResults(null);
    setActiveStrategy(null);
    setAnimationProgress(0);
    setShowEntryOverlay(false);
  }, []);

  const runSimulationHandler = useCallback(() => {
    if (!warehouse.workerStart || orders.length === 0 || warehouse.items.length === 0) {
      return;
    }

    setIsSimulating(true);
    setActiveStrategy(null);
    setAnimationProgress(0);

    // Small delay to show loading state
    setTimeout(() => {
      const results = runSimulation(warehouse, orders, workerCount);
      setSimulationResults(results);
      setIsSimulating(false);
      
      // Auto-select best strategy and start animation
      setActiveStrategy(results.bestStrategy);
    }, 500);
  }, [warehouse, orders, workerCount]);

  const handleStrategySelect = useCallback((strategy: StrategyType) => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    setActiveStrategy(strategy);
    setAnimationProgress(0);
    
    // Start animation with replay speed multiplier
    const startTime = performance.now();
    const baseDuration = 3000; // 3 seconds baseline
    const duration = baseDuration / replaySpeed;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimationProgress(progress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [replaySpeed]);

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
                      warehouse.items.length > 0 &&
                      orders.some(o => o.items.length > 0);

  const handleImport = useCallback(() => {
    setShowEntryOverlay(false);
    alert('Import functionality will be added soon. Please build manually.');
  }, []);

  const handleBuildManually = useCallback(() => {
    setShowEntryOverlay(false);
  }, []);

  const hasContent = warehouse.items.length > 0 ||
                     warehouse.shelves.length > 0 ||
                     warehouse.workerStart !== null ||
                     orders.length > 0;

  return (
    <div className="h-full flex flex-col bg-background font-sans relative">
      {showEntryOverlay && !hasContent && (
        <EntryOverlay
          onTryDemo={generateDemo}
          onImport={handleImport}
          onBuildManually={handleBuildManually}
        />
      )}
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-background shrink-0 gap-8">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold tracking-tight">Taro</h1>
            <p className="text-xs text-muted-foreground leading-tight">Warehouse Picking Simulator</p>
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

          {simulationResults && onDeployStrategy && (
            <Button
              size="sm"
              onClick={() => {
                const best = simulationResults.strategies.find(s => s.strategy === simulationResults.bestStrategy);
                if (!best?.workerRoutes) return;
                const csv = generateTaskCSV(best.workerRoutes);
                const tasks = parseTaskCSV(csv);
                onDeployStrategy(tasks);
              }}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              title="Deploy best strategy tasks to workers"
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Deploy Strategy
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
          availableItems={warehouse.items}
          workerCount={workerCount}
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden gap-0">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
            <Toolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              showHeatmap={showHeatmap}
              onHeatmapToggle={() => setShowHeatmap(prev => !prev)}
              hasHeatmap={simulationResults !== null}
            />
          </div>

          {/* Canvas */}
          <WarehouseCanvas
            warehouse={warehouse}
            onWarehouseChange={setWarehouse}
            selectedTool={selectedTool}
            activeRoute={getActiveRoute()}
            heatmap={simulationResults?.heatmap || null}
            showHeatmap={showHeatmap}
            animationProgress={animationProgress}
          />

          {/* Status Bar */}
          <div className="h-8 border-t border-border flex items-center px-4 text-xs text-muted-foreground bg-muted/20 shrink-0">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-medium">Grid:</span>
                <span className="font-mono">{warehouse.width} × {warehouse.height}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Items:</span>
                <span className="font-mono">{warehouse.items.length}</span>
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
        />
      </div>
    </div>
  );
}
