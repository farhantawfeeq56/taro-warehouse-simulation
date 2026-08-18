'use client';

/**
 * Preview stats — vartest5.
 *
 * The four warehouse summary cards under the layout-config preview come in
 * five design variants (1–5). A floating segmented toolbar sits at the
 * bottom-right of the preview, and keys 1–5 switch between them live.
 *
 *  1. Classic     — quiet 2×2 bordered cards with bullet rows (current).
 *  2. Metric      — big numeric hero per card + dense secondary rows.
 *  3. Bars        — horizontal utilization bars for fractions/percentages.
 *  4. Tiles       — bold accent-filled tiles with white text.
 *  5. Minimal     — hairline dividers, no borders, metric-last layout.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type PreviewMode = 'layout' | 'demand' | 'affinity';
export type StatVariant = 1 | 2 | 3 | 4 | 5;

export interface PreviewStatRow {
  label: string;
  value?: string;
}

/* ------------------------------------------------------------------------ */
/* Shared stat data                                                          */
/* ------------------------------------------------------------------------ */

const STAT_TITLES: [string, string, string, string] = [
  'Storage Footprint',
  'Slotting Bias',
  'Category Clustering',
  'Footprint',
];

const STAT_ROWS: PreviewStatRow[][] = [
  [
    { label: '420', value: 'single-bin' },
    { label: '580', value: 'multi-bin' },
    { label: 'mean', value: '2.4' },
    { label: 'needs', value: '3,200 bins' },
  ],
  [
    { label: '2,450 / 2,500', value: 'SKUs placed' },
    { label: '7,480 / 7,500', value: 'bins used' },
  ],
  [
    { label: '32', value: 'categories' },
    { label: 'clustering', value: '40%' },
  ],
  [
    { label: '2,500', value: 'shelves' },
    { label: '62%', value: 'of 4,000 cells' },
    { label: '7,500', value: 'bins' },
  ],
];

/* ------------------------------------------------------------------------ */
/* Variant 1 — Classic                                                       */
/* ------------------------------------------------------------------------ */

function VariantClassic() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
      {STAT_TITLES.map((title, i) => (
        <div key={title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1.5">{title}</p>
          <ul className="space-y-0.5">
            {STAT_ROWS[i].map((r) => (
              <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="text-text-muted">•</span>
                <span className="font-semibold text-text-primary">{r.label}</span>
                {r.value && <span className="text-text-muted">{r.value}</span>}
              </li>
            ))}
          </ul>
          {i === 2 && <p className="text-[10px] text-text-muted mt-1">Each color represents a category.</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Variant 2 — Metric                                                        */
/* ------------------------------------------------------------------------ */

function VariantMetric() {
  const hero = (rows: PreviewStatRow[]) => {
    const first = rows[0];
    return first ? { value: first.label, rest: rows.slice(1) } : { value: '—', rest: [] };
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
      {STAT_TITLES.map((title, i) => {
        const { value, rest } = hero(STAT_ROWS[i]);
        return (
          <div key={title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{title}</p>
            <p className="text-2xl font-bold text-text-primary leading-tight my-0.5">{value}</p>
            <ul className="space-y-0.5">
              {rest.map((r) => (
                <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
                  <span className="text-text-muted">•</span>
                  <span className="font-semibold text-text-primary">{r.label}</span>
                  {r.value && <span className="text-text-muted">{r.value}</span>}
                </li>
              ))}
            </ul>
            {i === 2 && <p className="text-[10px] text-text-muted mt-1">Each color represents a category.</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Variant 3 — Bars                                                          */
/* ------------------------------------------------------------------------ */

function VariantBars() {
  // Fractions / percentages become utilization bars; plain rows stay bullets.
  const barFor = (rows: PreviewStatRow[]): { value: string; label: string } | null => {
    const split = rows.find((r) => r.label.includes('/'));
    if (split) {
      const [a, b] = split.label.split('/').map((s) => parseInt(s.replace(/[^\d]/g, ''), 10));
      if (a != null && b != null && b > 0) {
        return { value: split.label, label: split.value ?? '' };
      }
    }
    return null;
  };
  const renderRow = (r: PreviewStatRow, pct?: number) => (
    <div key={r.label} className="flex items-center gap-2 text-[11px]">
      <span className="font-semibold text-text-primary shrink-0">{r.label}</span>
      {r.value && <span className="text-text-muted">{r.value}</span>}
      {pct != null && (
        <span className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden min-w-[32px]">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
      {STAT_TITLES.map((title, i) => {
        const bar = barFor(STAT_ROWS[i]);
        return (
          <div key={title} className="rounded-lg border border-border-default bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1.5">{title}</p>
            <ul className="space-y-1">
              {STAT_ROWS[i].map((r) => {
                if (bar && r.label === bar.value) {
                  const [a, b] = bar.value.split('/').map((s) => parseInt(s.replace(/[^\d]/g, ''), 10));
                  return renderRow({ label: `${a}`, value: `of ${b} ${bar.label.toLowerCase()}` }, (a / b) * 100);
                }
                return renderRow(r);
              })}
            </ul>
            {i === 2 && <p className="text-[10px] text-text-muted mt-1">Each color represents a category.</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Variant 4 — Tiles                                                         */
/* ------------------------------------------------------------------------ */

function VariantTiles() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
      {STAT_TITLES.map((title, i) => (
        <div key={title} className="rounded-lg bg-accent px-3 py-2 text-accent-soft">
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-soft/70 mb-1.5">{title}</p>
          <ul className="space-y-0.5">
            {STAT_ROWS[i].map((r) => (
              <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="text-accent-soft/70">•</span>
                <span className="font-semibold text-accent-soft">{r.label}</span>
                {r.value && <span className="text-accent-soft/70">{r.value}</span>}
              </li>
            ))}
          </ul>
          {i === 2 && <p className="text-[10px] text-accent-soft/70 mt-1">Each color represents a category.</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Variant 5 — Minimal                                                       */
/* ------------------------------------------------------------------------ */

function VariantMinimal() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 w-full max-w-2xl">
      {STAT_TITLES.map((title, i) => (
        <div key={title} className="border-b border-border-default pb-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1">{title}</p>
          <ul className="space-y-0.5">
            {STAT_ROWS[i].map((r) => (
              <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="font-semibold text-text-primary">{r.label}</span>
                {r.value && <span className="text-text-muted">{r.value}</span>}
              </li>
            ))}
          </ul>
          {i === 2 && <p className="text-[10px] text-text-muted mt-1">Each color represents a category.</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Variant registry + switcher                                               */
/* ------------------------------------------------------------------------ */

const VARIANTS: { id: StatVariant; label: string; render: () => ReactNode }[] = [
  { id: 1, label: 'Classic', render: () => <VariantClassic /> },
  { id: 2, label: 'Metric', render: () => <VariantMetric /> },
  { id: 3, label: 'Bars', render: () => <VariantBars /> },
  { id: 4, label: 'Tiles', render: () => <VariantTiles /> },
  { id: 5, label: 'Minimal', render: () => <VariantMinimal /> },
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
      <div className="w-full max-w-2xl">
        {VARIANTS.find((v) => v.id === variant)?.render()}
      </div>
      <VariantToolbar active={variant} onSelect={setVariant} />
    </div>
  );
}
