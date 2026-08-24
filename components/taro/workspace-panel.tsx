'use client';

/**
 * Workspace panel — the Taro left dock (final).
 *
 * A compact Warehouses dock sits at the TOP-LEFT corner of the screen.
 * There is no full-height sidebar.
 *
 * Clicking the Warehouses icon expands a compact panel OUTWARD from the dock
 * (to the right) with that section's content:
 *   • header with close
 *   • matching add button ("Add Warehouse")
 *   • scrollable list
 *
 * Interactions:
 *   • Click the active section's icon again → close the panel.
 *   • Close via X, Escape, or clicking anywhere outside.
 *   • Warehouse rows: click to select, double-click to rename.
 *
 * The app supports a single warehouse, so there is no "Add Warehouse"
 * button/action — the only warehouse is configured via the layout config.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWarehouse } from '@/lib/taro/types';
import {
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkspacePanelProps {
  // Warehouses
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  selectedWarehouseIds: Set<string>;
  onSelectWarehouse: (id: string, opts?: { additive?: boolean }) => void;
  onRenameWarehouse: (id: string, name: string) => void;

  // Dock open state — controlled from TaroApp so only one dock is open at a time
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'warehouses';
type EditingTarget = { id: string; type: Section };

export function WorkspacePanel(props: WorkspacePanelProps) {
  const [section, setSection] = useState<Section>('warehouses');
  const { isOpen: dockOpen, onOpenChange: setDockOpen } = props;

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
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  const isEditing = (id: string, type: Section) =>
    editing?.id === id && editing.type === type;

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

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Warehouses dock — icon cluster + expanding panel */}
      <div className="relative z-40 flex items-start">
        {/* Dock — compact cluster */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
          <button
            onClick={() => toggleSection('warehouses')}
            title="Warehouses"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              section === 'warehouses' && dockOpen
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <WarehouseIcon className="h-4 w-4" />
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
              <WarehouseIcon className="h-3 w-3" />
              Warehouses
              <span className="text-muted-foreground/50 font-sans">
                ({props.warehouses.length})
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
          <div className="flex-1 min-h-0 overflow-y-auto p-2">{warehouseList}</div>
        </div>
      </div>
    </>
  );
}