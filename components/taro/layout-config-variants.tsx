'use client';

/**
 * Preview insights — live readouts shown under the warehouse grid in the
 * Layout Config screen. Small text chips that "figure something out" from
 * the current placement: layout footprint, demand-to-dispatch correlation,
 * affinity group concentration.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PreviewMode = 'layout' | 'demand' | 'affinity';

export interface LayoutInsights {
  shelfCells: number;
  totalCells: number;
  binCapacity: number;
  crossAisles: number;
  segments: number;
}

export interface DemandInsights {
  topShare: number;
  /** Pearson correlation between shelf proximity (0=close) and demand. */
  demandProximityCorrelation: number;
  slottingBias: number;
}

export interface AffinityInsights {
  placedGroupCount: number;
  largestGroupShare: number;
  categoryCount: number;
  clustering: number;
}

function InsightChip({ label, value, sub, tone }: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-default bg-surface px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted min-w-[64px] pt-0.5">
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-bold leading-tight', tone === 'good' ? 'text-positive' : tone === 'warn' ? 'text-warning' : 'text-text-primary')}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-text-muted leading-snug mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function PreviewInsights({
  mode,
  layout,
  demand,
  affinity,
}: {
  mode: PreviewMode;
  layout: LayoutInsights;
  demand: DemandInsights;
  affinity: AffinityInsights;
}) {
  if (mode === 'layout') {
    const pct = layout.totalCells > 0 ? Math.round((layout.shelfCells / layout.totalCells) * 100) : 0;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-2xl">
        <InsightChip label="Footprint" value={`${layout.shelfCells} shelves`} sub={`${pct}% of ${layout.totalCells} cells · ${layout.binCapacity.toLocaleString()} bins`} />
        <InsightChip label="Cross aisles" value={layout.crossAisles} sub={`Rack columns split into ${layout.segments} segment${layout.segments === 1 ? '' : 's'}`} tone={layout.crossAisles > 0 ? 'good' : undefined} />
        <InsightChip label="Pick density" value={layout.binCapacity > 0 ? `${(layout.shelfCells / layout.binCapacity).toFixed(2)}` : '—'} sub="bins per shelf cell" />
      </div>
    );
  }

  if (mode === 'demand') {
    const r = demand.demandProximityCorrelation;
    const absR = Math.abs(r);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-2xl">
        <InsightChip label="Concentration" value={`Top 20% → ${Math.round(demand.topShare * 100)}%`} sub="share of total demand" tone={demand.topShare > 0.6 ? 'good' : undefined} />
        <InsightChip
          label="Slotting"
          value={absR < 0.2 ? 'Uncorrelated' : r < 0 ? 'Near dispatch ✓' : 'Far ✗'}
          sub={`distance↔demand r=${r.toFixed(2)}`}
          tone={r < -0.2 ? 'good' : r > 0.2 ? 'warn' : undefined}
        />
        <InsightChip label="Bias setting" value={`${demand.slottingBias}%`} sub="slider drives the effect above" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-2xl">
      <InsightChip label="Groups" value={affinity.placedGroupCount} sub="distinct affinity groups on the floor" />
      <InsightChip
        label="Largest group"
        value={`${Math.round(affinity.largestGroupShare * 100)}%`}
        sub="of placed shelves share one group"
        tone={affinity.largestGroupShare > 0.3 ? 'good' : undefined}
      />
      <InsightChip label="Categories" value={affinity.categoryCount} sub={`clustering ${affinity.clustering}%`} />
    </div>
  );
}
