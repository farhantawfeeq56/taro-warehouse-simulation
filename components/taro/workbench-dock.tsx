'use client';

/**
 * Workbench dock — a compact left dock below the workspace dock.
 *
 * Follows the same pattern as WorkspacePanel: a 3-icon cluster
 * (Config / Orders / Simulation) sits at the LEFT edge, and clicking a
 * section icon expands a compact panel OUTWARD (to the right) with that
 * section's content, reusing the same embedded panels as the old right
 * sidebar (ConfigTab, OrdersPanel, SystemStatePanel).
 */

import { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  ListOrdered,
  Play,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

interface WorkbenchDockProps {
  // Config section
  configuration: WarehouseConfiguration | null;
  onEditConfig: () => void;

  // Orders section
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

  // Simulation section
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

  // Dock open state — controlled from TaroApp so only one dock is open at a time
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'config' | 'orders' | 'simulation';

const SECTION_META: Record<Section, { title: string; icon: typeof SlidersHorizontal }> = {
  config: { title: 'Config', icon: SlidersHorizontal },
  orders: { title: 'Orders', icon: ListOrdered },
  simulation: { title: 'Simulation', icon: Play },
};

export function WorkbenchDock(props: WorkbenchDockProps) {
  const [section, setSection] = useState<Section>('orders');
  const { isOpen: dockOpen, onOpenChange: setDockOpen } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape closes the dock panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDockOpen]);

  /** Dock icon click: toggle open if same section, else switch + open. */
  const toggleSection = (t: Section) => {
    if (dockOpen && section === t) {
      setDockOpen(false);
      return;
    }
    setSection(t);
    setDockOpen(true);
  };

  const content = (() => {
    switch (section) {
      case 'config':
        return (
          <ConfigTab
            stacked
            configuration={props.configuration}
            onEdit={props.onEditConfig}
          />
        );
      case 'orders':
        return (
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
        );
      case 'simulation':
        return (
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
        );
    }
  })();

  const SectionIcon = SECTION_META[section].icon;

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Workbench dock — icon cluster + expanding panel */}
      <div className="relative z-40 flex items-start">
        {/* Dock — compact icon cluster */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
          {(
            [
              ['config', SECTION_META.config.icon],
              ['orders', SECTION_META.orders.icon],
              ['simulation', SECTION_META.simulation.icon],
            ] as [Section, typeof SlidersHorizontal][]
          ).map(([t, Icon]) => (
            <button
              key={t}
              onClick={() => toggleSection(t)}
              title={SECTION_META[t].title}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                section === t && dockOpen
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Mini panel — absolute, expands OUTWARD to the right (hugging the left edge) */}
        <div
          className={cn(
            'fixed left-[72px] top-[68px] bottom-2 flex w-64 flex-col overflow-hidden rounded-xl border border-border-default bg-[#F4F4F2] shadow-2xl transition-all duration-300',
            dockOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              <SectionIcon className="h-3 w-3" />
              {SECTION_META[section].title}
            </span>
            <button
              onClick={() => setDockOpen(false)}
              title="Close (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{content}</div>
        </div>
      </div>
    </>
  );
}
