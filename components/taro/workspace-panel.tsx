'use client';

/**
 * Workspace panel — the Taro left sidebar.
 *
 * Finalized as the "V-Tabs" arrangement (vartest10, variant 2): a vertical
 * icon rail on the left edge switches between the Warehouses and Comparisons
 * sections. Each rail button carries a live count badge. The app header
 * (logo + project name) sits on top and the action footer
 * (Add Warehouse / New Comparison) stays pinned at the bottom.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import { Plus, GitCompareArrows, Warehouse as WarehouseIcon, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkspacePanelProps {
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
  /** Comparison id currently being deleted — shows spinner on its trash button. */
  deletingComparisonId?: string | null;
  /** Comparison id currently being renamed — shows a brief spinner. */
  renamingComparisonId?: string | null;
}

type Section = 'warehouses' | 'comparisons';
type EditingTarget = { id: string; type: Section };

export function WorkspacePanel(props: WorkspacePanelProps) {
  const [section, setSection] = useState<Section>('warehouses');

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

  /* ── Rail buttons ─────────────────────────────────────────────────── */

  const railButton = (
    type: Section,
    label: string,
    Icon: typeof WarehouseIcon,
  ) => (
    <button
      onClick={() => setSection(type)}
      title={label}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        section === type
          ? 'bg-accent-soft text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
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

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <div className="w-72 border-r border-border bg-[#F4F4F2] flex flex-col">
      {/* App header: Logo + Project name */}
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
      </div>

      {/* V-Tabs body: icon rail + active section */}
      <div className="flex-1 flex min-h-0">
        {/* Vertical icon rail */}
        <div className="flex flex-col items-center gap-1 border-r border-border-default p-1.5 shrink-0">
          {railButton('warehouses', 'Warehouses', WarehouseIcon)}
          {railButton('comparisons', 'Comparisons', GitCompareArrows)}
        </div>

        {/* Active section */}
        <div className="flex-1 min-w-0 p-2 overflow-y-auto">
          {section === 'warehouses' ? warehouseList : comparisonList}
        </div>
      </div>

      {/* Footer: action buttons */}
      <div className="p-3 border-t border-border shrink-0 space-y-1.5">
        <button
          onClick={props.onAddWarehouse}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
            text-foreground hover:bg-muted active:bg-muted/80 transition-colors
            border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Warehouse
        </button>
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
      </div>
    </div>
  );
}
