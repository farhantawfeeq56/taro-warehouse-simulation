'use client';

/**
 * Preview stats — the four warehouse summary cards under the layout-config
 * preview. Rendered as a horizontal Stepper ("Flow") design: four numbered
 * badges joined by a rail, with a card of stat rows below each one.
 */

import type { ReactNode } from 'react';
import { Boxes, Layers, LayoutGrid, Target, type LucideIcon } from 'lucide-react';

export interface PreviewStatRow {
  label: string;
  value?: string;
}

/* ------------------------------------------------------------------------ */
/* Stat data                                                                 */
/* ------------------------------------------------------------------------ */

interface Stat {
  title: string;
  icon: LucideIcon;
  rows: PreviewStatRow[];
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
  },
  {
    title: 'Category Clustering',
    icon: Layers,
    rows: [
      { label: '32', value: 'categories' },
      { label: 'clustering', value: '40%' },
    ],
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
  },
];

/* ------------------------------------------------------------------------ */
/* Flow stepper                                                              */
/* ------------------------------------------------------------------------ */

function StatCard({ s }: { s: Stat }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{s.title}</p>
      <ul className="mt-1 space-y-0.5">
        {s.rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
            <span className="font-semibold text-text-primary">{r.label}</span>
            {r.value && <span className="text-text-muted">{r.value}</span>}
          </li>
        ))}
      </ul>
      {s.note && <p className="text-[10px] text-text-muted mt-1">{s.note}</p>}
    </div>
  );
}

export function PreviewStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full max-w-2xl">
      {STATS.map((s) => (
        <StatCard key={s.title} s={s} />
      ))}
    </div>
  );
}
