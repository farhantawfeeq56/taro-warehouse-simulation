'use client';

/**
 * Left sidebar collapsed state — vartest5.
 *
 * The collapse mechanism is fixed: the chevron in the header toggles the
 * sidebar between expanded (finalized V-Tabs panel) and collapsed. What
 * *remains visible* while collapsed varies:
 *
 *   1. Rail        — the two section icons (Warehouses / Comparisons) stay in a
 *                    46px strip; clicking one expands into that tab.
 *   2. Logo        — just the Taro logo at the top; clicking it expands.
 *   3. Nothing     — fully hidden; a floating reopen button at the left edge.
 *   4. Mini stack  — logo + the two section icons stacked in a 46px strip.
 *   5. Ghost rail  — empty by default; hovering the left edge reveals the icon
 *                    rail, clicking an icon expands into that tab.
 *
 * A floating segmented toolbar (bottom-right, keys 1–5) switches variants.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import {
  Plus,
  GitCompareArrows,
  Warehouse as WarehouseIcon,
  Trash2,
  Loader2,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CollapsedVariant = 1 | 2 | 3 | 4 | 5;

interface WorkspacePanelCollapsedVariantsProps {
  // App header
  onBackToDashboard?: () => void;
  projectName: string;
  importSummary: string;

  // Warehouses
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  selectedWarehouseIds: Set<string>;
  onSelectWarehouse: (id: string, opts?: { additive?: boolean }) => void;
  onRenameWarehouse: (id: string, name: string) => void;

  // Comparisons
  comparisons: Comparison[];
  activeComparisonId: string | null;
  onSelectComparison: (id: string) => void;
  onRenameComparison: (id: string, name: string) => void;
  onDeleteComparison: (id: string) => void;

  // Actions
  onAddWarehouse: () => void;
  onNewComparison: () => void;
  isCreatingComparison?: boolean;
  deletingComparisonId?: string | null;
  renamingComparisonId?: string | null;
}

const VARIANTS: { id: CollapsedVariant; label: string; blurb: string }[] = [
  { id: 1, label: 'Rail', blurb: 'Section icons stay visible in a strip' },
  { id: 2, label: 'Logo', blurb: 'Just the Taro logo at the top' },
  { id: 3, label: 'Nothing', blurb: 'Fully hidden; floating reopen button' },
  { id: 4, label: 'Mini stack', blurb: 'Logo + section icons in a strip' },
  { id: 5, label: 'Ghost rail', blurb: 'Empty until hover reveals the icons' },
];

type Section = 'warehouses' | 'comparisons';
type EditingTarget = { id: string; type: Section };

export function WorkspacePanelCollapsedVariants(props: WorkspacePanelCollapsedVariantsProps) {
  const [variant, setVariant] = useState<CollapsedVariant>(1);
  const [section, setSection] = useState<Section>('warehouses');
  const [collapsed, setCollapsed] = useState(false);
  const [ghostHover, setGhostHover] = useState(false); // variant 5

  // Inline rename
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  // Reset ghost hover when switching variants.
  useEffect(() => {
    setGhostHover(false);
  }, [variant]);

  // Keyboard: 1-5 switch variants.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setVariant(n as CollapsedVariant);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const beginEdit = (target: EditingTarget, currentName: string) => {
    setEditing(target);
    setDraftName(currentName);
  };

  const commitEdit = () => {
    if (!editing) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setEditing(null);
      return;
    }
    if (editing.type === 'warehouses') {
      const original = props.warehouses.find((w) => w.id === editing.id)?.name;
      if (original && trimmed !== original) props.onRenameWarehouse(editing.id, trimmed);
    } else {
      const original = props.comparisons.find((c) => c.id === editing.id)?.name;
      if (original && trimmed !== original) props.onRenameComparison(editing.id, trimmed);
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const isEditing = (id: string, type: Section) =>
    editing?.id === id && editing.type === type;

  /* ── Rail icon ────────────────────────────────────────────────────── */

  const railIcon = (type: Section, label: string, Icon: typeof WarehouseIcon, opts?: { ghost?: boolean }) => (
    <button
      onClick={() => {
        setSection(type);
        setCollapsed(false);
      }}
      title={label}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        section === type
          ? 'bg-accent-soft text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        opts?.ghost && !ghostHover && 'opacity-0 pointer-events-none',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  /* ── Expand chevron ───────────────────────────────────────────────── */

  const expandButton = (opts?: { ghost?: boolean }) => (
    <button
      onClick={() => setCollapsed(false)}
      title="Expand sidebar"
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
        opts?.ghost && !ghostHover && 'opacity-0 pointer-events-none',
      )}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );

  /* ── Add buttons (per-tab top) ────────────────────────────────────── */

  const AddWarehouseButton = () => (
    <button
      onClick={props.onAddWarehouse}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
        text-foreground hover:bg-muted active:bg-muted/80 transition-colors
        border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
    >
      <Plus className="h-3.5 w-3.5" />
      Add Warehouse
    </button>
  );

  const AddComparisonButton = () => (
    <button
      onClick={props.onNewComparison}
      disabled={props.isCreatingComparison}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
        text-foreground hover:bg-muted active:bg-muted/80 transition-colors
        border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50
        disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {props.isCreatingComparison ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
      {props.isCreatingComparison ? 'Creating…' : 'New Comparison'}
    </button>
  );

  /* ── Warehouse rows ───────────────────────────────────────────────── */

  const warehouseRow = (w: WorkspaceWarehouse) => {
    const isActive = w.id === props.activeWarehouseId;
    const isSelected = props.selectedWarehouseIds.has(w.id);
    const editingRow = isEditing(w.id, 'warehouses');

    if (editingRow) {
      return (
        <div
          className={cn(
            'w-full px-2 py-1.5 rounded-md text-xs flex items-center gap-2',
            isActive ? 'bg-primary/10 ring-1 ring-primary/40' : 'ring-1 ring-primary/30',
          )}
        >
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full shrink-0',
              isActive ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          />
          <input
            ref={editingRow ? inputRef : undefined}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 min-w-0 h-5 px-1 text-xs font-medium bg-background border border-primary/50 rounded outline-none ring-1 ring-primary/30"
          />
        </div>
      );
    }

    return (
      <button
        onClick={(e) => props.onSelectWarehouse(w.id, { additive: e.shiftKey })}
        onDoubleClick={() => beginEdit({ id: w.id, type: 'warehouses' }, w.name)}
        className={cn(
          'w-full text-left px-2 py-1.5 rounded-md text-xs truncate flex items-center gap-2 transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : isSelected
              ? 'bg-primary/5 text-foreground ring-1 ring-primary/30'
              : 'text-foreground hover:bg-muted',
        )}
        title={`${w.name} (double-click to rename)`}
      >
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
            isActive ? 'bg-primary' : isSelected ? 'bg-primary/50' : 'bg-muted-foreground/30',
          )}
        />
        <span className="truncate">{w.name}</span>
      </button>
    );
  };

  /* ── Comparison rows ──────────────────────────────────────────────── */

  const comparisonRow = (c: Comparison) => {
    const isActive = c.id === props.activeComparisonId;
    const editingRow = isEditing(c.id, 'comparisons');

    if (editingRow) {
      return (
        <div className="w-full px-2 py-1.5 rounded-md text-xs flex items-center gap-2 ring-1 ring-accent/30">
          <GitCompareArrows className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          <input
            ref={editingRow ? inputRef : undefined}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="nodrag flex-1 min-w-0 h-5 px-1 text-xs font-medium bg-background border border-accent/50 rounded outline-none ring-1 ring-accent/30"
          />
        </div>
      );
    }

    return (
      <button
        onClick={() => props.onSelectComparison(c.id)}
        onDoubleClick={() => beginEdit({ id: c.id, type: 'comparisons' }, c.name)}
        className={cn(
          'w-full text-left px-2 py-1.5 rounded-md text-xs truncate flex items-center gap-2 transition-colors group',
          isActive
            ? 'bg-accent-soft text-accent font-semibold'
            : 'text-foreground hover:bg-muted',
        )}
        title={`${c.name} (double-click to rename)`}
      >
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
            isActive ? 'bg-accent' : 'bg-muted-foreground/30',
          )}
        />
        <GitCompareArrows className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <span className="truncate flex-1">{c.name}</span>
        {props.renamingComparisonId === c.id && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
        )}
        <span className="text-[10px] text-muted-foreground/60 font-sans shrink-0">
          {c.warehouseIds.length}w
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onDeleteComparison(c.id);
          }}
          disabled={props.deletingComparisonId === c.id}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0 disabled:opacity-100"
          title="Delete comparison"
        >
          {props.deletingComparisonId === c.id ? (
            <Loader2 className="h-3 w-3 animate-spin text-destructive" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </button>
      </button>
    );
  };

  /* ── Lists ────────────────────────────────────────────────────────── */

  const warehouseList =
    props.warehouses.length === 0 ? (
      <p className="text-xs text-muted-foreground italic px-1 py-2">No warehouses yet</p>
    ) : (
      <ul className="space-y-0.5">
        {props.warehouses.map((w) => (
          <li key={w.id}>{warehouseRow(w)}</li>
        ))}
      </ul>
    );

  const comparisonList =
    props.comparisons.length === 0 ? (
      <p className="text-xs text-muted-foreground italic px-1 py-2">No comparisons yet</p>
    ) : (
      <ul className="space-y-0.5">
        {props.comparisons.map((c) => (
          <li key={c.id}>{comparisonRow(c)}</li>
        ))}
      </ul>
    );

  const activeList = section === 'warehouses' ? warehouseList : comparisonList;

  /* ── Full panel ───────────────────────────────────────────────────── */

  const fullPanel = (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header: logo + project name + collapse chevron */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border shrink-0">
        {props.onBackToDashboard ? (
          <button
            onClick={props.onBackToDashboard}
            title="Back to dashboard"
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={28} height={28} className="rounded" />
          </button>
        ) : (
          <div className="shrink-0 opacity-70">
            <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={28} height={28} className="rounded" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground truncate">{props.projectName}</div>
          {props.importSummary && (
            <div className="text-[10px] text-positive truncate leading-tight">{props.importSummary}</div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* V-Tabs body: icon rail + active section */}
      <div className="flex-1 flex min-h-0">
        <div className="flex flex-col items-center gap-1 border-r border-border-default p-1.5 shrink-0">
          {railIcon('warehouses', 'Warehouses', WarehouseIcon)}
          {railIcon('comparisons', 'Comparisons', GitCompareArrows)}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-2 pt-2 shrink-0">
            {section === 'warehouses' ? <AddWarehouseButton /> : <AddComparisonButton />}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">{activeList}</div>
        </div>
      </div>
    </div>
  );

  /* ── Collapsed strips per variant ─────────────────────────────────── */

  const ghost = variant === 5;

  const collapsedContent = (
    <div
      onMouseEnter={ghost ? () => setGhostHover(true) : undefined}
      onMouseLeave={ghost ? () => setGhostHover(false) : undefined}
      className={cn(
        'flex h-full w-full flex-col items-center gap-1 p-1.5 transition-colors',
        ghost && !ghostHover && 'bg-transparent',
        ghost && ghostHover && 'bg-[#F4F4F2] border-r border-border',
      )}
    >
      {variant === 1 && (
        <>
          {expandButton()}
          {railIcon('warehouses', 'Warehouses', WarehouseIcon)}
          {railIcon('comparisons', 'Comparisons', GitCompareArrows)}
        </>
      )}
      {variant === 2 && (
        <>
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
          >
            <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={28} height={28} className="rounded" />
          </button>
          {expandButton()}
        </>
      )}
      {variant === 3 && (
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      {variant === 4 && (
        <>
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
          >
            <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={28} height={28} className="rounded" />
          </button>
          {expandButton()}
          {railIcon('warehouses', 'Warehouses', WarehouseIcon)}
          {railIcon('comparisons', 'Comparisons', GitCompareArrows)}
        </>
      )}
      {variant === 5 && (
        <>
          {expandButton({ ghost: true })}
          {railIcon('warehouses', 'Warehouses', WarehouseIcon, { ghost: true })}
          {railIcon('comparisons', 'Comparisons', GitCompareArrows, { ghost: true })}
        </>
      )}
    </div>
  );

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Sidebar */}
      <div
        className={cn(
          'bg-[#F4F4F2] flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-[46px] border-r border-border overflow-hidden' : 'w-72 border-r border-border',
        )}
      >
        {collapsed ? collapsedContent : fullPanel}
      </div>

      {/* Floating reopen button when hidden (variant 3) */}
      {variant === 3 && collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-[120] flex h-9 w-9 items-center justify-center rounded-full border border-border-default bg-surface text-muted-foreground shadow-lg hover:text-foreground transition-colors"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Floating segmented toolbar — bottom-right, keys 1–5 */}
      <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-0.5 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVariant(v.id)}
            title={`${v.label} — ${v.blurb} (${v.id})`}
            className={cn(
              'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold transition-colors',
              variant === v.id
                ? 'bg-accent text-accent-soft'
                : 'text-text-muted hover:bg-muted hover:text-text-primary',
            )}
          >
            {v.id}
          </button>
        ))}
      </div>
    </>
  );
}
