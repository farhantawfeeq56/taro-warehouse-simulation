'use client';

/**
 * Preview stats — vartest10.
 *
 * The four warehouse summary cards under the layout-config preview come in
 * TEN UX variants (1–10). Each variant is a different INFORMATION
 * ARCHITECTURE for the same data — not just a recolor:
 *
 *   1. Grid      — classic 2×2 bordered cards, title-up, bullet rows.
 *   2. Rows      — four full-width stacked rows, icon chip + inline values.
 *   3. Banner    — first stat as a wide hero banner, three cards below.
 *   4. Quadrant  — 2×2 tiles with big colored icon chips.
 *   5. Table     — grouped table: stat section headers + metric rows.
 *   6. Pane      — one pane, left = names+primes, right = detail lists.
 *   7. Stepper   — four connected steps with numbered badges.
 *   8. Rings     — 2×2 SVG donut gauges with center values.
 *   9. Accordion — collapsible rows, one open at a time.
 *  10. Spec      — comparison sheet: stat | detail | status per row.
 *
 * A floating segmented toolbar sits at the bottom-right of the preview.
 * Keys 1–9 switch variants, 0 switches to variant 10.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Boxes,
  Check,
  ChevronDown,
  Layers,
  LayoutGrid,
  Target,
  type LucideIcon,
} from 'lucide-react';

export type PreviewMode = 'layout' | 'demand' | 'affinity';
export type StatVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface PreviewStatRow {
  label: string;
  value?: string;
}

/* ------------------------------------------------------------------------ */
/* Shared stat data                                                          */
/* ------------------------------------------------------------------------ */

interface Stat {
  title: string;
  icon: LucideIcon;
  rows: PreviewStatRow[];
  /** Representative percentage for ring / status visuals. */
  ring: number;
  note?: string;
}

const STATS: Stat[] = [
  {
    title: 'Storage Footprint',
    icon: Boxes,
    rows: [
      { label: '420', value: 'single-bin' },
      { label: '580', value: 'multi-bin' },
      { label: 'mean', value: '2.4' },
      { label: 'needs', value: '3,200 bins' },
    ],
    ring: 58,
  },
  {
    title: 'Slotting Bias',
    icon: Target,
    rows: [
      { label: '2,450 / 2,500', value: 'SKUs placed' },
      { label: '7,480 / 7,500', value: 'bins used' },
    ],
    ring: 98,
  },
  {
    title: 'Category Clustering',
    icon: Layers,
    rows: [
      { label: '32', value: 'categories' },
      { label: 'clustering', value: '40%' },
    ],
    ring: 40,
    note: 'Each color represents a category.',
  },
  {
    title: 'Footprint',
    icon: LayoutGrid,
    rows: [
      { label: '2,500', value: 'shelves' },
      { label: '62%', value: 'of 4,000 cells' },
      { label: '7,500', value: 'bins' },
    ],
    ring: 62,
  },
];

/* ------------------------------------------------------------------------ */
/* Shared pieces                                                             */
/* ------------------------------------------------------------------------ */

const ROW_ITEM = ({ r }: { r: PreviewStatRow }) => (
  <li className="flex items-baseline gap-1.5 text-[11px]">
    <span className="font-semibold text-text-primary">{r.label}</span>
    {r.value && <span className="text-text-muted">{r.value}</span>}
  </li>
);

const NOTE = ({ text }: { text?: string }) =>
  text ? <p className="text-[10px] text-text-muted mt-1">{text}</p> : null;

function IconChip({ icon: Icon, tone }: { icon: LucideIcon; tone?: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        tone ?? 'bg-accent-soft text-accent'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* 1 — Grid: classic 2×2 cards                                               */
/* ------------------------------------------------------------------------ */

function VariantGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {STATS.map((s) => (
        <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
          <div className="flex items-center gap-2 mb-1.5">
            <IconChip icon={s.icon} />
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
          </div>
          <ul className="space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
          <NOTE text={s.note} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 2 — Rows: four full-width stacked rows                                    */
/* ------------------------------------------------------------------------ */

function VariantRows() {
  return (
    <div className="w-full divide-y divide-border-default rounded-lg border border-border-default bg-surface">
      {STATS.map((s) => (
        <div key={s.title} className="flex items-center gap-3 px-3 py-2">
          <IconChip icon={s.icon} />
          <p className="w-40 shrink-0 text-[11px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
          <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
            {s.rows.map((r) => (
              <li key={r.label} className="flex items-baseline gap-1 text-[11px]">
                <span className="font-semibold text-text-primary">{r.label}</span>
                {r.value && <span className="text-text-muted">{r.value}</span>}
              </li>
            ))}
          </ul>
          {s.note && <span className="ml-auto hidden sm:inline text-[10px] text-text-muted">{s.note}</span>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 3 — Banner: first stat is a hero, three follow below                      */
/* ------------------------------------------------------------------------ */

function VariantBanner() {
  const [first, ...rest] = STATS;
  return (
    <div className="w-full space-y-2">
      <div className="rounded-lg bg-accent px-4 py-3 text-accent-soft flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-soft/70">{first.title}</p>
          <p className="text-3xl font-bold leading-tight">
            3,200 <span className="text-sm font-medium text-accent-soft/80">bins needed</span>
          </p>
        </div>
        <ul className="hidden sm:block space-y-0.5 text-right">
          {first.rows.map((r) => (
            <li key={r.label} className="text-[11px]">
              <span className="font-semibold">{r.label}</span>{' '}
              {r.value && <span className="text-accent-soft/70">{r.value}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {rest.map((s) => (
          <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1">{s.title}</p>
            <ul className="space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
            <NOTE text={s.note} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 4 — Quadrant: 2×2 tiles with big icon chips                               */
/* ------------------------------------------------------------------------ */

const QUAD_TONES = ['bg-accent text-accent-soft', 'bg-primary/10 text-primary', 'bg-warning/15 text-warning', 'bg-accent-soft text-accent'];

function VariantQuadrant() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {STATS.map((s, i) => (
        <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2.5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${QUAD_TONES[i % QUAD_TONES.length]}`}>
              <s.icon className="h-4 w-4" />
            </span>
            <p className="text-xs font-bold text-text-primary">{s.title}</p>
          </div>
          <ul className="space-y-0.5 flex-1">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
          <NOTE text={s.note} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 5 — Table: grouped sections with header rows                              */
/* ------------------------------------------------------------------------ */

function VariantTable() {
  return (
    <div className="w-full rounded-lg border border-border-default overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-1.5 bg-muted/60 text-[9px] font-bold uppercase tracking-wide text-text-muted">
        <span>Stat</span>
        <span>Value</span>
      </div>
      {STATS.map((s) => (
        <div key={s.title}>
          <div className="grid grid-cols-[1fr_auto] gap-4 items-center px-3 py-1.5 bg-accent-soft/60">
            <span className="flex items-center gap-2 text-[11px] font-bold text-text-primary">
              <s.icon className="h-3 w-3 text-accent" />
              {s.title}
            </span>
            <span className="text-[11px] font-bold text-accent">{s.ring}%</span>
          </div>
          <div className="divide-y divide-border-default/60">
            {s.rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[1fr_auto] gap-4 px-3 py-1 text-[11px]">
                <span className="text-text-muted">{r.label}</span>
                <span className="font-semibold text-text-primary">{r.value ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 6 — Pane: single container, left primes / right details                   */
/* ------------------------------------------------------------------------ */

function VariantPane() {
  return (
    <div className="w-full rounded-lg border border-border-default bg-surface p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {STATS.map((s) => (
        <div key={s.title} className="flex items-start justify-between gap-3 border-b border-border-default/70 pb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
            <p className="text-xl font-bold text-text-primary leading-tight mt-0.5">{s.rows[0].label}</p>
          </div>
          <ul className="text-right space-y-0.5">
            {s.rows.slice(1).map((r) => (
              <li key={r.label} className="text-[11px]">
                <span className="font-semibold text-text-primary">{r.label}</span>{' '}
                {r.value && <span className="text-text-muted">{r.value}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 7 — Stepper: connected numbered steps                                     */
/* ------------------------------------------------------------------------ */

function VariantStepper() {
  return (
    <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
      {STATS.map((s, i) => (
        <div key={s.title} className="flex-1 flex sm:flex-col items-center sm:items-stretch gap-2 min-w-0">
          <div className="flex flex-col items-center self-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-soft text-[11px] font-bold">
              {i + 1}
            </span>
            {i < STATS.length - 1 && (
              <span className="hidden sm:block w-px flex-1 bg-border-default my-1" />
            )}
          </div>
          <div className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-2 mb-2 sm:mb-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
            <ul className="mt-1 space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 8 — Rings: 2×2 SVG donut gauges                                           */
/* ------------------------------------------------------------------------ */

function Ring({ value, title }: { value: number; title: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-2.5">
      <svg width="48" height="48" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="-mt-9 text-center">
        <p className="text-lg font-bold text-text-primary leading-none">{pct}%</p>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted text-center">{title}</p>
    </div>
  );
}

function VariantRings() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
      {STATS.map((s) => (
        <Ring key={s.title} value={s.ring} title={s.title} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 9 — Accordion: collapsible rows, one open at a time                       */
/* ------------------------------------------------------------------------ */

function VariantAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="w-full divide-y divide-border-default rounded-lg border border-border-default bg-surface">
      {STATS.map((s, i) => {
        const isOpen = open === i;
        return (
          <div key={s.title}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
            >
              <IconChip icon={s.icon} />
              <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-text-primary">{s.title}</span>
              <span className="text-[11px] font-semibold text-text-muted">{s.rows[0].label}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3 pb-2.5 pl-[52px]">
                <ul className="space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
                <NOTE text={s.note} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 10 — Spec: comparison sheet with per-stat status                          */
/* ------------------------------------------------------------------------ */

function VariantSpec() {
  return (
    <div className="w-full rounded-lg border border-border-default bg-surface">
      {STATS.map((s, i) => (
        <div key={s.title} className={`flex items-center gap-3 px-3 py-2 ${i < STATS.length - 1 ? 'border-b border-border-default/70' : ''}`}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <s.icon className="h-3.5 w-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-text-primary">{s.title}</p>
            <p className="text-[10px] text-text-muted truncate">
              {s.rows.map((r) => `${r.label}${r.value ? ` ${r.value}` : ''}`).join(' · ')}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-positive">
            <Check className="h-3 w-3" />
            {s.ring}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Registry + toolbar                                                        */
/* ------------------------------------------------------------------------ */

const VARIANTS: { id: StatVariant; label: string; render: () => ReactNode }[] = [
  { id: 1, label: 'Grid', render: () => <VariantGrid /> },
  { id: 2, label: 'Rows', render: () => <VariantRows /> },
  { id: 3, label: 'Banner', render: () => <VariantBanner /> },
  { id: 4, label: 'Quadrant', render: () => <VariantQuadrant /> },
  { id: 5, label: 'Table', render: () => <VariantTable /> },
  { id: 6, label: 'Pane', render: () => <VariantPane /> },
  { id: 7, label: 'Stepper', render: () => <VariantStepper /> },
  { id: 8, label: 'Rings', render: () => <VariantRings /> },
  { id: 9, label: 'Accordion', render: () => <VariantAccordion /> },
  { id: 10, label: 'Spec', render: () => <VariantSpec /> },
];

/** Floating segmented toolbar — bottom-right, keyboard-driven (1–9, 0 = 10). */
function VariantToolbar({ active, onSelect }: { active: StatVariant; onSelect: (v: StatVariant) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-1 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
      {VARIANTS.map((v) => {
        const label = v.id === 10 ? '0' : String(v.id);
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            title={`${v.label} (${v.id})`}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold transition-colors ${
              active === v.id
                ? 'bg-accent text-accent-soft'
                : 'text-text-muted hover:bg-muted hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function PreviewStats() {
  const [variant, setVariant] = useState<StatVariant>(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = e.key === '0' ? 10 : Number(e.key);
      if (n >= 1 && n <= 10 && VARIANTS.some((v) => v.id === n)) {
        setVariant(n as StatVariant);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative w-full flex flex-col items-center">
      <div className="w-full max-w-2xl">{VARIANTS.find((v) => v.id === variant)?.render()}</div>
      <VariantToolbar active={variant} onSelect={setVariant} />
    </div>
  );
}
