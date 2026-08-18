'use client';

/**
 * Left sidebar — vartest10.
 *
 * Ten different ways to arrange "Warehouses" and "Comparisons" inside the
 * workspace panel. A floating segmented toolbar (bottom-right) switches
 * variants live; keys 1–0 (10 = 0) do the same.
 *
 *   1. Stacked    — Warehouses section then Comparisons section, one scroll.
 *   2. V-Tabs     — vertical icon rail on the left edge switches the section.
 *   3. H-Tabs     — horizontal tab bar at the top switches the section.
 *   4. Segmented  — segmented control at the top switches the section.
 *   5. Filter     — one merged list, filter chips All / Warehouses / Comparisons.
 *   6. Accordion  — collapsible section headers (independent toggles).
 *   7. Nested     — comparisons nested under each member warehouse.
 *   8. Zipper     — warehouse / comparison rows interleaved in one list.
 *   9. Compact    — dense stacked rows, counts inline in the header.
 *  10. Split      — warehouses and comparisons side-by-side columns.
 *
 * The app header (logo + project name) and the footer actions
 * (Add Warehouse / New Comparison) stay identical across variants — only the
 * arrangement of the two lists changes.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkspaceWarehouse, Comparison } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import {
  Plus,
  GitCompareArrows,
  Warehouse as WarehouseIcon,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types + registry                                                    */
/* ------------------------------------------------------------------ */

export type SidebarVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface WorkspacePanelVariantsProps {
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

const VARIANTS: { id: SidebarVariant; label: string; blurb: string }[] = [
  { id: 1, label: 'Stacked', blurb: 'Two stacked sections in one scroll' },
  { id: 2, label: 'V-Tabs', blurb: 'Vertical icon rail switches the section' },
  { id: 3, label: 'H-Tabs', blurb: 'Horizontal tab bar switches the section' },
  { id: 4, label: 'Segmented', blurb: 'Segmented control switches the section' },
  { id: 5, label: 'Filter', blurb: 'One merged list + filter chips' },
  { id: 6, label: 'Accordion', blurb: 'Collapsible section headers' },
  { id: 7, label: 'Nested', blurb: 'Comparisons nested under member warehouses' },
  { id: 8, label: 'Zipper', blurb: 'Warehouse / comparison rows interleaved' },
  { id: 9, label: 'Compact', blurb: 'Dense rows, counts inline in the header' },
  { id: 10, label: 'Split', blurb: 'Two side-by-side columns' },
];

type Section = 'warehouses' | 'comparisons';
type Filter = 'all' | Section;
type EditingTarget = { id: string; type: Section };

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function WorkspacePanelVariants(props: WorkspacePanelVariantsProps) {
  const [variant, setVariant] = useState<SidebarVariant>(1);
  const [section, setSection] = useState<Section>('warehouses');
  const [filter, setFilter] = useState<Filter>('all');
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    warehouses: true,
    comparisons: true,
  });

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

  // Keyboard: 1-9 switch variants, 0 = variant 10.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setVariant(n as SidebarVariant);
      else if (e.key === '0') setVariant(10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Shared rows ──────────────────────────────────────────────────── */

  /** Warehouse row — returns the button (or edit input), caller wraps in <li>. */
  const warehouseRow = (w: WorkspaceWarehouse, opts?: { dense?: boolean }) => {
    const isActive = w.id === props.activeWarehouseId;
    const isSelected = props.selectedWarehouseIds.has(w.id);
    const editingRow = isEditing(w.id, 'warehouses');
    const pad = opts?.dense ? 'px-1.5 py-1' : 'px-2 py-1.5';
    const size = opts?.dense ? 'text-[11px]' : 'text-xs';

    if (editingRow) {
      return (
        <div
          className={cn(
            'w-full rounded-md text-xs flex items-center gap-2',
            isActive ? 'bg-primary/10 ring-1 ring-primary/40' : 'ring-1 ring-primary/30',
            pad,
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
          'w-full text-left rounded-md truncate flex items-center gap-2 transition-colors',
          pad,
          size,
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

  /** Comparison row — returns the button (or edit input), caller wraps in <li>. */
  const comparisonRow = (c: Comparison, opts?: { dense?: boolean }) => {
    const isActive = c.id === props.activeComparisonId;
    const editingRow = isEditing(c.id, 'comparisons');
    const pad = opts?.dense ? 'px-1.5 py-1' : 'px-2 py-1.5';
    const size = opts?.dense ? 'text-[11px]' : 'text-xs';

    if (editingRow) {
      return (
        <div
          className={cn(
            'w-full rounded-md flex items-center gap-2 ring-1 ring-accent/30',
            pad,
            size,
          )}
        >
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
          'w-full text-left rounded-md truncate flex items-center gap-2 transition-colors group',
          pad,
          size,
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

  /* ── Shared sections (headers + lists used by several variants) ──── */

  const warehouseSectionHeader = (extra?: ReactNode) => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
        <WarehouseIcon className="h-3 w-3" />
        <span>Warehouses</span>
        <span className="text-muted-foreground/50 font-sans">({props.warehouses.length})</span>
      </div>
      {extra}
    </div>
  );

  const comparisonSectionHeader = (extra?: ReactNode) => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
        <GitCompareArrows className="h-3 w-3" />
        <span>Comparisons</span>
        <span className="text-muted-foreground/50 font-sans">({props.comparisons.length})</span>
      </div>
      {extra}
    </div>
  );

  const warehouseList = (opts?: { dense?: boolean }) =>
    props.warehouses.length === 0 ? (
      <p className="text-xs text-muted-foreground italic px-1 py-2">No warehouses yet</p>
    ) : (
      <ul className={cn('space-y-0.5', opts?.dense && 'space-y-px')}>
        {props.warehouses.map((w) => (
          <li key={w.id}>{warehouseRow(w, opts)}</li>
        ))}
      </ul>
    );

  const comparisonList = (opts?: { dense?: boolean }) =>
    props.comparisons.length === 0 ? (
      <p className="text-xs text-muted-foreground italic px-1 py-2">No comparisons yet</p>
    ) : (
      <ul className={cn('space-y-0.5', opts?.dense && 'space-y-px')}>
        {props.comparisons.map((c) => (
          <li key={c.id}>{comparisonRow(c, opts)}</li>
        ))}
      </ul>
    );

  /* ── Variant bodies ───────────────────────────────────────────────── */

  const renderBody = (v: SidebarVariant) => {
    switch (v) {
      /* 1 — Stacked: warehouses then comparisons, one scroll. */
      case 1:
        return (
          <div className="space-y-5">
            <section>
              {warehouseSectionHeader()}
              {warehouseList()}
            </section>
            <section>
              {comparisonSectionHeader()}
              {comparisonList()}
            </section>
          </div>
        );

      /* 2 — V-Tabs: vertical icon rail on the left edge. */
      case 2:
        return (
          <div className="flex h-full">
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
                {props.warehouses.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8px] font-bold text-accent-soft">
                    {props.warehouses.length}
                  </span>
                )}
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
                {props.comparisons.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8px] font-bold text-accent-soft">
                    {props.comparisons.length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex-1 min-w-0 p-2 overflow-y-auto">
              {section === 'warehouses' ? warehouseList() : comparisonList()}
            </div>
          </div>
        );

      /* 3 — H-Tabs: horizontal tab bar at the top. */
      case 3:
        return (
          <div className="flex h-full flex-col">
            <div className="flex gap-1 border-b border-border-default px-2 pt-2 shrink-0">
              {(
                [
                  { id: 'warehouses', label: 'Warehouses', count: props.warehouses.length, Icon: WarehouseIcon },
                  { id: 'comparisons', label: 'Comparisons', count: props.comparisons.length, Icon: GitCompareArrows },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSection(t.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[11px] font-bold transition-colors',
                    section === t.id ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <t.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.label}</span>
                  <span className="text-[10px] font-sans text-muted-foreground/60">({t.count})</span>
                  {section === t.id && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {section === 'warehouses' ? warehouseList() : comparisonList()}
            </div>
          </div>
        );

      /* 4 — Segmented: one shared track at the top. */
      case 4:
        return (
          <div className="flex h-full flex-col">
            <div className="p-2 pb-1 shrink-0">
              <div className="flex gap-1 rounded-xl border border-border-default bg-muted/40 p-1">
                {(
                  [
                    { id: 'warehouses', label: 'Warehouses', count: props.warehouses.length },
                    { id: 'comparisons', label: 'Comparisons', count: props.comparisons.length },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSection(t.id)}
                    className={cn(
                      'flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition-all',
                      section === t.id
                        ? 'bg-surface shadow-sm text-text-primary'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                  >
                    <span className="truncate text-[11px] font-semibold">{t.label}</span>
                    <span className="text-[10px] font-sans text-muted-foreground/70">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {section === 'warehouses' ? warehouseList() : comparisonList()}
            </div>
          </div>
        );

      /* 5 — Filter: one merged list + chips. */
      case 5: {
        const allItems: { key: string; type: Section; node: ReactNode }[] = [
          ...props.warehouses.map((w) => ({ key: `w-${w.id}`, type: 'warehouses' as const, node: warehouseRow(w) })),
          ...props.comparisons.map((c) => ({ key: `c-${c.id}`, type: 'comparisons' as const, node: comparisonRow(c) })),
        ];
        const visible = allItems.filter((it) => filter === 'all' || it.type === filter);
        const chip = (id: Filter, label: string, count: number) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors',
              filter === id
                ? 'border-accent bg-accent text-accent-soft'
                : 'border-border-default bg-surface text-text-muted hover:border-accent/40 hover:text-text-primary',
            )}
          >
            {label}
            <span className="font-sans font-semibold opacity-70">{count}</span>
          </button>
        );
        return (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              {chip('all', 'All', props.warehouses.length + props.comparisons.length)}
              {chip('warehouses', 'Warehouses', props.warehouses.length)}
              {chip('comparisons', 'Comparisons', props.comparisons.length)}
            </div>
            {visible.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1 py-2">Nothing here yet</p>
            ) : (
              <ul className="space-y-0.5">
                {visible.map((it) => (
                  <li key={it.key} className="flex items-center gap-1.5">
                    <span className="shrink-0 text-muted-foreground/50">
                      {it.type === 'warehouses' ? (
                        <WarehouseIcon className="h-3 w-3" />
                      ) : (
                        <GitCompareArrows className="h-3 w-3" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">{it.node}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }

      /* 6 — Accordion: collapsible section headers. */
      case 6: {
        const header = (
          type: Section,
          label: string,
          count: number,
          Icon: typeof WarehouseIcon,
        ) => (
          <button
            onClick={() => setOpenSections((p) => ({ ...p, [type]: !p[type] }))}
            className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              <Icon className="h-3 w-3" />
              <span>{label}</span>
              <span className="text-muted-foreground/50 font-sans">({count})</span>
            </span>
            <ChevronRight
              className={cn('h-3.5 w-3.5 text-muted-foreground/60 transition-transform', openSections[type] && 'rotate-90')}
            />
          </button>
        );
        return (
          <div className="space-y-1">
            {header('warehouses', 'Warehouses', props.warehouses.length, WarehouseIcon)}
            {openSections.warehouses && <div className="pl-1">{warehouseList()}</div>}
            {header('comparisons', 'Comparisons', props.comparisons.length, GitCompareArrows)}
            {openSections.comparisons && <div className="pl-1">{comparisonList()}</div>}
          </div>
        );
      }

      /* 7 — Nested: comparisons grouped under each member warehouse. */
      case 7: {
        const unlinked = props.comparisons.filter(
          (c) => c.warehouseIds.length === 0 || c.warehouseIds.every((id) => !props.warehouses.some((w) => w.id === id)),
        );
        return (
          <ul className="space-y-2">
            {props.warehouses.map((w) => {
              const members = props.comparisons.filter((c) => c.warehouseIds.includes(w.id));
              return (
                <li key={w.id}>
                  {warehouseRow(w)}
                  {members.length > 0 && (
                    <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border-default pl-2">
                      {members.map((c) => (
                        <li key={c.id}>{comparisonRow(c)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {unlinked.length > 0 && (
              <li>
                <p className="px-2 pt-1 pb-1 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">
                  Unlinked comparisons
                </p>
                <ul className="space-y-0.5">
                  {unlinked.map((c) => (
                    <li key={c.id}>{comparisonRow(c)}</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        );
      }

      /* 8 — Zipper: warehouse / comparison rows interleaved. */
      case 8: {
        const zipped: { key: string; type: Section; node: ReactNode }[] = [];
        const maxLen = Math.max(props.warehouses.length, props.comparisons.length);
        for (let i = 0; i < maxLen; i++) {
          const w = props.warehouses[i];
          if (w) zipped.push({ key: `w-${w.id}`, type: 'warehouses', node: warehouseRow(w) });
          const c = props.comparisons[i];
          if (c) zipped.push({ key: `c-${c.id}`, type: 'comparisons', node: comparisonRow(c) });
        }
        if (zipped.length === 0) {
          return <p className="text-xs text-muted-foreground italic px-1 py-2">No warehouses or comparisons yet</p>;
        }
        return (
          <ul className="space-y-0.5">
            {zipped.map((it) => (
              <li key={it.key} className="flex items-center gap-1.5">
                <span className="shrink-0 text-muted-foreground/50">
                  {it.type === 'warehouses' ? (
                    <WarehouseIcon className="h-3 w-3" />
                  ) : (
                    <GitCompareArrows className="h-3 w-3" />
                  )}
                </span>
                <div className="flex-1 min-w-0">{it.node}</div>
              </li>
            ))}
          </ul>
        );
      }

      /* 9 — Compact: dense stacked rows, counts inline. */
      case 9:
        return (
          <div className="space-y-4">
            <section>
              {warehouseSectionHeader(
                <span className="text-[10px] font-sans text-muted-foreground/60">{props.warehouses.length} total</span>,
              )}
              {warehouseList({ dense: true })}
            </section>
            <section>
              {comparisonSectionHeader(
                <span className="text-[10px] font-sans text-muted-foreground/60">{props.comparisons.length} total</span>,
              )}
              {comparisonList({ dense: true })}
            </section>
          </div>
        );

      /* 10 — Split: two side-by-side columns. */
      case 10:
        return (
          <div className="flex h-full gap-0">
            <div className="flex-1 min-w-0 border-r border-border-default p-2 overflow-y-auto">
              {warehouseSectionHeader()}
              {warehouseList()}
            </div>
            <div className="flex-1 min-w-0 p-2 overflow-y-auto">
              {comparisonSectionHeader()}
              {comparisonList()}
            </div>
          </div>
        );
    }
  };

  /* ── Floating variant toolbar (bottom-right, keys 1–0) ───────────── */

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

      {/* Workspace body — the variant switches only this region */}
      <div className="flex-1 min-h-0">
        {variant === 2 || variant === 3 || variant === 4 || variant === 10 ? (
          renderBody(variant)
        ) : (
          <div className="h-full overflow-y-auto p-3">{renderBody(variant)}</div>
        )}
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

      {/* Floating segmented toolbar — bottom-right, keys 1–0 */}
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
    </div>
  );
}
