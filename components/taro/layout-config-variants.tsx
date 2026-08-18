'use client';

/**
 * Preview stats — vartest5 (Stepper family).
 *
 * The four warehouse summary cards under the layout-config preview come in
 * five STEPPER UX variants (1–5). Each is a different information
 * architecture around the "four connected steps" concept:
 *
 *   1. Flow     — horizontal: numbered badges joined by a rail, card below each.
 *   2. Timeline — vertical: numbered dots on a left rail, cards to the right.
 *   3. Trail    — horizontal: step badge + inline prime value + thin progress bar.
 *   4. Zigzag   — 2×2 snake: steps numbered 1→4 with connector arrows.
 *   5. Spotlight— step chips on a rail; the selected step's details show below.
 *
 * A floating segmented toolbar sits at the bottom-right of the preview.
 * Keys 1–5 switch variants live (ignored while typing in inputs).
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  LayoutGrid,
  Target,
  type LucideIcon,
} from 'lucide-react';

export type PreviewMode = 'layout' | 'demand' | 'affinity';
export type StatVariant = 1 | 2 | 3 | 4 | 5;

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
  /** Optional fraction for a subtle progress bar (only where data is fractional). */
  fraction?: { num: number; den: number };
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
  },
  {
    title: 'Slotting Bias',
    icon: Target,
    rows: [
      { label: '2,450 / 2,500', value: 'SKUs placed' },
      { label: '7,480 / 7,500', value: 'bins used' },
    ],
    fraction: { num: 2450, den: 2500 },
  },
  {
    title: 'Category Clustering',
    icon: Layers,
    rows: [
      { label: '32', value: 'categories' },
      { label: 'clustering', value: '40%' },
    ],
    fraction: { num: 40, den: 100 },
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
    fraction: { num: 62, den: 100 },
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

function StepBadge({ n, active = false }: { n: number; active?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        active ? 'bg-accent text-accent-soft' : 'bg-accent-soft text-accent'
      }`}
    >
      {n}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* 1 — Flow: horizontal rail of numbered badges, card below each             */
/* ------------------------------------------------------------------------ */

function VariantFlow() {
  return (
    <div className="w-full">
      <div className="flex items-center mb-2 px-1">
        {STATS.map((s, i) => (
          <div key={s.title} className="flex items-center flex-1 min-w-0">
            <StepBadge n={i + 1} />
            {i < STATS.length - 1 && <span className="flex-1 h-px bg-border-default mx-2" />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
        {STATS.map((s, i) => (
          <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
            <ul className="mt-1 space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
            <NOTE text={s.note} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 2 — Timeline: vertical left rail, cards to the right                      */
/* ------------------------------------------------------------------------ */

function VariantTimeline() {
  return (
    <div className="w-full space-y-1">
      {STATS.map((s, i) => (
        <div key={s.title} className="flex items-stretch gap-3">
          <div className="flex flex-col items-center">
            <StepBadge n={i + 1} />
            {i < STATS.length - 1 && <span className="w-px flex-1 bg-border-default my-1" />}
          </div>
          <div className="flex-1 rounded-lg border border-border-default bg-surface px-3 py-2 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
            <ul className="mt-1 space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
            <NOTE text={s.note} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 3 — Trail: horizontal steps with inline prime + subtle progress bar       */
/* ------------------------------------------------------------------------ */

function VariantTrail() {
  return (
    <div className="w-full">
      <div className="flex items-center mb-2 px-1">
        {STATS.map((s, i) => (
          <div key={s.title} className="flex items-center flex-1 min-w-0">
            <StepBadge n={i + 1} />
            {i < STATS.length - 1 && <span className="flex-1 h-px bg-border-default mx-2" />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
        {STATS.map((s) => {
          const pct = s.fraction ? Math.round((s.fraction.num / s.fraction.den) * 100) : null;
          return (
            <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
              <p className="text-lg font-bold text-text-primary leading-tight mt-0.5">{s.rows[0].label}</p>
              {pct != null && (
                <span className="mt-1.5 block h-1 rounded-full bg-muted overflow-hidden">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
              )}
              <ul className="mt-1.5 space-y-0.5">{s.rows.slice(1).map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
              <NOTE text={s.note} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 4 — Zigzag: 2×2 snake with connector arrows                               */
/* ------------------------------------------------------------------------ */

function VariantZigzag() {
  const [t1, t2, t3, t4] = STATS;
  const cells: { s: Stat; n: number; arrow?: 'right' | 'down' | 'left' }[] = [
    { s: t1, n: 1, arrow: 'right' },
    { s: t2, n: 2, arrow: 'down' },
    { s: t3, n: 3, arrow: 'right' },
    { s: t4, n: 4 },
  ];
  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
      {cells.map(({ s, n, arrow }) => (
        <div key={s.title} className="rounded-lg border border-border-default bg-surface px-3 py-2 flex flex-col">
          <div className="flex items-center gap-2">
            <StepBadge n={n} active />
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
            {arrow === 'right' && <ArrowRight className="ml-auto h-3.5 w-3.5 text-text-muted" />}
            {arrow === 'down' && <ChevronDown className="ml-auto h-3.5 w-3.5 text-text-muted" />}
          </div>
          <ul className="mt-1.5 space-y-0.5 flex-1">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
          <NOTE text={s.note} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 5 — Spotlight: step chips on a rail, selected step's details below        */
/* ------------------------------------------------------------------------ */

function VariantSpotlight() {
  const [step, setStep] = useState(0);
  const s = STATS[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((v) => (v - 1 + STATS.length) % STATS.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep((v) => (v + 1) % STATS.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="w-full rounded-lg border border-border-default bg-surface p-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {STATS.map((st, i) => (
          <button
            key={st.title}
            type="button"
            onClick={() => setStep(i)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              step === i ? 'bg-accent text-accent-soft' : 'text-text-muted hover:bg-muted hover:text-text-primary'
            }`}
          >
            <span className="text-[10px]">{i + 1}</span>
            <span className="hidden sm:inline">{st.title}</span>
          </button>
        ))}
      </div>
      <div className="flex items-start gap-3 border-t border-border-default/70 pt-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <s.icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
          <ul className="mt-1 space-y-0.5">{s.rows.map((r) => <ROW_ITEM key={r.label} r={r} />)}</ul>
          <NOTE text={s.note} />
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setStep((step - 1 + STATS.length) % STATS.length)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border-default text-text-muted hover:text-text-primary"
            aria-label="Previous step"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setStep((step + 1) % STATS.length)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border-default text-text-muted hover:text-text-primary"
            aria-label="Next step"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Registry + toolbar                                                        */
/* ------------------------------------------------------------------------ */

const VARIANTS: { id: StatVariant; label: string; render: () => ReactNode }[] = [
  { id: 1, label: 'Flow', render: () => <VariantFlow /> },
  { id: 2, label: 'Timeline', render: () => <VariantTimeline /> },
  { id: 3, label: 'Trail', render: () => <VariantTrail /> },
  { id: 4, label: 'Zigzag', render: () => <VariantZigzag /> },
  { id: 5, label: 'Spotlight', render: () => <VariantSpotlight /> },
];

/** Floating segmented toolbar — bottom-right, keyboard-driven (1–5). */
function VariantToolbar({ active, onSelect }: { active: StatVariant; onSelect: (v: StatVariant) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-1 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
      {VARIANTS.map((v) => (
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
          {v.id}
        </button>
      ))}
    </div>
  );
}

export function PreviewStats() {
  const [variant, setVariant] = useState<StatVariant>(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5 && VARIANTS.some((v) => v.id === n)) {
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
