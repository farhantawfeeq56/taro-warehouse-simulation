'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  Warehouse,
  Order,
  ToolType,
  SimulationResults,
  StrategyType,
  ZVisualizationMode,
  SimulationValidationContext,
  SimulationBlockState,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import type { StrategyResult } from '@/lib/taro/types';
import { OrdersPanel } from './orders-panel';
import { SystemStatePanel } from './results-panel';
import { ConfigTab } from './config-tab';

interface WorkbenchPanelProps {
  // Config tab
  configuration: WarehouseConfiguration | null;
  onEditConfig: () => void;

  // Orders tab
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  highlightedMissingSkuIds?: Set<string> | null;
  onClearHighlights?: () => void;
  orderCount: number;
  avgOrderSize: number;
  onOrderCountChange: (value: number) => void;
  onAvgOrderSizeChange: (value: number) => void;
  onAddDemoOrders?: () => void;

  // Simulation tab
  simulationResults: SimulationResults | null;
  readiness?: SimulationReadiness;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
  executionPlan: StrategyResult | null;
  validationContext?: SimulationValidationContext | null;
  blockState?: SimulationBlockState | null;
  onViewUnresolvableItems?: (itemIds: string[]) => void;
  onSimulate?: () => void;
  onAddShelves?: () => void;
  onSetWorkerStart?: () => void;
  onZVisualizationChange?: (mode: ZVisualizationMode) => void;
  /** Whether demo orders are being generated — shows spinner on the fix button. */
  isGeneratingOrders?: boolean;
}

export function WorkbenchPanel(props: WorkbenchPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('orders');

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col">
      {/* Tabs — Paper design */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="pt-2 px-2 shrink-0">
          <TabsList className="grid grid-cols-3 h-9 items-center w-full justify-center p-[3px] rounded-[10px] bg-transparent">
            <TabsTrigger
              value="config"
              className="items-center h-[calc(100%-1px)] flex justify-center py-1 px-2 gap-1 rounded-lg text-[12px] leading-[133.333%] font-medium text-[#0A0A0A] data-[state=active]:bg-white data-[state=active]:border-b data-[state=active]:border-b-[#009966] data-[state=active]:rounded-none data-[state=active]:shadow-none data-[state=inactive]:border data-[state=inactive]:border-transparent"
            >
              Config
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="items-center h-[calc(100%-1px)] flex justify-center py-1 px-2 gap-1 rounded-lg text-[12px] leading-[133.333%] font-medium text-[#0A0A0A] data-[state=active]:bg-white data-[state=active]:border-b data-[state=active]:border-b-[#009966] data-[state=active]:rounded-none data-[state=active]:shadow-none data-[state=inactive]:border data-[state=inactive]:border-transparent"
            >
              Orders
            </TabsTrigger>
            <TabsTrigger
              value="simulation"
              className="items-center h-[calc(100%-1px)] flex justify-center py-1 px-2 gap-1 rounded-lg text-[12px] leading-[133.333%] font-medium text-[#0A0A0A] data-[state=active]:bg-white data-[state=active]:border-b data-[state=active]:border-b-[#009966] data-[state=active]:rounded-none data-[state=active]:shadow-none data-[state=inactive]:border data-[state=inactive]:border-transparent"
            >
              Simulation
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="config" className="flex-1 min-h-0 m-0 overflow-hidden">
          <ConfigTab configuration={props.configuration} onEdit={props.onEditConfig} />
        </TabsContent>

        <TabsContent value="orders" className="flex-1 min-h-0 m-0 overflow-hidden">
          <OrdersPanel
            embedded
            orders={props.orders}
            onOrdersChange={props.onOrdersChange}
            warehouse={props.warehouse}
            highlightedMissingSkuIds={props.highlightedMissingSkuIds}
            onClearHighlights={props.onClearHighlights}
            orderCount={props.orderCount}
            avgOrderSize={props.avgOrderSize}
            onOrderCountChange={props.onOrderCountChange}
            onAvgOrderSizeChange={props.onAvgOrderSizeChange}
          />
        </TabsContent>

        <TabsContent value="simulation" className="flex-1 min-h-0 m-0 overflow-hidden">
          <SystemStatePanel
            embedded
            results={props.simulationResults}
            readiness={props.readiness}
            isSimulating={props.isSimulating}
            activeStrategy={props.activeStrategy}
            onStrategySelect={props.onStrategySelect}
            animationProgress={props.animationProgress}
            workerCount={props.workerCount}
            executionPlan={props.executionPlan}
            validationContext={props.validationContext}
            blockState={props.blockState}
            onViewUnresolvableItems={props.onViewUnresolvableItems}
            onSimulate={props.onSimulate}
            onAddShelves={props.onAddShelves}
            onAddDemoOrders={props.onAddDemoOrders}
            onSetWorkerStart={props.onSetWorkerStart}
            onZVisualizationChange={props.onZVisualizationChange}
            isGeneratingOrders={props.isGeneratingOrders}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
