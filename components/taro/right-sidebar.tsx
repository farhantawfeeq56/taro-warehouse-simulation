'use client';

/**
 * Right sidebar — a plain in-flow right panel beside the warehouse canvas.
 *
 * Unlike a fixed overlay, this is a real flex child of the workspace row, so
 * it occupies actual layout width and the canvas shrinks to make room. It
 * hosts Config + Simulation, switched by an in-panel tab bar:
 *
 *   • Config      — read-only view of the active warehouse's configuration
 *                   (see config-tab.tsx), with an Edit action.
 *   • Simulation  — Orders generation + simulation panel (see
 *                   simulation-panel.tsx).
 *
 * The drawing tools live in a separate floating Tools dock (left edge); the
 * warehouse selector has been folded into the left dock's workspace access.
 *
 * The sidebar can be collapsed to a narrow handle (and expanded back) via
 * the toggle in its header. When collapsed it renders as a slim right rail
 * of icons that expand the panel.
 */

import { useState } from 'react';
import {
  Play,
  X,
  Settings,
  PanelRightOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';
import type {
  Warehouse,
  StrategyType,
  SimulationResults,
  StrategyResult,
  ZVisualizationMode,
  SimulationValidationContext,
  SimulationBlockState,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { SimulationPanel } from './simulation-panel';
import { ConfigTab } from './config-tab';

type Section = 'config' | 'simulation';

export interface RightSidebarProps {
  // Orders generation
  orders: Parameters<typeof SimulationPanel>[0]['orders'];
  onGenerateOrders: () => void;
  isGeneratingOrders?: boolean;
  orderCount: number;
  avgOrderSize: number;
  onOrderCountChange: (value: number) => void;
  onAvgOrderSizeChange: (value: number) => void;
  warehouse?: Warehouse;

  // Simulation
  simulationResults: SimulationResults | null;
  readiness?: SimulationReadiness;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
  executionPlan: StrategyResult | null;
  validationContext?: SimulationValidationContext | null;
  blockState?: SimulationBlockState | null;
  onViewUnresolvableItems?: (itemIds: string[]) => void;
  onSimulate?: () => void;
  onZVisualizationChange?: (mode: ZVisualizationMode) => void;

  // Config
  configuration?: WarehouseConfiguration | null;
  onEditConfig?: () => void;
}

/**
 * Right sidebar — an in-flow div (flex child). When `open`, renders the
 * full panel; when closed, renders a slim icon-only rail allowing re-open.
 */
export function RightSidebar({ open, onOpenChange, ...props }: RightSidebarProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [section, setSection] = useState<Section>('simulation');

  const renderBody = () => (
    <>
      {/* Header — tab switcher (Config | Simulation) + collapse. */}
      <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
        <Tabs
          items={[
            { value: 'config', label: 'Config' },
            { value: 'simulation', label: 'Simulation' },
          ]}
          value={section}
          onValueChange={(v) => setSection(v as Section)}
          label="Sidebar section"
        />
        <button
          onClick={() => onOpenChange(false)}
          title="Collapse (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {section === 'config' && (
          <div className="h-full overflow-y-auto">
            <ConfigTab
              configuration={props.configuration ?? null}
              onEdit={props.onEditConfig ?? (() => {})}
              stacked
            />
          </div>
        )}
        {section === 'simulation' && (
          <div className="h-full">
            <SimulationPanel
              embedded
              orders={props.orders}
              onGenerateOrders={props.onGenerateOrders}
              isGeneratingOrders={props.isGeneratingOrders}
              orderCount={props.orderCount}
              avgOrderSize={props.avgOrderSize}
              onOrderCountChange={props.onOrderCountChange}
              onAvgOrderSizeChange={props.onAvgOrderSizeChange}
              warehouse={props.warehouse}
              results={props.simulationResults}
              readiness={props.readiness}
              isSimulating={props.isSimulating}
              activeStrategy={props.activeStrategy}
              onStrategySelect={props.onStrategySelect}
              animationProgress={props.animationProgress}
              workerCount={props.workerCount}
              onWorkerCountChange={props.onWorkerCountChange}
              executionPlan={props.executionPlan}
              validationContext={props.validationContext}
              blockState={props.blockState}
              onViewUnresolvableItems={props.onViewUnresolvableItems}
              onSimulate={props.onSimulate}
              onZVisualizationChange={props.onZVisualizationChange}
            />
          </div>
        )}
      </div>
    </>
  );

  if (!open) {
    // Narrow collapsed rail — just icons to re-open.
    return (
      <div className="h-full flex flex-col items-center gap-2 border-l border-border-default bg-surface px-1.5 py-3 shrink-0 w-12">
        <button
          onClick={() => {
            setSection('simulation');
            onOpenChange(true);
          }}
          title="Simulation"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setSection('config');
            onOpenChange(true);
          }}
          title="Configuration"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Settings className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => onOpenChange(true)}
          title="Expand"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex w-80 flex-col overflow-hidden border-l border-border-default bg-secondary shrink-0">
      {renderBody()}
    </div>
  );
}