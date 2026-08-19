'use client';

/**
 * Workspace panel — the Taro left sidebar (final).
 *
 * A slim left dock is the ONLY sidebar — there is no expanded full-height
 * sidebar anymore. The dock holds the Taro logo (back to dashboard) and
 * the two section icons (Warehouses / Comparisons).
 *
 * Clicking a section icon expands a compact panel OUTWARD from the dock
 * (still hugging the left edge) with that section's content:
 *   • header with close
 *   • matching add button ("Add Warehouse" / "New Comparison")
 *   • scrollable list
 *
 * Interactions:
 *   • Click the active section's icon again → close the panel.
 *   • Click the other icon → switch section (panel stays open).
 *   • Close via X, Escape, or clicking anywhere outside.
 *   • Warehouse rows: click to select, shift-click multi-select,
 *     double-click to rename.
 *   • Comparison rows: click to select, double-click to rename,
 *     trash button to delete, "nw" member count.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import {
  Plus,
  GitCompareArrows,
  Warehouse as WarehouseIcon,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
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
  const [dockOpen, setDockOpen] = useState(false);

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

  // Escape closes the dock panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Dock icon click: toggle open if same section, else switch + open. */
  const toggleSection = (t: Section) => {
    if (dockOpen && section === t) {
      setDockOpen(false);
      return;
    }
    setSection(t);
    setDockOpen(true);
  };

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

  /* ── Add buttons ──────────────────────────────────────────────────── */

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

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Click-outside overlay — closes the dock panel (kept under the dock) */}
      {dockOpen && <div className="fixed inset-0 z-30" onClick={() => setDockOpen(false)} />}

      {/* Left dock + expanding mini panel */}
      <div className="fixed left-0 top-0 bottom-0 z-40 flex items-center">
        {/* Dock — compact cluster: logo, warehouses, comparisons */}
        <div className="flex flex-col items-center gap-1.5 rounded-r-xl border border-l-0 border-border-default bg-surface shadow-lg px-1.5 py-2">
          {/* Logo — always links to the main page (dashboard) */}
          <a
            href="/"
            onClick={(e) => {
              if (props.onBackToDashboard) {
                e.preventDefault();
                props.onBackToDashboard();
              }
            }}
            title="Taro — back to main page"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={22} height={22} className="rounded" />
          </a>

          <div className="w-6 border-t border-border-default" />

          <button
            onClick={() => toggleSection('warehouses')}
            title="Warehouses"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              section === 'warehouses'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <WarehouseIcon className="h-4 w-4" />
            {section === 'warehouses' && dockOpen && (
              <span className="absolute left-1 right-1 -bottom-0.5 h-0.5 rounded-full bg-accent" />
            )}
          </button>
          <button
            onClick={() => toggleSection('comparisons')}
            title="Comparisons"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              section === 'comparisons'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <GitCompareArrows className="h-4 w-4" />
            {section === 'comparisons' && dockOpen && (
              <span className="absolute left-1 right-1 -bottom-0.5 h-0.5 rounded-full bg-accent" />
            )}
          </button>
        </div>

        {/* Mini panel — expands OUTWARD from the dock (still hugging the left edge) */}
        <div
          className={cn(
            'flex h-72 w-64 flex-col overflow-hidden rounded-r-xl border border-l-0 border-border-default bg-[#F4F4F2] shadow-2xl transition-all duration-300',
            dockOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              {section === 'warehouses' ? (
                <WarehouseIcon className="h-3 w-3" />
              ) : (
                <GitCompareArrows className="h-3 w-3" />
              )}
              {section === 'warehouses' ? 'Warehouses' : 'Comparisons'}
              <span className="text-muted-foreground/50 font-sans">
                ({section === 'warehouses' ? props.warehouses.length : props.comparisons.length})
              </span>
            </span>
            <button
              onClick={() => setDockOpen(false)}
              title="Close (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-2 pt-2 shrink-0">
            {section === 'warehouses' ? <AddWarehouseButton /> : <AddComparisonButton />}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">{activeList}</div>
        </div>
      </div>
    </>
  );
}
