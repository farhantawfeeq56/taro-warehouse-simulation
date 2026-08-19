'use client';

/**
 * Left sidebar collapsed state — vartest10.
 *
 * The collapse mechanism is fixed (header chevron). When collapsed, the
 * sidebar disappears entirely and a floating access point replaces it. Each
 * variant places that access point somewhere different on screen:
 *
 *   1. Top-right toolbar — horizontal pill: logo + both section icons.
 *   2. Bottom-right pill — horizontal pill above the variant switcher.
 *   3. Top-center chip    — centered chip at the top edge.
 *   4. Right-edge dock    — slim vertical dock pinned to the right edge.
 *   5. FAB + popover      — circular button bottom-left; click opens a menu
 *                           of the two sections.
 *   6. Bottom bar         — slim full-width strip along the bottom edge.
 *   7. Corner stack       — two stacked icon squares in the bottom-right.
 *   8. Keyboard palette   — '\' opens a floating palette at the top-center;
 *                           pick a section or an add action; Esc closes.
 *   9. Canvas chip        — chip floating over the canvas (top-left area).
 *  10. Toolbar buddy      — chip anchored above the canvas toolbar
 *                           (bottom-center) with live counts.
 *
 * Clicking any access point expands the sidebar straight into that tab.
 * A floating segmented toolbar (bottom-right, keys 1–9, 0 = 10) switches
 * variants live.
 */

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import {
  Plus,
  GitCompareArrows,
  Warehouse as WarehouseIcon,
  Trash2,
  Loader2,
  PanelLeftClose,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AccessVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface WorkspacePanelAccessVariantsProps {
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

const VARIANTS: { id: AccessVariant; label: string; blurb: string }[] = [
  { id: 1, label: 'Top-right', blurb: 'Floating toolbar at the top-right' },
  { id: 2, label: 'Bottom-right', blurb: 'Floating pill above the switcher' },
  { id: 3, label: 'Top-center', blurb: 'Centered chip at the top edge' },
  { id: 4, label: 'Right dock', blurb: 'Slim vertical dock on the right edge' },
  { id: 5, label: 'FAB menu', blurb: 'Bottom-left button opens a section menu' },
  { id: 6, label: 'Bottom bar', blurb: 'Slim full-width strip at the bottom' },
  { id: 7, label: 'Corner stack', blurb: 'Two stacked icon squares bottom-right' },
  { id: 8, label: 'Palette', blurb: "'\\' opens a floating keyboard palette" },
  { id: 9, label: 'Canvas chip', blurb: 'Chip floating over the canvas (top-left)' },
  { id: 10, label: 'Toolbar buddy', blurb: 'Chip above the canvas toolbar with counts' },
];

type Section = 'warehouses' | 'comparisons';
type EditingTarget = { id: string; type: Section };

export function WorkspacePanelAccessVariants(props: WorkspacePanelAccessVariantsProps) {
  const [variant, setVariant] = useState<AccessVariant>(1);
  const [section, setSection] = useState<Section>('warehouses');
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // variant 5
  const [paletteOpen, setPaletteOpen] = useState(false); // variant 8

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

  // Reset transient state when switching variants.
  useEffect(() => {
    setMenuOpen(false);
    setPaletteOpen(false);
  }, [variant]);

  // Keyboard: 1-9 switch variants, 0 = 10.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setVariant(n as AccessVariant);
      else if (e.key === '0') setVariant(10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Variant 8: '\' toggles the palette, Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === '\\') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
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

  /** Expand into a specific tab. */
  const expandInto = (type: Section) => {
    setSection(type);
    setCollapsed(false);
    setMenuOpen(false);
    setPaletteOpen(false);
  };

  /* ── Small building blocks ────────────────────────────────────────── */

  const logoImg = (
    <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={28} height={28} className="rounded" />
  );

  /** One icon button inside a floating access point. */
  const floatIcon = (type: Section, label: string, Icon: typeof WarehouseIcon) => (
    <button
      onClick={() => expandInto(type)}
      title={`${label} — expand sidebar`}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        section === type
          ? 'bg-accent-soft text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  const floatLogo = (
    <button
      onClick={() => expandInto('warehouses')}
      title="Expand sidebar"
      className="flex h-7 w-7 items-center justify-center rounded-md hover:opacity-80 transition-opacity"
    >
      {logoImg}
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

  /* ── Full panel (expanded) ────────────────────────────────────────── */

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
            {logoImg}
          </button>
        ) : (
          <div className="shrink-0 opacity-70">{logoImg}</div>
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
          <button
            onClick={() => setSection('warehouses')}
            title="Warehouses"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              section === 'warehouses'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <WarehouseIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSection('comparisons')}
            title="Comparisons"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              section === 'comparisons'
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <GitCompareArrows className="h-4 w-4" />
          </button>
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

  /* ── Floating access points (only when collapsed) ─────────────────── */

  const floatSurface = 'fixed z-[110] flex items-center gap-1 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1';

  const renderAccessPoint = () => {
    switch (variant) {
      case 1: // Top-right toolbar
        return (
          <div className={cn(floatSurface, 'top-4 right-4')}>
            {floatLogo}
            <span className="h-4 w-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 2: // Bottom-right pill
        return (
          <div className={cn(floatSurface, 'bottom-16 right-4')}>
            {floatLogo}
            <span className="h-4 w-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 3: // Top-center chip
        return (
          <div className={cn(floatSurface, 'top-4 left-1/2 -translate-x-1/2')}>
            {floatLogo}
            <span className="h-4 w-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 4: // Right-edge dock
        return (
          <div className="fixed right-0 top-1/2 z-[110] -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-lg border border-r-0 border-border-default bg-surface shadow-lg px-1.5 py-2">
            {floatLogo}
            <span className="w-4 h-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 5: // FAB + popover (bottom-left)
        return (
          <div className="fixed bottom-4 left-4 z-[110] flex flex-col items-start gap-2">
            {menuOpen && (
              <div className="w-44 rounded-xl border border-border-default bg-surface shadow-lg p-1">
                <button
                  onClick={() => expandInto('warehouses')}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Warehouses
                  <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">{props.warehouses.length}</span>
                </button>
                <button
                  onClick={() => expandInto('comparisons')}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
                  Comparisons
                  <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">{props.comparisons.length}</span>
                </button>
              </div>
            )}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              title="Workspace menu"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border border-border-default bg-surface text-accent shadow-lg transition-colors',
                menuOpen ? 'bg-accent-soft' : 'hover:bg-accent-subtle',
              )}
            >
              <WarehouseIcon className="h-5 w-5" />
            </button>
          </div>
        );
      case 6: // Bottom bar (full-width strip)
        return (
          <div className="fixed bottom-0 inset-x-0 z-[110] flex h-11 items-center gap-3 border-t border-border-default bg-surface/95 backdrop-blur-sm px-4">
            <button
              onClick={() => expandInto('warehouses')}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted transition-colors"
            >
              {logoImg}
            </button>
            <span className="text-sm font-bold text-foreground truncate">{props.projectName}</span>
            <span className="ml-auto" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 7: // Corner stack (bottom-right, above switcher)
        return (
          <div className="fixed bottom-16 right-4 z-[110] flex flex-col gap-1.5">
            <button
              onClick={() => expandInto('warehouses')}
              title="Warehouses"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-surface text-muted-foreground shadow-lg hover:text-foreground transition-colors"
            >
              <WarehouseIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => expandInto('comparisons')}
              title="Comparisons"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-surface text-muted-foreground shadow-lg hover:text-foreground transition-colors"
            >
              <GitCompareArrows className="h-4 w-4" />
            </button>
          </div>
        );
      case 8: // Keyboard palette (top-center panel)
        return (
          paletteOpen && (
            <div className="fixed top-20 left-1/2 z-[110] w-64 -translate-x-1/2 rounded-xl border border-border-default bg-surface shadow-xl p-1.5">
              <p className="px-2 pt-1 pb-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
                Workspace — Esc to close
              </p>
              <button
                onClick={() => expandInto('warehouses')}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                Warehouses
                <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">{props.warehouses.length}</span>
              </button>
              <button
                onClick={() => expandInto('comparisons')}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
                Comparisons
                <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">{props.comparisons.length}</span>
              </button>
              <div className="mt-1 border-t border-border-default pt-1">
                <button
                  onClick={() => {
                    setPaletteOpen(false);
                    props.onAddWarehouse();
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  Add Warehouse
                </button>
                <button
                  onClick={() => {
                    setPaletteOpen(false);
                    props.onNewComparison();
                  }}
                  disabled={props.isCreatingComparison}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {props.isCreatingComparison ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  New Comparison
                </button>
              </div>
            </div>
          )
        );
      case 9: // Canvas chip (top-left, over the canvas)
        return (
          <div className={cn(floatSurface, 'top-16 left-4')}>
            {floatLogo}
            <span className="h-4 w-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
          </div>
        );
      case 10: // Toolbar buddy (above the canvas toolbar, bottom-center)
        return (
          <div className={cn(floatSurface, 'bottom-16 left-1/2 -translate-x-1/2')}>
            {floatLogo}
            <span className="h-4 w-px bg-border-default" />
            {floatIcon('warehouses', 'Warehouses', WarehouseIcon)}
            {floatIcon('comparisons', 'Comparisons', GitCompareArrows)}
            <span className="h-4 w-px bg-border-default" />
            <button
              onClick={() => expandInto('warehouses')}
              title="Expand sidebar"
              className="flex h-7 items-center rounded-md px-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
        );
    }
  };

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Sidebar */}
      <div
        className={cn(
          'bg-[#F4F4F2] flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-72 border-r border-border',
        )}
      >
        {collapsed ? null : fullPanel}
      </div>

      {/* Floating access point for the collapsed state */}
      {collapsed && renderAccessPoint()}

      {/* Floating segmented toolbar — bottom-right, keys 1–9, 0 = 10 */}
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
