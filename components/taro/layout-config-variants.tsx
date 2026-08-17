'use client';

/**
 * vartest5 — Warehouse Layout Config screen variants.
 *
 * Five radically different information architectures for the SAME set of
 * user-facing knobs (Warehouse Geometry / Inventory Generation / Inventory
 * Placement). A floating segmented control in the bottom-right corner
 * switches between them; keys 1–5 do the same from the keyboard.
 *
 * All five variants share the non-negotiable constraints:
 *   • Fishbone is removed entirely (no tab, no controls, no preview).
 *   • There are no layout types — just a single geometry config.
 *   • The cross-aisle slider is the ONLY survivor, defaulting to 1
 *     and able to reach 0 (plain parallel).
 *
 * Variant lineup (vartest5):
 *   6 · Cockpit          — tab strip × dial instruments (merge of 2 + 5)
 *   7 · Priority Matrix  — impact × effort 2×2 board of expandable cards
 *   8 · Timeline         — Define → Stock → Place pipeline with progress rail
 *   9 · Radial Console   — concentric rings, everything orbits one centre
 *   10· Feedback Loop    — systems diagram of 4 connected nodes
 *
 * The rendering of each variant is a pure function of the shared
 * `LayoutConfigVariantProps`, so switching costs nothing and state is never
 * duplicated across variants.
 */

import { useMemo, useState, useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import {
  Warehouse,
  Boxes,
  Package,
  Layers,
  Zap,
  TrendingUp,
  Tags,
  ChevronRight,
  Split,
  Combine,
  ArrowRight,
  Check,
  Rows3,
  Columns3,
  BadgeCheck,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Shared types ────────────────────────────────────────────────────────────

type StepRailId = 'geometry' | 'inventory' | 'placement';
export type PreviewMode = 'layout' | 'demand' | 'affinity';

export interface DemandSummaryLike {
  min: number;
  max: number;
  mean: number;
  topShare: number;
}

export interface AffinitySummaryLike {
  groupCount: number;
  singletonCount: number;
  nonSingletonCount: number;
  largestGroupSize: number;
  meanGroupSize: number;
  groupedShare: number;
}

export interface FootprintSummaryLike {
  singleBinCount: number;
  multiBinCount: number;
  meanFootprint: number;
  totalBins: number;
}

export interface PlacementSummaryLike {
  placed: number;
  total: number;
  placedBins: number;
  totalBins: number;
  unplaced: number;
  categoryCount: number;
}

export interface GeometryState {
  gridHeight: number;
  rackCount: number;
  aisleWidth: number;
  crossAisleCount: number;
}

export interface VariantSliderProps {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  step: number;
  low?: string;
  high?: string;
  hint?: string;
  stat?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export interface SliderGroupProps {
  title?: string;
  subtitle?: string;
  sliders: VariantSliderProps[];
}

export interface LayoutConfigVariantProps {
  geometry: GeometryState;
  onGeometryChange: (patch: Partial<GeometryState>) => void;
  onGeometryCommit: (patch: Partial<GeometryState>) => void;
  skuCount: number;
  onSkuCountChange: (v: number) => void;
  demandDistribution: number;
  onDemandDistributionChange: (v: number) => void;
  productAffinity: number;
  onProductAffinityChange: (v: number) => void;
  storageFootprint: number;
  onStorageFootprintChange: (v: number) => void;
  slottingBias: number;
  onSlottingBiasChange: (v: number) => void;
  categoryClustering: number;
  onCategoryClusteringChange: (v: number) => void;
  demandSummary: DemandSummaryLike;
  affinitySummary: AffinitySummaryLike;
  footprintSummary: FootprintSummaryLike;
  placementSummary: PlacementSummaryLike;
  /** Live geometry preview (width × height in cells) — used by spatial variants. */
  previewSize: { width: number; height: number };
  /** Raster of the generated layout for spatial variants. */
  layoutRaster: ('empty' | 'shelf' | 'worker')[][];
  /** Placement-shelf lookup for spatial variants ("x,y" → meta). */
  shelfMeta: Map<string, { active: boolean; demand: number; affinity?: number }>;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  maxPlacedDemand: number;
}

// ── Shared building blocks ─────────────────────────────────────────────────

export function VariantSlider({ label, value, display, min, max, step, low, high, hint, stat, onChange, onCommit }: VariantSliderProps) {
  const reactId = useId();
  const id = `vs-${reactId}-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-text-primary">
          {display ?? value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
        className="layout-variant-range"
      />
      {(low || high) && (
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
      {hint && <p className="text-[11px] text-text-muted leading-snug">{hint}</p>}
      {stat && <p className="text-[11px] font-mono text-text-muted leading-snug">{stat}</p>}
    </div>
  );
}

export function VariantSliderGroup({ title, subtitle, sliders }: SliderGroupProps) {
  return (
    <section className="space-y-5">
      {(title || subtitle) && (
        <div className="space-y-0.5">
          {title && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              {title}
            </h3>
          )}
          {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
        </div>
      )}
      {sliders.map((s) => (
        <VariantSlider key={s.label} {...s} />
      ))}
    </section>
  );
}

/** Geometry sliders shared by every variant — parallel merged, cross-aisle 0..4. */
export function buildGeometrySliders(
  g: GeometryState,
  onChange: (patch: Partial<GeometryState>) => void,
  onCommit: (patch: Partial<GeometryState>) => void
): VariantSliderProps[] {
  const heightStep = g.gridHeight <= 20 ? 1 : g.gridHeight <= 50 ? 2 : 5;
  const rackStep = g.rackCount <= 20 ? 1 : g.rackCount <= 50 ? 2 : 5;
  return [
    {
      label: 'Grid Height',
      value: g.gridHeight,
      min: 4,
      max: 60,
      step: heightStep,
      hint: 'Vertical height of the storage area.',
      onChange: (v) => onChange({ gridHeight: v }),
      onCommit: (v) => onCommit({ gridHeight: v }),
    },
    {
      label: 'Rack Count',
      value: g.rackCount,
      min: 5,
      max: 60,
      step: rackStep,
      hint: 'Number of double-row racks.',
      onChange: (v) => onChange({ rackCount: v }),
      onCommit: (v) => onCommit({ rackCount: v }),
    },
    {
      label: 'Aisle Width',
      value: g.aisleWidth,
      min: 1,
      max: 5,
      step: 1,
      hint: 'Spacing between rack columns.',
      onChange: (v) => onChange({ aisleWidth: v }),
    },
  ];
}

function GeometryBlock({ g, onChange, onCommit, accent }: {
  g: GeometryState;
  onChange: (patch: Partial<GeometryState>) => void;
  onCommit: (patch: Partial<GeometryState>) => void;
  accent?: 'inline' | 'card' | 'plain';
}) {
  const sliders = buildGeometrySliders(g, onChange, onCommit);
  const body = (
    <>
      {sliders.map((s) => (
        <VariantSlider key={s.label} {...s} />
      ))}
      <VariantSlider
        label="Cross Aisles"
        value={g.crossAisleCount}
        min={0}
        max={4}
        step={1}
        low="0 · Parallel"
        high="4 · Thoroughfares"
        hint={
          g.crossAisleCount === 0
            ? 'No cross aisles — a plain parallel layout.'
            : `${g.crossAisleCount} horizontal thoroughfare${g.crossAisleCount === 1 ? '' : 's'} cutting across the rack columns.`
        }
        onChange={(v) => onChange({ crossAisleCount: v })}
      />
    </>
  );

  if (accent === 'card') {
    return (
      <div className="rounded-xl border border-border-default bg-surface p-4 space-y-5 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Warehouse className="h-3.5 w-3.5" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Warehouse Geometry</h4>
            <p className="text-[11px] text-text-muted">Racks, aisles & thoroughfares</p>
          </div>
        </div>
        {body}
      </div>
    );
  }

  if (accent === 'inline') {
    return (
      <div className="space-y-5 border-l-2 border-accent/40 pl-4">
        <div className="flex items-center gap-1.5">
          <Warehouse className="h-3.5 w-3.5 text-accent" />
          <h4 className="text-sm font-semibold text-text-primary">Warehouse Geometry</h4>
        </div>
        {body}
      </div>
    );
  }

  return body;
}

/** Round trip to cells so the geometry maps onto the grid legend. */
function footprintBuckets(f: FootprintSummaryLike): number[] {
  // buckets 1..4 bins + "5+" from the mean — best effort without item data
  const mean = f.meanFootprint;
  const total = f.totalBins;
  if (total <= 0) return [0, 0, 0, 0, 0];
  const single = f.singleBinCount;
  const multi = f.multiBinCount;
  // Distribute multi-bin SKUs across 2..4+ buckets weighted by mean.
  const spread = Math.max(1, Math.min(4, Math.round(mean)));
  const out = [single, 0, 0, 0, 0];
  let left = multi;
  if (left > 0) {
    const per = left / Math.max(1, spread);
    for (let i = 1; i <= 4; i++) out[i] = i <= spread ? Math.round(per) : 0;
  }
  return out;
}

function MiniHistogram({ buckets, color = 'bg-accent' }: { buckets: number[]; color?: string }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex items-end gap-1 h-10">
      {buckets.map((b, i) => (
        <div
          key={i}
          className={cn('flex-1 rounded-t-sm', color)}
          style={{ height: `${Math.max(3, (b / max) * 100)}%`, opacity: b === 0 ? 0.25 : 0.85 }}
          title={`${b}`}
        />
      ))}
    </div>
  );
}

function Sparkline({ values, color = '#4C5C2D' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${32 - ((v - min) / span) * 28}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 36" className="w-full h-9" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function Gauge({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative h-14 w-14 rounded-full"
        style={{
          background: `conic-gradient(#4C5C2D ${pct * 3.6}deg, #EDEDEC 0deg)`,
        }}
      >
        <div className="absolute inset-1.5 rounded-full bg-surface flex items-center justify-center">
          <span className="text-xs font-bold text-text-primary">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}
// ── Variant 6 · COCKPIT ────────────────────────────────────────────────────
// The combined evolution of Horizon Tabs + Dial Board: a compact tab strip
// (Geometry / Inventory / Placement) on top, and inside each tab a cockpit of
// mini instruments — gauges, sparklines, bin histograms, health tiles — each
// with its slider embedded. Everything about one variable family is on a
// single page, read as dials, tweaked with sliders.

export function VariantCockpit(props: LayoutConfigVariantProps) {
  const [tab, setTab] = useState<StepRailId>('geometry');
  const tabs = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'placement' as const, label: 'Placement', icon: Boxes },
  ];

  const demandCurve = useMemo(() => {
    const alpha = (props.demandDistribution / 100) * 2;
    const n = 32;
    return Array.from({ length: n }, (_, i) => 1 / Math.pow((i + 1) / n, alpha));
  }, [props.demandDistribution]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border-default px-1 pt-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px',
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {tab === 'geometry' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border-default bg-surface p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-text-muted">
                  <Rows3 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">Height</span>
                </div>
                <div className="flex items-end gap-0.5 h-12">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-accent/60"
                      style={{ height: `${((i * 4 + Math.min(20, props.geometry.gridHeight)) % 100) / 100 * 100}%` }}
                    />
                  ))}
                </div>
                <span className="text-lg font-bold text-text-primary">{props.geometry.gridHeight}</span>
              </div>
              <div className="rounded-xl border border-border-default bg-surface p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-text-muted">
                  <Columns3 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wide">Racks</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={cn('rounded-sm h-5', i < Math.min(8, Math.ceil(props.geometry.rackCount / 8)) ? 'bg-accent' : 'bg-muted')} />
                  ))}
                </div>
                <span className="text-lg font-bold text-text-primary">{props.geometry.rackCount}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border-default bg-surface p-3">
              <VariantSlider label="Aisle Width" value={props.geometry.aisleWidth} min={1} max={5} step={1} onChange={(v) => props.onGeometryChange({ aisleWidth: v })} />
            </div>
            <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Split className="h-3.5 w-3.5 text-accent" />
                  <span className="text-xs font-bold text-text-primary">Cross Aisles</span>
                </div>
                <span className="text-lg font-bold text-text-primary">{props.geometry.crossAisleCount}</span>
              </div>
              <VariantSlider
                label=""
                value={props.geometry.crossAisleCount}
                min={0}
                max={4}
                step={1}
                low="Parallel"
                high="4"
                onChange={(v) => props.onGeometryChange({ crossAisleCount: v })}
              />
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => props.onGeometryChange({ crossAisleCount: n })}
                    className={cn(
                      'flex-1 h-8 rounded-md text-xs font-bold transition-colors',
                      props.geometry.crossAisleCount === n ? 'bg-accent text-primary-foreground' : 'bg-surface text-text-muted border border-border-default hover:border-accent/50'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'inventory' && (
          <>
            <div className="rounded-xl border border-border-default bg-surface p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-text-primary">SKU Count</p>
                  <p className="text-[10px] text-text-muted">Catalogue size</p>
                </div>
                <span className="text-xl font-bold text-text-primary">{props.skuCount.toLocaleString()}</span>
              </div>
              <VariantSlider label="" value={props.skuCount} min={500} max={10000} step={1} onChange={props.onSkuCountChange} />
            </div>

            <div className="rounded-xl border border-border-default bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-text-primary">Demand Distribution</p>
                    <p className="text-[10px] text-text-muted">Uniform → Pareto</p>
                  </div>
                </div>
                <Gauge value={props.demandSummary.topShare} label="Top 20%" />
              </div>
              <Sparkline values={demandCurve} />
              <VariantSlider label="" value={props.demandDistribution} min={0} max={100} step={1} onChange={props.onDemandDistributionChange} />
            </div>

            <div className="rounded-xl border border-border-default bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Tags className="h-3.5 w-3.5 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-text-primary">Product Affinity</p>
                    <p className="text-[10px] text-text-muted">Co-purchase structure</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-primary">{props.affinitySummary.groupCount}</p>
                    <p className="text-[9px] uppercase tracking-wide text-text-muted">groups</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-primary">{props.affinitySummary.largestGroupSize}</p>
                    <p className="text-[9px] uppercase tracking-wide text-text-muted">largest</p>
                  </div>
                </div>
              </div>
              <VariantSlider label="" value={props.productAffinity} min={0} max={100} step={1} onChange={props.onProductAffinityChange} />
            </div>

            <div className="rounded-xl border border-border-default bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-text-primary">Storage Footprint</p>
                    <p className="text-[10px] text-text-muted">Bins per product</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-text-primary">{props.footprintSummary.totalBins.toLocaleString()} bins</span>
              </div>
              <MiniHistogram buckets={footprintBuckets(props.footprintSummary)} />
              <VariantSlider label="" value={props.storageFootprint} min={0} max={100} step={1} onChange={props.onStorageFootprintChange} />
            </div>
          </>
        )}

        {tab === 'placement' && (
          <>
            <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-text-primary">Slotting Bias</p>
                    <p className="text-[10px] text-text-muted">Hot SKUs near dispatch</p>
                  </div>
                </div>
                <Gauge value={props.slottingBias / 100} label="Bias" />
              </div>
              <VariantSlider label="" value={props.slottingBias} min={0} max={100} step={1} low="Random" high="Demand" onChange={props.onSlottingBiasChange} />
            </div>

            <div className="rounded-xl border border-border-default bg-surface p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Combine className="h-3.5 w-3.5 text-accent" />
                  <div>
                    <p className="text-xs font-bold text-text-primary">Category Clustering</p>
                    <p className="text-[10px] text-text-muted">Same family → same zone</p>
                  </div>
                </div>
                <Gauge value={props.categoryClustering / 100} label="Clusters" />
              </div>
              <VariantSlider label="" value={props.categoryClustering} min={0} max={100} step={1} low="Scattered" high="Zoned" onChange={props.onCategoryClusteringChange} />
            </div>

            <div className="rounded-xl border border-border-default bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-text-primary">Placement health</p>
                <BadgeCheck className="h-4 w-4 text-positive" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-muted/60 p-2">
                  <p className="text-lg font-bold text-text-primary">{props.placementSummary.placed}/{props.placementSummary.total}</p>
                  <p className="text-[9px] uppercase tracking-wide text-text-muted">SKUs placed</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <p className="text-lg font-bold text-text-primary">{props.placementSummary.placedBins}/{props.placementSummary.totalBins}</p>
                  <p className="text-[9px] uppercase tracking-wide text-text-muted">bins used</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <p className="text-lg font-bold text-text-primary">{props.placementSummary.categoryCount}</p>
                  <p className="text-[9px] uppercase tracking-wide text-text-muted">categories</p>
                </div>
                <div className={cn('rounded-lg p-2', props.placementSummary.unplaced > 0 ? 'bg-warning-soft' : 'bg-positive-soft')}>
                  <p className={cn('text-lg font-bold', props.placementSummary.unplaced > 0 ? 'text-warning' : 'text-positive')}>
                    {props.placementSummary.unplaced > 0 ? props.placementSummary.unplaced : 'OK'}
                  </p>
                  <p className={cn('text-[9px] uppercase tracking-wide', props.placementSummary.unplaced > 0 ? 'text-warning' : 'text-positive')}>
                    {props.placementSummary.unplaced > 0 ? 'overflow' : 'no overflow'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Variant 7 · PRIORITY MATRIX ─────────────────────────────────────────────
// Everything is a 2×2 matrix (impact × effort) rendered as a single board of
// cards. Each knob is a card in its own quadrant; the card is a live "dial"
// (value + small state bar) and its slider expands beneath. The whole
// configuration becomes a visual map of where the levers sit — high-impact
// easy knobs in the top-right get an accent ring.

export function VariantPriorityMatrix(props: LayoutConfigVariantProps) {
  const [expanded, setExpanded] = useState<StepRailId | null>('geometry');

  const matrix: { id: StepRailId; label: string; icon: typeof Warehouse; sub: string; impact: number; effort: number }[] = [
    { id: 'geometry', label: 'Geometry', icon: Warehouse, sub: 'Racks, aisles, thoroughfares', impact: 0.85, effort: 0.2 },
    { id: 'inventory', label: 'Inventory', icon: Package, sub: 'Catalogue, demand, affinity, footprint', impact: 0.7, effort: 0.5 },
    { id: 'placement', label: 'Placement', icon: Boxes, sub: 'Slotting bias & category zoning', impact: 0.6, effort: 0.4 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-text-muted px-1">
        <span>Effort →</span>
        <span>Impact ↑</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {matrix.map((m) => {
          const Icon = m.icon;
          const isExpanded = expanded === m.id;
          return (
            <div
              key={m.id}
              className={cn(
                'rounded-xl border p-3 transition-colors',
                isExpanded ? 'border-accent/60 bg-accent-soft/40' : 'border-border-default bg-surface',
                m.impact > 0.8 && 'ring-1 ring-accent/30'
              )}
            >
              <button type="button" onClick={() => setExpanded(isExpanded ? null : m.id)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', isExpanded ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{m.label}</p>
                      <p className="text-[10px] text-text-muted leading-tight">{m.sub}</p>
                    </div>
                  </div>
                  <ChevronRight className={cn('h-4 w-4 text-text-muted transition-transform', isExpanded && 'rotate-90')} />
                </div>
                {/* impact × effort meter */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wide text-text-muted">Impact</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${m.impact * 100}%` }} />
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wide text-text-muted">Effort</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-warning/70" style={{ width: `${m.effort * 100}%` }} />
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border-default space-y-4">
                  {m.id === 'geometry' && (
                    <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="plain" />
                  )}
                  {m.id === 'inventory' && (
                    <>
                      <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} onChange={props.onSkuCountChange} />
                      <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}%`} onChange={props.onDemandDistributionChange} />
                      <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups`} onChange={props.onProductAffinityChange} />
                      <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
                    </>
                  )}
                  {m.id === 'placement' && (
                    <>
                      <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} placed`} onChange={props.onSlottingBiasChange} />
                      <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Placeholder quadrant card (keeps the 2×2 matrix balanced) */}
        <div className="rounded-xl border border-dashed border-border-default p-3 flex flex-col items-center justify-center text-center text-text-muted">
          <Sparkles className="h-4 w-4 mb-1" />
          <p className="text-[10px] leading-tight">Customise the three levers; each expands into its full controls.</p>
        </div>
      </div>
    </div>
  );
}

// ── Variant 8 · TIMELINE ────────────────────────────────────────────────────
// The configuration as a horizontal build pipeline: three connected stage
// "cards" (Define → Stock → Place) flowing left to right. Each stage shows a
// compact summary chip-row of its values; clicking a stage opens a drawer of
// its sliders. A progress rail across the top shows overall completeness
// (all 7 knobs have non-default values).

export function VariantTimeline(props: LayoutConfigVariantProps) {
  const [stage, setStage] = useState<StepRailId>('geometry');

  const stages = [
    { id: 'geometry' as const, label: 'Define', icon: Warehouse, desc: 'Physical rack layout' },
    { id: 'inventory' as const, label: 'Stock', icon: Package, desc: 'What exists to pick' },
    { id: 'placement' as const, label: 'Place', icon: Boxes, desc: 'Where it lives' },
  ];

  const nonDefault = [
    props.geometry.gridHeight !== 30,
    props.geometry.rackCount !== 30,
    props.geometry.aisleWidth !== 2,
    props.geometry.crossAisleCount !== 1,
    props.skuCount !== 2500,
    props.demandDistribution !== 0,
    props.productAffinity !== 0,
    props.storageFootprint !== 0,
    props.slottingBias !== 0,
    props.categoryClustering !== 0,
  ].filter(Boolean).length;
  const pct = Math.round((nonDefault / 10) * 100);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress rail */}
      <div className="px-1 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Pipeline</span>
          <span className="text-[10px] font-mono text-text-muted">{pct}% configured</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Connected stages */}
      <div className="flex items-stretch gap-1">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const active = stage === s.id;
          return (
            <div key={s.id} className="flex-1 flex items-stretch">
              <button
                type="button"
                onClick={() => setStage(s.id)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-2.5 text-center transition-colors',
                  active ? 'border-accent/60 bg-accent-soft/50' : 'border-border-default bg-surface hover:bg-muted/40'
                )}
              >
                <Icon className={cn('h-4 w-4 mx-auto mb-1', active ? 'text-accent' : 'text-text-muted')} />
                <span className={cn('block text-[11px] font-bold', active ? 'text-accent' : 'text-text-primary')}>{s.label}</span>
                <span className="block text-[9px] text-text-muted leading-tight">{s.desc}</span>
              </button>
              {i < stages.length - 1 && <ChevronRight className="h-3.5 w-3.5 self-center text-text-muted/50 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Stage drawer */}
      <div className="mt-3 rounded-xl border border-border-default bg-surface p-4 space-y-4">
        {stage === 'geometry' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.geometry.gridHeight}H</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.geometry.rackCount}R</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">aisle {props.geometry.aisleWidth}</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">×{props.geometry.crossAisleCount} cross</span>
            </div>
            <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="plain" />
          </>
        )}
        {stage === 'inventory' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.skuCount.toLocaleString()} SKUs</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.demandDistribution}% pareto</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.affinitySummary.groupCount} groups</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.footprintSummary.totalBins} bins</span>
            </div>
            <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} onChange={props.onSkuCountChange} />
            <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}%`} onChange={props.onDemandDistributionChange} />
            <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups`} onChange={props.onProductAffinityChange} />
            <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
          </>
        )}
        {stage === 'placement' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.slottingBias}% slot</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.categoryClustering}% zone</span>
              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded-full">{props.placementSummary.placed}/{props.placementSummary.total} placed</span>
            </div>
            <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} placed`} onChange={props.onSlottingBiasChange} />
            <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Variant 9 · RADIAL CONSOLE ──────────────────────────────────────────────
// A circular control surface: three concentric rings, one per variable family.
// The outer ring is a row of quick-value "arcs"; the middle ring lists the
// family's variables; the inner disc is the focused slider. Rotating between
// families is a tap on the outer ring. Different in feel — everything orbits
// the same centre.

export function VariantRadialConsole(props: LayoutConfigVariantProps) {
  const [ring, setRing] = useState<StepRailId>('geometry');

  const rings = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse, color: '#4C5C2D' },
    { id: 'inventory' as const, label: 'Inventory', icon: Package, color: '#B7791F' },
    { id: 'placement' as const, label: 'Placement', icon: Boxes, color: '#2563A8' },
  ];

  const active = rings.find((r) => r.id === ring)!;

  return (
    <div className="flex flex-col items-center">
      {/* Concentric rings */}
      <div className="relative w-56 h-56 my-2">
        {/* outer ring segments */}
        {rings.map((r, i) => {
          const angle = (i / rings.length) * 360 - 90;
          const isActive = ring === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRing(r.id)}
              className={cn(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all',
                isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'
              )}
              style={{
                width: 200,
                height: 200,
                borderColor: r.color,
                background: `conic-gradient(from ${angle}deg, ${r.color}22 0deg, transparent 0deg)`,
              }}
            />
          );
        })}
        {/* middle ring label */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border border-border-default bg-surface flex flex-col items-center justify-center shadow-sm">
          <active.icon className="h-4 w-4 text-accent mb-0.5" />
          <span className="text-xs font-bold text-text-primary">{active.label}</span>
          <span className="text-[9px] text-text-muted">{active.color === '#4C5C2D' ? 'Racks & aisles' : active.color === '#B7791F' ? 'What exists' : 'Where it lives'}</span>
        </div>
      </div>

      {/* Focused variable controls */}
      <div className="w-full rounded-xl border border-border-default bg-surface p-4 space-y-4">
        {ring === 'geometry' && (
          <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="plain" />
        )}
        {ring === 'inventory' && (
          <>
            <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} onChange={props.onSkuCountChange} />
            <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}%`} onChange={props.onDemandDistributionChange} />
            <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups`} onChange={props.onProductAffinityChange} />
            <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
          </>
        )}
        {ring === 'placement' && (
          <>
            <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} placed`} onChange={props.onSlottingBiasChange} />
            <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
          </>
        )}
      </div>

      {/* Quick-value arcs */}
      <div className="mt-3 w-full grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-border-default bg-surface px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-text-primary">{props.geometry.gridHeight}×{props.geometry.rackCount}</p>
          <p className="text-[9px] uppercase tracking-wide text-text-muted">grid</p>
        </div>
        <div className="rounded-lg border border-border-default bg-surface px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-text-primary">{props.skuCount.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wide text-text-muted">SKUs</p>
        </div>
        <div className="rounded-lg border border-border-default bg-surface px-2 py-1.5 text-center">
          <p className="text-sm font-bold text-text-primary">{props.slottingBias}% / {props.categoryClustering}%</p>
          <p className="text-[9px] uppercase tracking-wide text-text-muted">slot/zone</p>
        </div>
      </div>
    </div>
  );
}

// ── Variant 10 · FEEDBACK LOOP ─────────────────────────────────────────────
// A systems diagram: four cards arranged in a cycle (Generate → Demand →
// Affinity → Place → back to Generate), each with a small "feedback" arrow
// ring. Clicking a card opens its controls in the middle pane. The layout
// reads like a control-flow diagram rather than a form.

export function VariantFeedbackLoop(props: LayoutConfigVariantProps) {
  const [active, setActive] = useState<StepRailId>('geometry');

  const nodes: { id: StepRailId; label: string; icon: typeof Warehouse; desc: string }[] = [
    { id: 'geometry', label: 'Generate', icon: Warehouse, desc: 'Define the physical rack layout.' },
    { id: 'inventory', label: 'Demand', icon: TrendingUp, desc: 'Shape the catalogue & its demand.' },
    { id: 'inventory', label: 'Affinity', icon: Tags, desc: 'Decide which products relate.' },
    { id: 'placement', label: 'Place', icon: Boxes, desc: 'Slot inventory into zones.' },
  ];

  const isNodeActive = (label: string) =>
    (label === 'Demand' || label === 'Affinity') ? active === 'inventory' : active === label.toLowerCase();

  return (
    <div className="space-y-3">
      {/* Cycle diagram */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          {nodes.map((n, i) => {
            const Icon = n.icon;
            const on = isNodeActive(n.label);
            return (
              <button
                key={`${n.label}-${i}`}
                type="button"
                onClick={() => setActive(n.id)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors relative',
                  on ? 'border-accent/60 bg-accent-soft/40 ring-1 ring-accent/20' : 'border-border-default bg-surface hover:bg-muted/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', on ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-bold text-text-primary">{n.label}</span>
                </div>
                <p className="text-[10px] text-text-muted leading-tight mt-1">{n.desc}</p>
                {/* feedback arrow on the far corners */}
                {i % 2 === 0 ? (
                  <ArrowRight className="absolute -right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent/50" />
                ) : (
                  <ArrowRight className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-accent/50 rotate-180" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active node controls */}
      <div className="rounded-xl border border-border-default bg-surface p-4 space-y-4">
        {active === 'geometry' && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Generate — physical layout</p>
            <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="plain" />
          </>
        )}
        {active === 'inventory' && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Demand & affinity — catalogue behaviour</p>
            <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} onChange={props.onSkuCountChange} />
            <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}%`} onChange={props.onDemandDistributionChange} />
            <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups`} onChange={props.onProductAffinityChange} />
            <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
          </>
        )}
        {active === 'placement' && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Place — slot inventory into zones</p>
            <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} placed`} onChange={props.onSlottingBiasChange} />
            <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
          </>
        )}
      </div>
    </div>
  );
}

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
    const verdict =
      absR < 0.2
        ? 'Demand is spread independently of distance.'
        : r < 0
          ? 'Hot SKUs cluster near dispatch — slotting is working.'
          : 'Hot SKUs sit far from dispatch — weak slotting.';
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

// ── Variant registry ────────────────────────────────────────────────────────

export const LAYOUT_VARIANTS = [
  { id: 6, name: 'Cockpit', short: 'Cockpit', Component: VariantCockpit },
  { id: 7, name: 'Priority Matrix', short: 'Matrix', Component: VariantPriorityMatrix },
  { id: 8, name: 'Timeline', short: 'Timeline', Component: VariantTimeline },
  { id: 9, name: 'Radial Console', short: 'Radial', Component: VariantRadialConsole },
  { id: 10, name: 'Feedback Loop', short: 'Loop', Component: VariantFeedbackLoop },
] as const;

export type LayoutVariantId = (typeof LAYOUT_VARIANTS)[number]['id'];

// ── Floating segmented toolbar (bottom-right) ──────────────────────────────

export function VariantToolbar({
  activeVariant,
  onSelect,
}: {
  activeVariant: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-1 rounded-xl border border-border-default bg-surface/95 backdrop-blur p-1 shadow-lg">
      <span className="px-2 text-[10px] font-bold uppercase tracking-wide text-text-muted select-none">
        Variants
      </span>
      {LAYOUT_VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          title={`${v.name} (key ${v.id})`}
          onClick={() => onSelect(v.id)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            activeVariant === v.id
              ? 'bg-accent text-primary-foreground'
              : 'text-text-secondary hover:bg-muted'
          )}
        >
          <span
            className={cn(
              'text-[10px] font-mono',
              activeVariant === v.id ? 'text-primary-foreground/70' : 'text-text-muted'
            )}
          >
            {v.id}
          </span>
          {v.short}
        </button>
      ))}
    </div>
  );
}

// ── Helpers re-exported for the host overlay ────────────────────────────────

export function useVariantKeyboard(
  active: number,
  setActive: (n: number) => void
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= LAYOUT_VARIANTS.length) setActive(n);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActive]);
}
