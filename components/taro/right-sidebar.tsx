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

import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui/tabs';
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
 * Right sidebar — an in-flow div (flex child). Always open; hosts Config +
 * Simulation, switched by the in-panel tab bar.
 */
export function RightSidebar(props: RightSidebarProps) {
  const [section, setSection] = useState<Section>('simulation');
  // Two-step flow inside the Simulation tab: setup (orders+workers) →
  // simulation (results). Simulate advances; Back to Setup returns.
  const [simFlowStep, setSimFlowStep] = useState<'setup' | 'simulation'>('setup');
  // Once results exist, jump straight to the simulation step.
  const simFlowStepEffective: 'setup' | 'simulation' =
    props.simulationResults || props.isSimulating ? 'simulation' : simFlowStep;
  const advance = () => setSimFlowStep('simulation');
  const goBack = () => setSimFlowStep('setup');

  // vartest5: flow-presentation variant (1 stepper · 2 progress · 3 continuous · 4 chips · 5 tabs)
  const [flowVariant, setFlowVariant] = useState<1 | 2 | 3 | 4 | 5>(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setFlowVariant(n as 1 | 2 | 3 | 4 | 5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const renderBody = () => (
    <>
      {/* Header — tab switcher (Config | Simulation). */}
      <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
        <Tabs
          items={[
            { value: 'config', label: 'Config' },
            { value: 'simulation', label: 'Simulation' },
          ]}
          value={section}
          onValueChange={(v) => setSection(v as Section)}
          label="Sidebar section"
          className="max-w-[200px] rounded-md p-0.5 [&_button]:h-6 [&_button]:text-[11px] [&_button]:px-2"
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {section === 'config' && (
          <div className="h-full overflow-y-auto">
            <ConfigTab
              configuration={props.configuration ?? null}
              onEdit={props.onEditConfig ?? (() => {})}
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
              flowStep={simFlowStepEffective}
              flowVariant={flowVariant}
              onFlowAdvance={
                simFlowStepEffective === 'setup' ? advance : goBack
              }
              onFlowStepChange={(step) => setSimFlowStep(step)}
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative h-full flex w-80 flex-col overflow-hidden border-l border-border-default bg-secondary shrink-0">
      {renderBody()}

      {/* vartest5: floating segmented toolbar — switches flow-presentation variant (keys 1–5). */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[120] flex items-center gap-1.5">
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
          Flow 1–5
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border-default bg-surface px-1 py-0.5 shadow-lg">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFlowVariant(v as 1 | 2 | 3 | 4 | 5)}
              title={`Flow variant ${v}`}
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold transition-colors',
                flowVariant === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}