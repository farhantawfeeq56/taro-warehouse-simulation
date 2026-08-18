'use client';

/**
 * Preview stats — the summary cards shown under the warehouse grid in the
 * Layout Config screen. Exactly four cards in a 2×2 grid:
 *   • Storage Footprint
 *   • Slotting Bias
 *   • Category Clustering
 *   • Footprint
 */

import type { ReactNode } from 'react';

export type PreviewMode = 'layout' | 'demand' | 'affinity';

export interface PreviewStatRow {
  label: string;
  value?: string;
}

function StatCard({
  title,
  rows,
  note,
}: {
  title: string;
  rows: PreviewStatRow[];
  note?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1.5">
        {title}
      </p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-1.5 text-[11px]">
            <span className="text-text-muted">•</span>
            <span className="font-semibold text-text-primary">{r.label}</span>
            {r.value && <span className="text-text-muted">{r.value}</span>}
          </li>
        ))}
      </ul>
      {note && <p className="text-[10px] text-text-muted mt-1">{note}</p>}
    </div>
  );
}

export function PreviewStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
      <StatCard
        title="Storage Footprint"
        rows={[
          { label: '420', value: 'single-bin' },
          { label: '580', value: 'multi-bin' },
          { label: 'mean', value: '2.4' },
          { label: 'needs', value: '3,200 bins' },
        ]}
      />
      <StatCard
        title="Slotting Bias"
        rows={[
          { label: '2,450 / 2,500', value: 'SKUs placed' },
          { label: '7,480 / 7,500', value: 'bins used' },
        ]}
      />
      <StatCard
        title="Category Clustering"
        rows={[
          { label: '32', value: 'categories' },
          { label: 'clustering', value: '40%' },
        ]}
        note="Each color represents a category."
      />
      <StatCard
        title="Footprint"
        rows={[
          { label: '2,500', value: 'shelves' },
          { label: '62%', value: 'of 4,000 cells' },
          { label: '7,500', value: 'bins' },
        ]}
      />
    </div>
  );
}
