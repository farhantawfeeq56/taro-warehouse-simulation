'use client';

/**
 * Left sidebar — tools + warehouse, five layout variants (vartest5).
 *
 * The left sidebar hosts the canvas drawing tools (Shelf / Worker / Erase /
 * Hand / Select) and the active warehouse selector. Five layout directions
 * are provided, switched by a floating segmented toolbar (bottom-right,
 * keys 1–5):
 *
 *   1. Rail     — icon-only vertical rail hugging the left edge
 *   2. Panel    — full-width left panel with two sections (Tools, Warehouse)
 *   3. Compact  — mini icon cluster that pops a panel outward
 *   4. Tabs     — horizontal tab bar pinned to the top-left
 *   5. Float    — floating rounded card, detached from edges
 */

import type { ToolType, WorkspaceWarehouse } from '@/lib/taro/types';
import {
  Hand,
  MousePointer2,
  Square,
  Eraser,
  Crosshair,
  Warehouse as WarehouseIcon,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type LeftSidebarVariant = 1 | 2 | 3 | 4 | 5;

interface LeftSidebarProps {
  /** Which layout direction is active (1–5). */
  variant: LeftSidebarVariant;
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (id: string, opts?: { additive?: boolean }) => void;
  onRenameWarehouse: (id: string, name: string) => void;
  /** Currently selected drawing tool. */
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

/* ── Tool definitions ───────────────────────────────────────────────── */

const TOOLS: { id: ToolType; label: string; icon: typeof Square }[] = [
  { id: 'shelf', label: 'Shelf', icon: Square },
  { id: 'worker', label: 'Worker Start', icon: Crosshair },
  { id: 'erase', label: 'Erase', icon: Eraser },
  { id: 'hand', label: 'Hand', icon: Hand },
  { id: 'select', label: 'Select', icon: MousePointer2 },
];

/* ── Shared pieces ──────────────────────────────────────────────────── */

/** Icon button for a tool. */
function ToolButton({
  tool,
  selected,
  onClick,
  size = 'md',
}: {
  tool: { id: ToolType; label: string; icon: typeof Square };
  selected: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      title={tool.label}
      aria-label={tool.label}
      className={cn(
        'relative flex items-center justify-center rounded-lg transition-colors',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        selected
          ? 'bg-accent-soft text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Active warehouse row — click to select, double-click to rename. */
function WarehouseRow({
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onRenameWarehouse,
}: {
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: LeftSidebarProps['onSelectWarehouse'];
  onRenameWarehouse: LeftSidebarProps['onRenameWarehouse'];
}) {
  const active = warehouses.find((w) => w.id === activeWarehouseId) ?? warehouses[0] ?? null;
  if (!active) {
    return <p className="text-xs text-muted-foreground italic">No warehouse</p>;
  }
  return (
    <button
      onClick={() => onSelectWarehouse(active.id)}
      onDoubleClick={() => {
        const name = window.prompt('Rename warehouse', active.name);
        if (name && name.trim() && name.trim() !== active.name) {
          onRenameWarehouse(active.id, name.trim());
        }
      }}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors group"
      title="Select warehouse · double-click to rename"
    >
      <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate font-medium text-foreground">{active.name}</span>
      <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground ml-auto shrink-0" />
    </button>
  );
}

/* ── Variant 1: Rail — icon-only vertical rail hugging the left edge ── */

function RailVariant({ selectedTool, onToolChange }: Pick<LeftSidebarProps, 'selectedTool' | 'onToolChange'>) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
      {TOOLS.map((t) => (
        <ToolButton
          key={t.id}
          tool={t}
          selected={selectedTool === t.id}
          onClick={() => onToolChange(t.id)}
        />
      ))}
    </div>
  );
}

/* ── Variant 2: Panel — full-width left panel with two sections ─────── */

function PanelVariant({
  selectedTool,
  onToolChange,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onRenameWarehouse,
}: LeftSidebarProps) {
  return (
    <div className="flex w-52 flex-col rounded-xl border border-border-default bg-surface shadow-lg overflow-hidden">
      {/* Tools */}
      <div className="px-2.5 pt-2.5 pb-2">
        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1.5 px-1">
          Tools
        </p>
        <div className="grid grid-cols-5 gap-0.5">
          {TOOLS.map((t) => (
            <ToolButton
              key={t.id}
              tool={t}
              selected={selectedTool === t.id}
              onClick={() => onToolChange(t.id)}
              size="sm"
            />
          ))}
        </div>
      </div>
      {/* Warehouse */}
      <div className="border-t border-border-default px-2 py-2">
        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1 px-1">
          Warehouse
        </p>
        <WarehouseRow
          warehouses={warehouses}
          activeWarehouseId={activeWarehouseId}
          onSelectWarehouse={onSelectWarehouse}
          onRenameWarehouse={onRenameWarehouse}
        />
      </div>
    </div>
  );
}

/* ── Variant 3: Compact — mini icon cluster, pop-out on hover/click ─── */

function CompactVariant({
  selectedTool,
  onToolChange,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
}: LeftSidebarProps) {
  return (
    <div className="relative flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2 group">
      {/* Mini tool icons */}
      {TOOLS.slice(0, 4).map((t) => (
        <ToolButton
          key={t.id}
          tool={t}
          selected={selectedTool === t.id}
          onClick={() => onToolChange(t.id)}
          size="sm"
        />
      ))}
      {/* Warehouse icon — clicking expands a small popover-ish list */}
      <button
        onClick={() => onSelectWarehouse(warehouses[0]?.id ?? '')}
        title="Warehouse"
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors mt-1 border-t border-border-default pt-1',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <WarehouseIcon className="h-4 w-4" />
      </button>
      {/* Pop-out tooltips on hover */}
      <div className="absolute left-full top-0 ml-2 hidden group-hover:flex flex-col rounded-lg border border-border-default bg-surface shadow-xl p-1 w-36">
        {TOOLS.slice(0, 4).map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors',
              selectedTool === t.id ? 'bg-accent-soft text-accent font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Variant 4: Tabs — horizontal tab bar pinned top-left ───────────── */

function TabsVariant({
  selectedTool,
  onToolChange,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onRenameWarehouse,
}: LeftSidebarProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg p-1.5">
      {/* Tool tabs */}
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const isActive = selectedTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              title={t.label}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          );
        })}
      </div>
      {/* Warehouse row below */}
      <div className="border-t border-border-default pt-1.5 mt-0.5">
        <WarehouseRow
          warehouses={warehouses}
          activeWarehouseId={activeWarehouseId}
          onSelectWarehouse={onSelectWarehouse}
          onRenameWarehouse={onRenameWarehouse}
        />
      </div>
    </div>
  );
}

/* ── Variant 5: Float — detached floating card, centered-left ───────── */

function FloatVariant({
  selectedTool,
  onToolChange,
  warehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onRenameWarehouse,
}: LeftSidebarProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-default bg-surface/95 backdrop-blur-sm shadow-xl px-2 py-3 w-44">
      <div className="flex items-center gap-2 px-1">
        <WarehouseIcon className="h-4 w-4 text-accent" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
          Workspace
        </span>
      </div>
      <WarehouseRow
        warehouses={warehouses}
        activeWarehouseId={activeWarehouseId}
        onSelectWarehouse={onSelectWarehouse}
        onRenameWarehouse={onRenameWarehouse}
      />
      <div className="h-px bg-border-default" />
      <div className="grid grid-cols-5 gap-1">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.id}
            tool={t}
            selected={selectedTool === t.id}
            onClick={() => onToolChange(t.id)}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────────────────── */

/**
 * Left sidebar with 5 layout directions, driven by `variant`.
 */
export function LeftSidebar(props: LeftSidebarProps) {
  const { variant } = props;

  // All variants position themselves at the LEFT edge; only the inner
  // container changes shape.
  return (
    <div className="fixed left-0 top-0 z-40 flex flex-col items-start gap-2 p-2 pointer-events-none">
      <div className="pointer-events-auto">
        {variant === 1 && <RailVariant {...props} />}
        {variant === 2 && <PanelVariant {...props} />}
        {variant === 3 && <CompactVariant {...props} />}
        {variant === 4 && <TabsVariant {...props} />}
        {variant === 5 && <FloatVariant {...props} />}
      </div>
    </div>
  );
}

/** Floating segmented toolbar — bottom-right, keyboard-driven (1–5). */
export function LeftSidebarVariantToolbar({
  active,
  onSelect,
}: {
  active: LeftSidebarVariant;
  onSelect: (v: LeftSidebarVariant) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-0.5 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
      {([1, 2, 3, 4, 5] as LeftSidebarVariant[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          title={`Left sidebar layout ${v}`}
          className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold transition-colors',
            active === v ? 'bg-accent text-accent-soft' : 'text-text-muted hover:bg-muted hover:text-text-primary'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}