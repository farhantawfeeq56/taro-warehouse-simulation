'use client';

/**
 * Right sidebar — a plain in-flow right panel beside the warehouse canvas.
 *
 * Unlike a fixed overlay, this is a real flex child of the workspace row, so
 * it occupies actual layout width and the canvas shrinks to make room. It
 * hosts the canvas Tools (with the warehouse selector) plus Config +
 * Simulation, switched by an in-panel tab bar:
 *
 *   • Tools       — drawing tools (Shelf / Worker / Erase / Hand / Select)
 *                   + the active warehouse selector.
 *   • Config      — read-only view of the active warehouse's configuration
 *                   (see config-tab.tsx), with an Edit action.
 *   • Simulation  — Orders generation + simulation panel (see
 *                   simulation-panel.tsx).
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
  Hand,
  MousePointer2,
  Square,
  Eraser,
  Crosshair,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Warehouse,
  ToolType,
  StrategyType,
  SimulationResults,
  StrategyResult,
  ZVisualizationMode,
  SimulationValidationContext,
  SimulationBlockState,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { SimulationPanel } from './simulation-panel';
import { ConfigTab } from './config-tab';

type Section = 'tools' | 'config' | 'simulation';

const TOOLS: { id: ToolType; label: string; icon: typeof Square }[] = [
  { id: 'shelf', label: 'Shelf', icon: Square },
  { id: 'worker', label: 'Worker Start', icon: Crosshair },
  { id: 'erase', label: 'Erase', icon: Eraser },
  { id: 'hand', label: 'Hand', icon: Hand },
  { id: 'select', label: 'Select', icon: MousePointer2 },
];

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
  onAddShelves?: () => void;
  onSetWorkerStart?: () => void;
  onZVisualizationChange?: (mode: ZVisualizationMode) => void;

  // Config
  configuration?: WarehouseConfiguration | null;
  onEditConfig?: () => void;

  // Tools + warehouse
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (id: string) => void;
  onRenameWarehouse: (id: string, name: string) => void;
}

/* ── Tools + warehouse section ──────────────────────────────────────── */

function ToolsSection({
  selectedTool,
  onToolChange,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onRenameWarehouse,
}: Pick<RightSidebarProps, 'selectedTool' | 'onToolChange' | 'warehouses' | 'activeWarehouseId' | 'onSelectWarehouse' | 'onRenameWarehouse'>) {
  const active = warehouses.find((w) => w.id === activeWarehouseId) ?? warehouses[0] ?? null;
  return (
    <div className="p-3 space-y-4">
      {/* Warehouse selector */}
      <div>
        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1.5">
          Warehouse
        </p>
        {active ? (
          <button
            onClick={() => onSelectWarehouse(active.id)}
            onDoubleClick={() => {
              const name = window.prompt('Rename warehouse', active.name);
              if (name && name.trim() && name.trim() !== active.name) {
                onRenameWarehouse(active.id, name.trim());
              }
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors group border border-border-default bg-surface"
            title="Select warehouse · double-click to rename"
          >
            <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate font-medium text-foreground">{active.name}</span>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground italic">No warehouse</p>
        )}
      </div>

      {/* Tools */}
      <div>
        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1.5">
          Tools
        </p>
        <div className="grid grid-cols-5 gap-1">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isSelected = selectedTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onToolChange(t.id)}
                title={t.label}
                aria-label={t.label}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  isSelected
                    ? 'bg-accent-soft text-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Right sidebar — an in-flow div (flex child). When `open`, renders the
 * full panel; when closed, renders a slim icon-only rail allowing re-open.
 */
export function RightSidebar({ open, onOpenChange, ...props }: RightSidebarProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [section, setSection] = useState<Section>('simulation');

  const renderBody = () => (
    <>
      {/* Header — tab switcher (Tools | Config | Simulation) + collapse. */}
      <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          <button
            onClick={() => setSection('tools')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
              section === 'tools' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Square className="h-3 w-3" />
            Tools
          </button>
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
          onClick={() => onOpenChange(false)}
          title="Collapse (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {section === 'tools' && (
          <div className="h-full overflow-y-auto">
            <ToolsSection
              selectedTool={props.selectedTool}
              onToolChange={props.onToolChange}
              warehouses={props.warehouses}
              activeWarehouseId={props.activeWarehouseId}
              onSelectWarehouse={props.onSelectWarehouse}
              onRenameWarehouse={props.onRenameWarehouse}
            />
          </div>
        )}
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
              onAddShelves={props.onAddShelves}
              onSetWorkerStart={props.onSetWorkerStart}
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
            setSection('tools');
            onOpenChange(true);
          }}
          title="Tools"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Square className="h-4 w-4" />
        </button>
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
    <div className="h-full flex w-80 flex-col overflow-hidden border-l border-border-default bg-[#F4F4F2] shrink-0">
      {renderBody()}
    </div>
  );
}