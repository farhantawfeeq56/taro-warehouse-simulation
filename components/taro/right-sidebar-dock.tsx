'use client';

/**
 * Right sidebar dock — the full right sidebar hosting Config + Simulation.
 *
 * Unlike the compact left docks, this expands into a FULL-HEIGHT right
 * sidebar (hugging the right edge) with two sections that travel together:
 *
 *   • Config      — read-only view of the active warehouse's configuration
 *                   (see config-tab.tsx), with an Edit action.
 *   • Simulation  — Orders generation + simulation panel (see
 *                   simulation-panel.tsx).
 *
 * Two icons on the right edge (Simulation / Config) toggle the sidebar open
 * to the matching section. Inside, a tab bar switches between the two, so
 * both live in the same right sidebar.
 */

import { useEffect, useState } from 'react';
import { Play, X, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
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

type Section = 'simulation' | 'config';

export interface RightSidebarDockProps {
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
  onAddShelves?: () => void;
  onSetWorkerStart?: () => void;
  onZVisualizationChange?: (mode: ZVisualizationMode) => void;

  // Config
  configuration?: WarehouseConfiguration | null;
  onEditConfig?: () => void;

  // Dock open state — controlled from TaroApp
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RightSidebarDock({
  isOpen: dockOpen,
  onOpenChange: setDockOpen,
  ...props
}: RightSidebarDockProps) {
  // Which section the sidebar shows (mirrors the dock icon clicked).
  const [section, setSection] = useState<Section>('simulation');

  // Escape closes the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDockOpen]);

  const openSection = (s: Section) => {
    if (dockOpen && section === s) {
      setDockOpen(false);
      return;
    }
    setSection(s);
    setDockOpen(true);
  };

  return (
    <>
      {/* Right dock rail — icon cluster hugging the RIGHT edge. */}
      <div className="fixed right-0 top-0 z-40 flex flex-col items-end gap-2 p-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
          <button
            onClick={() => openSection('simulation')}
            title="Simulation"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              dockOpen && section === 'simulation'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            onClick={() => openSection('config')}
            title="Configuration"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              dockOpen && section === 'config'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Full-height right sidebar — slides in from the right edge. */}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 z-40 flex w-72 flex-col overflow-hidden border-l border-border-default bg-[#F4F4F2] shadow-2xl transition-all duration-300',
          dockOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none',
        )}
      >
        {/* Header — tab switcher (Config | Simulation) + close. */}
        <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-0.5">
            <button
              onClick={() => setSection('config')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                section === 'config' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Settings className="h-3 w-3" />
              Config
            </button>
            <button
              onClick={() => setSection('simulation')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                section === 'simulation' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Play className="h-3 w-3" />
              Simulation
            </button>
          </div>
          <button
            onClick={() => setDockOpen(false)}
            title="Close (Esc)"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {section === 'config' ? (
            <div className="h-full overflow-y-auto">
              <ConfigTab
                configuration={props.configuration ?? null}
                onEdit={props.onEditConfig ?? (() => {})}
                stacked
              />
            </div>
          ) : (
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
                onAddShelves={props.onAddShelves}
                onSetWorkerStart={props.onSetWorkerStart}
                onZVisualizationChange={props.onZVisualizationChange}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}