'use client';

/**
 * Workbench dock — a compact left dock below the workspace dock.
 *
 * A single icon (Simulation) sits at the LEFT edge, and clicking it
 * expands a compact panel OUTWARD (to the right) with the merged
 * Orders + Simulation panel (see simulation-panel.tsx). The Config
 * section was removed earlier — each warehouse node carries its own
 * configuration viewer.
 */

import { useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Warehouse,
  Order,
  StrategyType,
  SimulationResults,
  StrategyResult,
  ZVisualizationMode,
  SimulationValidationContext,
  SimulationBlockState,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import { SimulationPanel } from './simulation-panel';

interface WorkbenchDockProps {
  // Orders generation
  orders: Order[];
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

  // Dock open state — controlled from TaroApp so only one dock is open at a time
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkbenchDock(props: WorkbenchDockProps) {
  const { isOpen: dockOpen, onOpenChange: setDockOpen } = props;

  // Escape closes the dock panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDockOpen]);

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Workbench dock — single Simulation icon + expanding panel */}
      <div className="relative z-40 flex items-start">
        {/* Dock — single icon */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
          <button
            onClick={() => setDockOpen(!dockOpen)}
            title="Simulation"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              dockOpen
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Play className="h-4 w-4" />
          </button>
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
              <Play className="h-3 w-3" />
              Simulation
            </span>
            <button
              onClick={() => setDockOpen(false)}
              title="Close (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
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
        </div>
      </div>
    </>
  );
}
