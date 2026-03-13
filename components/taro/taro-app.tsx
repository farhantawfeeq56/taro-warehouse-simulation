'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Warehouse, Order, ToolType, SimulationResults, StrategyType, StrategyResult } from '@/lib/taro/types';
import { generateDemoWarehouse, createEmptyWarehouse, generateRandomOrders } from '@/lib/taro/demo-generator';
import { runSimulation } from '@/lib/taro/simulation';
import { WarehouseCanvas } from './warehouse-canvas';
import { OrdersPanel } from './orders-panel';
import { ResultsPanel } from './results-panel';
import { Toolbar } from './toolbar';
import { Button } from '@/components/ui/button';
import { RotateCcw, Wand2, Play } from 'lucide-react';

export function TaroApp() {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => createEmptyWarehouse(30, 24));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolType>('shelf');
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<StrategyType | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
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
  }, []);

  const generateDemo = useCallback(() => {
    const demoWarehouse = generateDemoWarehouse();
    setWarehouse(demoWarehouse);
    const demoOrders = generateRandomOrders(demoWarehouse.items, 4);
    setOrders(demoOrders);
    setSimulationResults(null);
    setActiveStrategy(null);
    setAnimationProgress(0);
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
      const results = runSimulation(warehouse, orders);
      setSimulationResults(results);
      setIsSimulating(false);
      
      // Auto-select best strategy and start animation
      setActiveStrategy(results.bestStrategy);
    }, 500);
  }, [warehouse, orders]);

  const handleStrategySelect = useCallback((strategy: StrategyType) => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    setActiveStrategy(strategy);
    setAnimationProgress(0);
    
    // Start animation
    const startTime = performance.now();
    const duration = 3000; // 3 seconds for full route

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimationProgress(progress);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight">Taro</h1>
          <span className="text-xs text-muted-foreground">Warehouse Picking Simulator</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetWarehouse}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={generateDemo}
            className="h-7 text-xs"
          >
            <Wand2 className="h-3 w-3 mr-1.5" />
            Demo Layout
          </Button>
          <Button
            size="sm"
            onClick={runSimulationHandler}
            disabled={!canSimulate || isSimulating}
            className="h-7 text-xs"
          >
            <Play className="h-3 w-3 mr-1.5" />
            Simulate Strategies
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Orders */}
        <OrdersPanel
          orders={orders}
          onOrdersChange={setOrders}
          availableItems={warehouse.items}
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-2 border-b border-border bg-muted/30 shrink-0">
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
          <div className="h-7 border-t border-border flex items-center px-3 text-xs text-muted-foreground bg-muted/30 shrink-0">
            <div className="flex items-center gap-4">
              <span>Grid: {warehouse.width} x {warehouse.height}</span>
              <span>Items: {warehouse.items.length}</span>
              <span>Worker: {warehouse.workerStart ? `(${warehouse.workerStart.x}, ${warehouse.workerStart.y})` : 'Not placed'}</span>
              {activeStrategy && (
                <span className="text-foreground">
                  Showing: <span className="font-medium capitalize">{activeStrategy}</span> strategy
                </span>
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
        />
      </div>
    </div>
  );
}
