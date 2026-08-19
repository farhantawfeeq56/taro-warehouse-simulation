'use client';

/**
 * Left sidebar collapsed state — vartest10 (left-anchored paradigms).
 *
 * The collapse mechanism is fixed (header chevron). When collapsed the
 * sidebar is gone. Every variant brings the workspace back from the LEFT
 * edge — nothing migrates to the right, top, or bottom:
 *
 *   1. Drawer overlay   — an edge tab opens the panel sliding OVER the canvas
 *                         with a dim scrim; click the scrim to close.
 *   2. Edge tab         — a folder-style tab at the left edge slides the panel
 *                         out (no scrim).
 *   3. Hover peek + pin — an invisible hot zone on the left edge peeks the
 *                         panel; pin locks it open, mouse-leave slides it back.
 *   4. Header menu      — a hamburger button top-left with a dropdown of the
 *                         two sections (the dropdown drops from the left edge).
 *   5. Left dock        — a slim vertical dock on the left edge; clicking it
 *                         expands a mini panel outward (no full-height slide).
 *   6. Left palette     — '\' opens a searchable palette anchored to the left
 *                         edge (below the top), not centered.
 *   7. Left toolbar     — a horizontal toolbar tucked into the top-left corner
 *                         (below the app header area), not a full-width bar.
 *   8. Left window      — a draggable inspector window that can only live on
 *                         the left half of the canvas.
 *   9. Left edge strip  — an IDE-style vertical status strip on the left edge
 *                         listing counts; hover to see labels.
 *  10. Context + hint   — selecting a warehouse collapses the sidebar,
 *                         selecting a comparison expands it; '\' toggles and a
 *                         hint appears on the left edge.
 *
 * A floating segmented toolbar (bottom-right, keys 1–9, 0 = 10) switches
 * variants live.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import {
  Plus,
  GitCompareArrows,
  Warehouse as WarehouseIcon,
  Trash2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Menu,
  Search,
  Pin,
  PinOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AccessVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface WorkspacePanelParadigmVariantsProps {
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
  { id: 1, label: 'Drawer', blurb: 'Edge tab + panel slides over canvas with scrim' },
  { id: 2, label: 'Edge tab', blurb: 'Folder-style tab at the left edge' },
  { id: 3, label: 'Peek', blurb: 'Hover hot zone peeks; pin to lock' },
  { id: 4, label: 'Header menu', blurb: 'Hamburger top-left + dropdown' },
  { id: 5, label: 'Left dock', blurb: 'Slim left-edge dock expands a mini panel' },
  { id: 6, label: 'Left palette', blurb: "'\\' opens a left-anchored palette" },
  { id: 7, label: 'Left toolbar', blurb: 'Horizontal toolbar tucked top-left' },
  { id: 8, label: 'Left window', blurb: 'Draggable window locked to the left half' },
  { id: 9, label: 'Edge strip', blurb: 'Vertical IDE-style status strip left edge' },
  { id: 10, label: 'Context', blurb: 'Auto-collapse/expand on selection; \\ toggles' },
];

type Section = 'warehouses' | 'comparisons';
type EditingTarget = { id: string; type: Section };

interface PaletteItem {
  id: string;
  kind: Section;
  label: string;
  Icon: typeof WarehouseIcon;
}

export function WorkspacePanelParadigmVariants(props: WorkspacePanelParadigmVariantsProps) {
  const [variant, setVariant] = useState<AccessVariant>(1);
  const [section, setSection] = useState<Section>('warehouses');
  // Master collapse state.
  const [collapsed, setCollapsed] = useState(false);
  // Variant-specific states.
  const [overlayOpen, setOverlayOpen] = useState(false); // 1, 2, 3
  const [pinned, setPinned] = useState(false);           // 3
  const [menuOpen, setMenuOpen] = useState(false);       // 4
  const [dockOpen, setDockOpen] = useState(false);       // 5
  const [paletteOpen, setPaletteOpen] = useState(false); // 6
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [winPos, setWinPos] = useState({ x: 24, y: 72 }); // 8
  const [stripHover, setStripHover] = useState(false);   // 9

  // Inline rename
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing]);

  // Reset variant-specific states when switching variants.
  useEffect(() => {
    setOverlayOpen(false);
    setPinned(false);
    setMenuOpen(false);
    setDockOpen(false);
    setPaletteOpen(false);
    setPaletteQuery('');
    setPaletteIndex(0);
    setWinPos({ x: 24, y: 72 });
    setStripHover(false);
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

  // Variants 6 & 10: '\' toggles (palette / sidebar). Esc closes popovers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setMenuOpen(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === '\\') {
        e.preventDefault();
        if (variant === 6) setPaletteOpen((o) => !o);
        else if (variant === 10) setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  // Variant 10: context-aware auto collapse/expand.
  const contextInitRef = useRef(true);
  useEffect(() => {
    if (variant !== 10) return;
    if (contextInitRef.current) {
      contextInitRef.current = false;
      return;
    }
    if (props.activeWarehouseId != null) setCollapsed(true);
    else if (props.activeComparisonId != null) setCollapsed(false);
  }, [variant, props.activeWarehouseId, props.activeComparisonId]);

  // Focus the palette input when it opens.
  useEffect(() => {
    if (!paletteOpen) return;
    setPaletteQuery('');
    setPaletteIndex(0);
    requestAnimationFrame(() => paletteInputRef.current?.focus());
  }, [paletteOpen]);

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

  /** Expand the sidebar straight into a tab and close all sub-UIs. */
  const expandInto = (type: Section) => {
    setSection(type);
    setCollapsed(false);
    setOverlayOpen(false);
    setMenuOpen(false);
    setDockOpen(false);
    setPaletteOpen(false);
  };

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

  /* ── Full panel (expanded / drawer content) ───────────────────────── */

  const fullPanel = (closeFn: () => void, opts?: { peek?: boolean }) => (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header: logo + project name + collapse control */}
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
        {opts?.peek && (
          <button
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Unpin (auto-hide)' : 'Pin open'}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          onClick={closeFn}
          title="Close sidebar"
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

  /* ── Palette items (variant 6) ────────────────────────────────────── */

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const whs: PaletteItem[] = props.warehouses.map((w) => ({
      id: w.id,
      kind: 'warehouses',
      label: w.name,
      Icon: WarehouseIcon,
    }));
    const comps: PaletteItem[] = props.comparisons.map((c) => ({
      id: c.id,
      kind: 'comparisons',
      label: c.name,
      Icon: GitCompareArrows,
    }));
    const all = [...whs, ...comps];
    const q = paletteQuery.trim().toLowerCase();
    return q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all;
  }, [props.warehouses, props.comparisons, paletteQuery]);

  const pickPalette = (it: PaletteItem) => {
    expandInto(it.kind);
    if (it.kind === 'warehouses') props.onSelectWarehouse(it.id);
    else props.onSelectComparison(it.id);
  };

  const onPaletteKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPaletteIndex((i) => Math.min(i + 1, paletteItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPaletteIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = paletteItems[paletteIndex];
      if (it) pickPalette(it);
    } else if (e.key === 'Escape') {
      setPaletteOpen(false);
    }
  };

  /* ── Inspector window drag (variant 8, clamped to the left half) ──── */

  const winDragRef = useRef<{ sx: number; sy: number; bx: number; by: number } | null>(null);
  const onWinPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    winDragRef.current = { sx: e.clientX, sy: e.clientY, bx: winPos.x, by: winPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onWinPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = winDragRef.current;
    if (!d) return;
    const maxX = Math.max(0, window.innerWidth / 2 - 240);
    setWinPos({
      x: Math.max(0, Math.min(maxX, d.bx + e.clientX - d.sx)),
      y: Math.max(0, Math.min(window.innerHeight - 80, d.by + e.clientY - d.sy)),
    });
  };
  const onWinPointerUp = () => {
    winDragRef.current = null;
  };

  /* ── Shared chip styles ───────────────────────────────────────────── */

  const barChip = (active: boolean) =>
    cn(
      'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
      active ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Sidebar (expanded) or empty strip (collapsed) */}
      <div
        className={cn(
          'bg-[#F4F4F2] flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-72 border-r border-border',
        )}
      >
        {collapsed ? null : fullPanel(() => setCollapsed(true))}
      </div>

      {collapsed && (
        <>
          {/* 1 & 2 — edge tab trigger */}
          {(variant === 1 || variant === 2) && !overlayOpen && (
            <button
              onClick={() => setOverlayOpen(true)}
              title="Open workspace drawer"
              className={cn(
                'fixed left-0 top-1/2 z-[110] -translate-y-1/2 flex flex-col items-center justify-center rounded-r-lg border border-l-0 border-border-default bg-surface text-muted-foreground shadow-lg hover:text-foreground transition-colors',
                variant === 1 ? 'h-16 w-6' : 'h-12 w-7',
              )}
            >
              <ChevronRight className="h-4 w-4" />
              {variant === 2 && (
                <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wider leading-none">taro</span>
              )}
            </button>
          )}

          {/* 1 & 2 — drawer overlay (slides from the left) */}
          {(variant === 1 || variant === 2) && (
            <>
              {variant === 1 && overlayOpen && (
                <div className="fixed inset-0 z-[105] bg-black/25" onClick={() => setOverlayOpen(false)} />
              )}
              <div
                className={cn(
                  'fixed left-0 top-0 bottom-0 z-[110] w-72 bg-[#F4F4F2] border-r border-border shadow-2xl transition-transform duration-300',
                  !overlayOpen && '-translate-x-full',
                )}
              >
                {fullPanel(() => setOverlayOpen(false))}
              </div>
            </>
          )}

          {/* 3 — hover peek + pin (left edge hot zone) */}
          {variant === 3 && (
            <>
              {!overlayOpen && (
                <div
                  className="fixed left-0 top-0 bottom-0 z-[109] w-2 cursor-pointer"
                  onMouseEnter={() => setOverlayOpen(true)}
                  title="Peek workspace"
                />
              )}
              <div
                className={cn(
                  'fixed left-0 top-0 bottom-0 z-[110] w-72 bg-[#F4F4F2] border-r border-border shadow-2xl transition-transform duration-300',
                  !overlayOpen && '-translate-x-full',
                )}
                onMouseLeave={() => {
                  if (!pinned) setOverlayOpen(false);
                }}
              >
                {fullPanel(
                  () => {
                    setOverlayOpen(false);
                    setPinned(false);
                  },
                  { peek: true },
                )}
              </div>
            </>
          )}

          {/* 4 — header hamburger menu (top-left) */}
          {variant === 4 && (
            <>
              {menuOpen && <div className="fixed inset-0 z-[104]" onClick={() => setMenuOpen(false)} />}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                title="Workspace menu"
                className="fixed left-4 top-4 z-[115] flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-surface text-muted-foreground shadow-lg hover:text-foreground transition-colors"
              >
                <Menu className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="fixed left-4 top-14 z-[115] w-52 rounded-xl border border-border-default bg-surface shadow-xl p-1">
                  <p className="px-2 pt-1 pb-1 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70">
                    Workspace
                  </p>
                  <button
                    onClick={() => expandInto('warehouses')}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Warehouses
                    <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">
                      {props.warehouses.length}
                    </span>
                  </button>
                  <button
                    onClick={() => expandInto('comparisons')}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
                    Comparisons
                    <span className="ml-auto text-[10px] font-sans text-muted-foreground/60">
                      {props.comparisons.length}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* 5 — left dock (slim left-edge dock that expands a mini panel) */}
          {variant === 5 && (
            <>
              {dockOpen && <div className="fixed inset-0 z-[104]" onClick={() => setDockOpen(false)} />}
              <div className="fixed left-0 top-0 bottom-0 z-[110] flex items-center">
                <div className="flex flex-col items-center gap-1.5 rounded-r-xl border border-l-0 border-border-default bg-surface shadow-lg px-1.5 py-2">
                  <button
                    onClick={() => {
                      setSection('warehouses');
                      setDockOpen(true);
                    }}
                    title="Warehouses"
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                      section === 'warehouses' ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <WarehouseIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSection('comparisons');
                      setDockOpen(true);
                    }}
                    title="Comparisons"
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                      section === 'comparisons' ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <GitCompareArrows className="h-4 w-4" />
                  </button>
                </div>
                {/* Mini panel expands OUTWARD from the dock (still hugging the left edge) */}
                <div
                  className={cn(
                    'flex h-72 w-64 flex-col overflow-hidden rounded-r-xl border border-l-0 border-border-default bg-[#F4F4F2] shadow-2xl transition-all duration-300',
                    dockOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0 pointer-events-none',
                  )}
                >
                  <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
                      {section === 'warehouses' ? 'Warehouses' : 'Comparisons'}
                    </span>
                    <button
                      onClick={() => expandInto(section)}
                      title="Expand to sidebar"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-2 pt-2 shrink-0">
                    {section === 'warehouses' ? <AddWarehouseButton /> : <AddComparisonButton />}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2">{activeList}</div>
                </div>
              </div>
            </>
          )}

          {/* 6 — left-anchored command palette */}
          {variant === 6 && paletteOpen && (
            <div className="fixed left-4 top-16 z-[110] w-80 rounded-xl border border-border-default bg-surface shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={paletteInputRef}
                  value={paletteQuery}
                  onChange={(e) => {
                    setPaletteQuery(e.target.value);
                    setPaletteIndex(0);
                  }}
                  onKeyDown={onPaletteKey}
                  placeholder="Search warehouses & comparisons…"
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border-default bg-muted px-1 font-sans text-[9px] font-bold text-muted-foreground">
                  esc
                </kbd>
              </div>
              <ul className="max-h-72 overflow-y-auto p-1">
                {paletteItems.map((it, i) => (
                  <li key={`${it.kind}-${it.id}`}>
                    <button
                      onClick={() => pickPalette(it)}
                      onMouseEnter={() => setPaletteIndex(i)}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground',
                        i === paletteIndex ? 'bg-muted' : '',
                      )}
                    >
                      <it.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{it.label}</span>
                      <span className="ml-auto text-[9px] uppercase font-bold text-muted-foreground/50">
                        {it.kind === 'warehouses' ? 'warehouse' : 'comparison'}
                      </span>
                    </button>
                  </li>
                ))}
                {paletteItems.length === 0 && (
                  <li className="px-2 py-2 text-xs text-muted-foreground italic">No matches</li>
                )}
              </ul>
            </div>
          )}

          {/* 7 — left toolbar (tucked into the top-left, below the header area) */}
          {variant === 7 && (
            <div className="fixed left-4 top-4 z-[110] flex h-9 items-center gap-1 rounded-full border border-border-default bg-surface/95 px-1.5 shadow-lg">
              <img src="/taro%20transpara%20svg.svg" alt="Taro logo" width={20} height={20} className="rounded shrink-0" />
              <span className="max-w-24 truncate text-[11px] font-bold text-foreground">{props.projectName}</span>
              <span className="h-4 w-px bg-border-default" />
              <button onClick={() => expandInto('warehouses')} className={barChip(section === 'warehouses')}>
                <WarehouseIcon className="h-3.5 w-3.5" />
                Warehouses
              </button>
              <button onClick={() => expandInto('comparisons')} className={barChip(section === 'comparisons')}>
                <GitCompareArrows className="h-3.5 w-3.5" />
                Comparisons
              </button>
            </div>
          )}

          {/* 8 — draggable inspector window (clamped to the left half) */}
          {variant === 8 && (
            <div
              className="fixed z-[110] w-64 rounded-xl border border-border-default bg-surface shadow-2xl flex flex-col overflow-hidden"
              style={{ left: winPos.x, top: winPos.y }}
            >
              <div
                className="flex items-center gap-2 bg-muted/40 px-3 py-2 cursor-grab active:cursor-grabbing select-none"
                onPointerDown={onWinPointerDown}
                onPointerMove={onWinPointerMove}
                onPointerUp={onWinPointerUp}
                onPointerCancel={onWinPointerUp}
              >
                <WarehouseIcon className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-bold text-foreground">Workspace</span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setCollapsed(false)}
                    title="Dock to sidebar"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-1 border-b border-border-default p-1">
                <button onClick={() => setSection('warehouses')} className={barChip(section === 'warehouses')}>
                  <WarehouseIcon className="h-3 w-3" />
                  Warehouses
                </button>
                <button onClick={() => setSection('comparisons')} className={barChip(section === 'comparisons')}>
                  <GitCompareArrows className="h-3 w-3" />
                  Comparisons
                </button>
              </div>
              <div className="max-h-64 min-h-0 overflow-y-auto p-1">{activeList}</div>
            </div>
          )}

          {/* 9 — left edge strip (vertical IDE-style status strip) */}
          {variant === 9 && (
            <div
              className="fixed left-0 top-1/2 z-[110] -translate-y-1/2 flex flex-col items-center gap-1 rounded-r-lg border border-l-0 border-border-default bg-surface px-1 py-2 shadow-lg"
              onMouseEnter={() => setStripHover(true)}
              onMouseLeave={() => setStripHover(false)}
            >
              <button
                onClick={() => expandInto('warehouses')}
                title="Warehouses"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  section === 'warehouses' ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <WarehouseIcon className="h-4 w-4" />
              </button>
              <span className="text-[9px] font-sans font-bold text-muted-foreground">
                {stripHover ? props.warehouses.length : 'W'}
              </span>
              <span className="w-4 h-px bg-border-default" />
              <button
                onClick={() => expandInto('comparisons')}
                title="Comparisons"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  section === 'comparisons' ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <GitCompareArrows className="h-4 w-4" />
              </button>
              <span className="text-[9px] font-sans font-bold text-muted-foreground">
                {stripHover ? props.comparisons.length : 'C'}
              </span>
            </div>
          )}

          {/* 10 — context hint (left edge) */}
          {variant === 10 && (
            <div className="fixed left-4 top-1/2 z-[110] -translate-y-1/2 flex items-center gap-2 rounded-full border border-border-default bg-surface/95 px-3 py-2 text-[11px] text-muted-foreground shadow-lg">
              <kbd className="rounded border border-border-default bg-muted px-1 font-sans text-[10px] font-bold text-foreground">
                \
              </kbd>
              Open workspace
            </div>
          )}
        </>
      )}

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
