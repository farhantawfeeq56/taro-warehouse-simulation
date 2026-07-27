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
import { Layout, ClipboardList, Activity } from 'lucide-react';

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
}

export function WorkbenchPanel(props: WorkbenchPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('orders');

  return (
    <div className="w-80 border-r border-border bg-background flex flex-col">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-full min-h-0"
      >
        <div className="border-b border-border px-2 pt-2 shrink-0">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="config" className="text-xs gap-1">
              <Layout className="h-3.5 w-3.5" />
              Config
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-xs gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs gap-1">
              <Activity className="h-3.5 w-3.5" />
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}