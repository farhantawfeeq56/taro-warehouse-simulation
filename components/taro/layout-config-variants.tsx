'use client';

/**
 * vartest5 — Warehouse Layout Config screen.
 *
 * The accepted controls component (Cockpit — tabs × dial instruments) split
 * into three reusable bodies, presented in FIVE different card-based layouts.
 * The floating segmented control in the bottom-right + keys 1–5 switch
 * between them:
 *
 *   6 · Floating Cards — three independently expandable cards across the top,
 *                        warehouse preview below (always fits the screen)
 *   7 · Filmstrip      — cards in a horizontal strip, only one open at a time
 *   8 · Centered Compass — compact pods around the top-center, popover expand
 *   9 · Split Deck     — cards stack vertically on the left, preview on right
 *   10· Corner Console — single floating console card top-right, full-stage
 *                        preview behind it
 *
 * The warehouse preview ALWAYS fits: cell size is computed from the actual
 * available area with no pixel floor.
 *
 * Shared constraints:
 *   • Fishbone is removed entirely (no tab, no controls, no preview).
 *   • There are no layout types — just a single geometry config.
 *   • The cross-aisle slider is the ONLY survivor, defaulting to 1
 *     and able to reach 0 (plain parallel).
 *
 * The rendering of each layout is a pure function of the shared
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
  ChevronLeft,
  Rows3,
  Columns3,
  BadgeCheck,
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
  /** Render prop: the live preview pane (grid + insights + legend). */
  renderPreview: () => ReactNode;
  /** Render prop: the Apply/Generate footer button. */
  renderFooter: () => ReactNode;
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
// ── Cockpit bodies (reusable card contents) ────────────────────────────────
// The accepted Cockpit controls, split into the three variable-family bodies
// so the new variants can present them as cards / pods / decks / a console.

function CockpitGeometryBody(props: LayoutConfigVariantProps) {
  return (
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
  );
}

function CockpitInventoryBody(props: LayoutConfigVariantProps) {
  const demandCurve = useMemo(() => {
    const alpha = (props.demandDistribution / 100) * 2;
    const n = 32;
    return Array.from({ length: n }, (_, i) => 1 / Math.pow((i + 1) / n, alpha));
  }, [props.demandDistribution]);

  return (
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
  );
}

function CockpitPlacementBody(props: LayoutConfigVariantProps) {
  return (
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
  );
}

/** The single controls component — Cockpit (tabs × dial instruments). */
export function VariantCockpit(props: LayoutConfigVariantProps) {
  const [tab, setTab] = useState<StepRailId>('geometry');
  const tabs = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'placement' as const, label: 'Placement', icon: Boxes },
  ];
  return (
    <div className="flex flex-col h-full min-h-0">
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
        {tab === 'geometry' && <CockpitGeometryBody {...props} />}
        {tab === 'inventory' && <CockpitInventoryBody {...props} />}
        {tab === 'placement' && <CockpitPlacementBody {...props} />}
      </div>
    </div>
  );
}

// ── Variant 6 · FLOATING CARDS ─────────────────────────────────────────────
// Three floating cards (Geometry / Inventory / Placement) across the top,
// independently expandable (multiple can be open at once). The warehouse
// preview fills the space below and ALWAYS fits the screen — cell size is
// computed from the remaining area with no floor.

function CardShell({
  title,
  icon: Icon,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: typeof Warehouse;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface shadow-md transition-all flex flex-col',
        open ? 'border-accent/60 shadow-lg' : 'border-border-default hover:border-accent/40'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', open ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn('block text-sm font-bold', open ? 'text-text-primary' : 'text-text-secondary')}>{title}</span>
          <span className="block text-[10px] text-text-muted truncate">{subtitle}</span>
        </span>
        <ChevronRight className={cn('h-4 w-4 text-text-muted transition-transform shrink-0', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-default pt-3 overflow-y-auto max-h-72">
          {children}
        </div>
      )}
    </div>
  );
}

export function LayoutFloatingCards(props: LayoutConfigVariantProps) {
  const [open, setOpen] = useState<Set<StepRailId>>(new Set(['geometry']));

  const toggle = (id: StepRailId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Floating cards across the top */}
      <div className="shrink-0 p-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        <CardShell title="Geometry" icon={Warehouse} subtitle="Racks, aisles & thoroughfares" open={open.has('geometry')} onToggle={() => toggle('geometry')}>
          <CockpitGeometryBody {...props} />
        </CardShell>
        <CardShell title="Inventory" icon={Package} subtitle="Catalogue, demand & affinity" open={open.has('inventory')} onToggle={() => toggle('inventory')}>
          <CockpitInventoryBody {...props} />
        </CardShell>
        <CardShell title="Placement" icon={Boxes} subtitle="Slotting & zoning" open={open.has('placement')} onToggle={() => toggle('placement')}>
          <CockpitPlacementBody {...props} />
        </CardShell>
      </div>

      {/* Warehouse — always fits the remaining screen */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20 rounded-2xl mx-4 mb-4">
        <div className="h-full w-full overflow-auto">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-4 gap-3">
            {props.renderPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant 7 · FILMSTRIP ──────────────────────────────────────────────────
// The three cards sit in a horizontal strip across the top, but only ONE is
// open at a time (accordion-in-a-row) — the open card widens to show its
// controls, the other two stay narrow. Preview below always fits.

export function LayoutFilmstrip(props: LayoutConfigVariantProps) {
  const [active, setActive] = useState<StepRailId | null>('geometry');

  const cards = [
    { id: 'geometry' as const, title: 'Geometry', icon: Warehouse, body: <CockpitGeometryBody {...props} /> },
    { id: 'inventory' as const, title: 'Inventory', icon: Package, body: <CockpitInventoryBody {...props} /> },
    { id: 'placement' as const, title: 'Placement', icon: Boxes, body: <CockpitPlacementBody {...props} /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0 p-4 pb-2 flex gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const isOpen = active === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                'rounded-2xl border bg-surface shadow-md transition-all flex flex-col',
                isOpen ? 'border-accent/60 flex-[3] shadow-lg' : 'flex-1 border-border-default hover:border-accent/40'
              )}
            >
              <button
                type="button"
                onClick={() => setActive(isOpen ? null : c.id)}
                className="flex items-center gap-2 px-3 py-3 text-left"
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isOpen ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-xs font-bold truncate', isOpen ? 'text-text-primary' : 'text-text-secondary')}>{c.title}</span>
                  {isOpen && <span className="block text-[9px] text-text-muted truncate">Controls</span>}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-border-default pt-2 overflow-y-auto min-h-0">
                  {c.body}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20 rounded-2xl mx-4 mb-4">
        <div className="h-full w-full overflow-auto">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-4 gap-3">
            {props.renderPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant 8 · CENTERED COMPASS ───────────────────────────────────────────
// Three compact "pods" clustered around the top-center, preview fills the
// rest. Each pod shows just the summary value; clicking expands it into a
// popover-style panel that overlays the preview's top edge (no layout shift).

export function LayoutCompass(props: LayoutConfigVariantProps) {
  const [active, setActive] = useState<StepRailId | null>('geometry');

  const pods = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse, value: `${props.geometry.gridHeight}×${props.geometry.rackCount}`, body: <CockpitGeometryBody {...props} /> },
    { id: 'inventory' as const, label: 'Inventory', icon: Package, value: `${props.skuCount.toLocaleString()} SKUs`, body: <CockpitInventoryBody {...props} /> },
    { id: 'placement' as const, label: 'Placement', icon: Boxes, value: `${props.slottingBias}% · ${props.categoryClustering}%`, body: <CockpitPlacementBody {...props} /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="shrink-0 px-4 pt-4 pb-2 flex justify-center gap-3">
        {pods.map((p) => {
          const Icon = p.icon;
          const isOpen = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(isOpen ? null : p.id)}
              className={cn(
                'rounded-xl border px-3 py-2 flex items-center gap-2 transition-all',
                isOpen ? 'border-accent/60 bg-accent-soft/50 shadow-md' : 'border-border-default bg-surface hover:border-accent/40'
              )}
            >
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', isOpen ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-left">
                <span className={cn('block text-[11px] font-bold', isOpen ? 'text-accent' : 'text-text-primary')}>{p.label}</span>
                <span className="block text-[9px] font-mono text-text-muted">{p.value}</span>
              </span>
              <ChevronRight className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isOpen && 'rotate-90')} />
            </button>
          );
        })}
      </div>

      {/* Expanded pod panel overlays the top of the preview area */}
      {active && (
        <div className="shrink-0 mx-4 mb-2 rounded-2xl border border-accent/50 bg-surface shadow-xl p-4 max-h-56 overflow-y-auto">
          {pods.find((p) => p.id === active)?.body}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20 rounded-2xl mx-4 mb-4">
        <div className="h-full w-full overflow-auto">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-4 gap-3">
            {props.renderPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant 9 · SPLIT DECK ─────────────────────────────────────────────────
// The three cards stack vertically on the LEFT as a scrollable deck; the
// preview fills the right column edge-to-edge vertically. Cards are
// independently expandable.

export function LayoutSplitDeck(props: LayoutConfigVariantProps) {
  const [open, setOpen] = useState<Set<StepRailId>>(new Set(['geometry']));

  const toggle = (id: StepRailId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deck = [
    { id: 'geometry' as const, title: 'Geometry', icon: Warehouse, subtitle: 'Racks, aisles & thoroughfares', body: <CockpitGeometryBody {...props} /> },
    { id: 'inventory' as const, title: 'Inventory', icon: Package, subtitle: 'Catalogue, demand & affinity', body: <CockpitInventoryBody {...props} /> },
    { id: 'placement' as const, title: 'Placement', icon: Boxes, subtitle: 'Slotting & zoning', body: <CockpitPlacementBody {...props} /> },
  ];

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      <div className="w-[340px] shrink-0 border-r bg-card overflow-y-auto p-3 space-y-2">
        {deck.map((c) => {
          const Icon = c.icon;
          const isOpen = open.has(c.id);
          return (
            <div key={c.id} className={cn('rounded-xl border bg-surface transition-all', isOpen ? 'border-accent/60 shadow-md' : 'border-border-default hover:border-accent/40')}>
              <button type="button" onClick={() => toggle(c.id)} className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isOpen ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-xs font-bold truncate', isOpen ? 'text-text-primary' : 'text-text-secondary')}>{c.title}</span>
                  {isOpen && <span className="block text-[9px] text-text-muted truncate">{c.subtitle}</span>}
                </span>
                <ChevronRight className={cn('h-3.5 w-3.5 text-text-muted transition-transform shrink-0', isOpen && 'rotate-90')} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-border-default pt-2 overflow-y-auto max-h-80">
                  {c.body}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20">
        <div className="h-full w-full overflow-auto">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-4 gap-3">
            {props.renderPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant 10 · CORNER CONSOLE ────────────────────────────────────────────
// A single floating console card pinned to the top-right corner containing
// ALL controls (mini tabbed cockpit). The preview fills the ENTIRE remaining
// stage edge-to-edge — maximum warehouse visibility.

export function LayoutCornerConsole(props: LayoutConfigVariantProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex-1 flex overflow-hidden min-h-0 relative">
      {/* Full-stage preview */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/20">
        <div className="h-full w-full overflow-auto">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-4 gap-3">
            {props.renderPreview()}
          </div>
        </div>
      </div>

      {/* Floating console card (top-right) */}
      <div
        className={cn(
          'absolute top-4 right-4 w-[360px] max-h-[calc(100%-2rem)] flex flex-col rounded-2xl border bg-surface shadow-xl transition-all',
          open ? 'border-accent/50' : 'border-border-default'
        )}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Console</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary transition-colors"
            title={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronRight className="h-4 w-4 rotate-180" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        {open && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <VariantCockpit {...props} />
          </div>
        )}
        {open && <div className="p-3 border-t border-border-default shrink-0">{props.renderFooter()}</div>}
      </div>

      {/* Collapsed chip to re-open */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute top-4 right-4 z-10 rounded-xl border border-border-default bg-surface px-3 py-2 shadow-md text-xs font-semibold text-text-secondary hover:text-accent transition-colors"
        >
          Open Console
        </button>
      )}
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
  { id: 6, name: 'Floating Cards', short: 'Cards', Component: LayoutFloatingCards },
  { id: 7, name: 'Filmstrip', short: 'Film', Component: LayoutFilmstrip },
  { id: 8, name: 'Centered Compass', short: 'Compass', Component: LayoutCompass },
  { id: 9, name: 'Split Deck', short: 'Deck', Component: LayoutSplitDeck },
  { id: 10, name: 'Corner Console', short: 'Console', Component: LayoutCornerConsole },
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
      {LAYOUT_VARIANTS.map((v, i) => (
        <button
          key={v.id}
          type="button"
          title={`${v.name} (key ${i + 1})`}
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
            {i + 1}
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
      // Keys 1..N select the Nth variant in the registry (ids may not be 1-based).
      if (n >= 1 && n <= LAYOUT_VARIANTS.length) {
        const target = LAYOUT_VARIANTS[n - 1];
        if (target) setActive(target.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActive]);
}
