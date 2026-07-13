'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type {
  Warehouse,
  Order,
  ToolType,
  ZVisualizationMode,
} from '@/lib/taro/types';
import {
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
import { parseWarehouseCsv } from '@/lib/taro/warehouse-import';
import { WarehouseCanvas } from './warehouse-canvas';
import { OrdersPanel } from './orders-panel';
import { Toolbar } from './toolbar';
import { LayoutConfigOverlay, type LayoutConfig } from './layout-config-overlay';
import { validateSkuQuantityInvariant } from '@/lib/taro/inventory';

export function TaroApp() {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => generateSkeletonWarehouse());
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolType>('shelf');
  const [zVisualizationMode, setZVisualizationMode] = useState<ZVisualizationMode>('all');
  const [showLayoutConfig, setShowLayoutConfig] = useState(true);
  const [orderCount, setOrderCount] = useState(1000);
  const [avgOrderSize, setAvgOrderSize] = useState(5);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<string>('');

  const handleWarehouseChange = useCallback((newWarehouse: Warehouse) => {
    setWarehouse(newWarehouse);
    setImportSummary('');
  }, []);

  const handleClearWarehouse = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the entire warehouse layout and all orders? This cannot be undone.')) {
      handleWarehouseChange(createEmptyWarehouse(30, 24));
      setOrders([]);
      setImportSummary('');
    }
  }, [handleWarehouseChange]);

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
            <h1 className="text-base font-bold tracking-tight">Taro - Warehouse Layout Editor</h1>
            <p className="text-xs text-muted-foreground leading-tight">Design and configure warehouse layouts.</p>
            {importSummary && <p className="text-xs text-emerald-600 mt-1">{importSummary}</p>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Orders */}
        <OrdersPanel
          orders={orders}
          onOrdersChange={setOrders}
          warehouse={warehouse}
          highlightedMissingSkuIds={null}
          onClearHighlights={() => {}}
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
            </div>
          </div>
        </div>
      </div>

      {/* Layout Config Overlay */}
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

            // Regenerate orders to match new layout
            const newOrders = generateRandomOrders(warehouseWithInventory, orderCount, avgOrderSize);
            setOrders(newOrders);
            setImportSummary('');
          }}
        />
      )}
    </div>
  );
}
