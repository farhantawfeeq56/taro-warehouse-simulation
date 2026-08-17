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
 *   • Parallel and Cross Aisle are merged into a single geometry control
 *     group — the cross-aisle slider is the ONLY survivor, defaulting to 1
 *     and able to reach 0 (plain parallel).
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Shared types ────────────────────────────────────────────────────────────

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
        {label && (
          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-text-primary">
            {display ?? value}
          </span>
        )}
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

// ── Variant 1 · STEP RAILS ──────────────────────────────────────────────────
// Three horizontally stacked rails, one per variable group. Each rail is a
// numbered stage (1 Geometry → 2 Inventory → 3 Placement); the variable that
// is "in focus" expands its full slider set inline. Every control remains
// visible with zero clicks — the step affordance is purely visual ordering.

const STEP_RAIL_META = [
  { id: 'geometry', num: 1, label: 'Geometry', icon: Warehouse, blurb: 'Racks & aisles' },
  { id: 'inventory', num: 2, label: 'Inventory', icon: Package, blurb: 'What exists' },
  { id: 'placement', num: 3, label: 'Placement', icon: Boxes, blurb: 'Where it lives' },
] as const;

type StepRailId = (typeof STEP_RAIL_META)[number]['id'];

export function VariantStepRails(props: LayoutConfigVariantProps) {
  const [focus, setFocus] = useState<StepRailId>('geometry');
  return (
    <div className="space-y-3">
      {STEP_RAIL_META.map((rail) => {
        const Icon = rail.icon;
        const active = focus === rail.id;
        return (
          <div
            key={rail.id}
            className={cn(
              'rounded-xl border transition-colors',
              active ? 'border-accent/50 bg-surface shadow-sm' : 'border-border-default bg-surface/60'
            )}
          >
            <button
              type="button"
              onClick={() => setFocus(rail.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active ? 'bg-accent text-primary-foreground' : 'bg-muted text-text-muted'
                )}
              >
                {rail.num}
              </span>
              <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-text-muted')} />
              <span className="flex-1">
                <span className={cn('block text-sm font-semibold', active ? 'text-text-primary' : 'text-text-secondary')}>
                  {rail.label}
                </span>
                <span className="block text-[11px] text-text-muted">{rail.blurb}</span>
              </span>
              <ChevronRight className={cn('h-4 w-4 text-text-muted transition-transform', active && 'rotate-90')} />
            </button>
            {active && (
              <div className="px-4 pb-4 pt-1 space-y-5">
                {rail.id === 'geometry' && (
                  <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} />
                )}
                {rail.id === 'inventory' && (
                  <>
                    <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} hint="Unique products to generate." onChange={props.onSkuCountChange} />
                    <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% hold ${Math.round(props.demandSummary.topShare * 100)}% of demand`} onChange={props.onDemandDistributionChange} />
                    <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups · largest ${props.affinitySummary.largestGroupSize}`} onChange={props.onProductAffinityChange} />
                    <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`${props.footprintSummary.multiBinCount} multi-bin · needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
                  </>
                )}
                {rail.id === 'placement' && (
                  <>
                    <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} SKUs placed`} onChange={props.onSlottingBiasChange} />
                    <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Variant 2 · HORIZON TABS ───────────────────────────────────────────────
// A single tab strip for the three variable groups; each tab opens its own
// scrollable "page". Inside a page the controls flow top-to-bottom with no
// section headers — the tab itself is the heading.

export function VariantHorizonTabs(props: LayoutConfigVariantProps) {
  const [tab, setTab] = useState<'geometry' | 'inventory' | 'placement'>('geometry');
  const pages = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'placement' as const, label: 'Placement', icon: Boxes },
  ];
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 border-b border-border-default px-1 pt-1">
        {pages.map((p) => {
          const Icon = p.icon;
          const active = tab === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setTab(p.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px',
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {tab === 'geometry' && (
          <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="plain" />
        )}
        {tab === 'inventory' && (
          <>
            <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} hint="Unique products to generate." onChange={props.onSkuCountChange} />
            <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% hold ${Math.round(props.demandSummary.topShare * 100)}% of demand`} onChange={props.onDemandDistributionChange} />
            <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups · largest ${props.affinitySummary.largestGroupSize}`} onChange={props.onProductAffinityChange} />
            <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`${props.footprintSummary.multiBinCount} multi-bin · needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
          </>
        )}
        {tab === 'placement' && (
          <>
            <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} SKUs placed`} onChange={props.onSlottingBiasChange} />
            <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Variant 3 · QUESTION WIZARD ─────────────────────────────────────────────
// A forced linear flow: ONE question at a time, big binary slider, large
// Continue button. Progress is drawn as a segmented stepper ("2 / 7").
// Answering a question auto-advances; the header row lets you jump back to
// any answered step.

const WIZARD_STEPS = [
  { id: 'geometry', icon: Warehouse, label: 'Size', question: 'How big is the storage area?', hint: 'Tune grid height, rack count and aisle spacing.' },
  { id: 'aisle', icon: Split, label: 'Aisles', question: 'How many cross aisles cut through the racks?', hint: '0 keeps a plain parallel grid — each extra aisle is another horizontal thoroughfare.' },
  { id: 'skus', icon: Package, label: 'Catalogue', question: 'How many unique products do you sell?', hint: 'More SKUs need more bins to hold them.' },
  { id: 'demand', icon: TrendingUp, label: 'Demand', question: 'Is demand spread evenly or concentrated?', hint: 'Uniform spreads volume across all products; Pareto concentrates it on a few best-sellers.' },
  { id: 'affinity', icon: Tags, label: 'Affinity', question: 'Do products tend to be bought together?', hint: 'Related products can share storage zones and appear together in orders.' },
  { id: 'footprint', icon: Layers, label: 'Footprint', question: 'How bulky is the average product?', hint: 'Compact products take one bin; bulky ones need several.' },
  { id: 'placement', icon: Boxes, label: 'Place', question: 'Where should inventory live?', hint: 'Balance demand-based slotting with category zoning.' },
] as const;

export function VariantWizard(props: LayoutConfigVariantProps) {
  const [step, setStep] = useState(0);
  const lastAnswered = Math.max(0, step);
  const total = WIZARD_STEPS.length;

  const next = () => setStep((s) => Math.min(total - 1, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const current = WIZARD_STEPS[step];
  const Icon = current.icon;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress stepper */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Step {step + 1} of {total}
          </span>
          <span className="text-[11px] text-text-muted">{Math.round(((step + 1) / total) * 100)}% complete</span>
        </div>
        <div className="flex gap-1">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-muted'
              )}
              title={s.label}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors',
                i === step ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-muted'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Current question */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div className="rounded-2xl border border-border-default bg-surface p-5 space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{current.label}</p>
              <h3 className="text-base font-bold text-text-primary leading-snug">{current.question}</h3>
            </div>
          </div>
          <p className="text-xs text-text-muted">{current.hint}</p>

          <div className="space-y-5 pt-1">
            {step === 0 && (
              <>
                {buildGeometrySliders(props.geometry, props.onGeometryChange, props.onGeometryCommit).map((s) => (
                  <VariantSlider key={s.label} {...s} />
                ))}
              </>
            )}
            {step === 1 && (
              <VariantSlider
                label="Cross Aisles"
                value={props.geometry.crossAisleCount}
                min={0}
                max={4}
                step={1}
                low="0 · Parallel"
                high="4 · Thoroughfares"
                display={`${props.geometry.crossAisleCount}${props.geometry.crossAisleCount === 0 ? ' · parallel' : ''}`}
                onChange={(v) => props.onGeometryChange({ crossAisleCount: v })}
              />
            )}
            {step === 2 && (
              <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} onChange={props.onSkuCountChange} />
            )}
            {step === 3 && (
              <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}% of demand`} onChange={props.onDemandDistributionChange} />
            )}
            {step === 4 && (
              <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups · largest ${props.affinitySummary.largestGroupSize}`} onChange={props.onProductAffinityChange} />
            )}
            {step === 5 && (
              <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
            )}
            {step === 6 && (
              <>
                <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" onChange={props.onSlottingBiasChange} />
                <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" onChange={props.onCategoryClusteringChange} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="p-4 border-t border-border-default flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-muted disabled:opacity-40 transition-colors"
        >
          ← Back
        </button>
        {step < total - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-primary-foreground text-xs font-semibold hover:bg-accent-hover transition-colors"
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-positive-soft text-positive text-xs font-semibold">
            <Check className="h-3.5 w-3.5" /> Ready to generate
          </span>
        )}
      </div>
    </div>
  );
}

// ── Variant 4 · FIELD MAP ───────────────────────────────────────────────────
// A spatial map of the whole configuration: the left half renders the actual
// warehouse cells (rows = grid height, columns = racks), colour-coded by the
// three variable families. Clicking any region focuses the matching family,
// which then owns the right half of the panel. Drag "hot spots" are dropped
// in favour of click-to-focus so state stays simple.

export function VariantFieldMap(props: LayoutConfigVariantProps) {
  const [focus, setFocus] = useState<StepRailId>('geometry');
  const rows = props.previewSize.height;
  const cols = props.previewSize.width;
  const raster = props.layoutRaster;

  const maxRows = 34;
  const maxCols = 60;
  const shownRows = Math.min(rows, maxRows);
  const shownCols = Math.min(cols, maxCols);

  const cell = useMemo(() => {
    // best-fit square cell for the shown region
    return Math.max(4, Math.min(10, Math.floor(Math.min(320 / shownCols, 220 / shownRows))));
  }, [shownCols, shownRows]);

  const zones: { id: 'geometry' | 'inventory' | 'placement'; label: string; desc: string }[] = [
    { id: 'geometry', label: 'Geometry', desc: `${shownCols}×${shownRows} cells · ${props.geometry.crossAisleCount} cross aisles` },
    { id: 'inventory', label: 'Inventory', desc: `${props.skuCount.toLocaleString()} SKUs` },
    { id: 'placement', label: 'Placement', desc: `${props.placementSummary.placed}/${props.placementSummary.total} placed` },
  ];

  const zoneColor: Record<string, string> = {
    geometry: 'bg-accent/70',
    inventory: 'bg-accent-soft',
    placement: 'bg-muted',
  };

  const rowsToRender: ('empty' | 'shelf' | 'worker')[][] = [];
  for (let y = 0; y < shownRows; y++) {
    const row: ('empty' | 'shelf' | 'worker')[] = [];
    for (let x = 0; x < shownCols; x++) {
      row.push(raster[y]?.[x] ?? 'empty');
    }
    rowsToRender.push(row);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Map */}
        <div className="rounded-xl border border-border-default bg-surface p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              <h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">Field map</h4>
            </div>
            <span className="text-[10px] font-mono text-text-muted">
              {shownCols}w × {shownRows}h
            </span>
          </div>
          <div
            className="grid gap-[1px] bg-border-default"
            style={{
              gridTemplateColumns: `repeat(${shownCols}, ${cell}px)`,
              width: 'max-content',
            }}
          >
            {rowsToRender.map((row, y) =>
              row.map((type, x) => {
                let cls = 'bg-muted';
                if (type === 'worker') cls = 'bg-warning';
                if (type === 'shelf') {
                  const meta = props.shelfMeta.get(`${x},${y}`);
                  cls = meta?.active ? 'bg-accent' : 'bg-accent/30';
                }
                return (
                  <div
                    key={`${x}-${y}`}
                    className={cn('rounded-[1px]', cls)}
                    style={{ width: cell, height: cell }}
                  />
                );
              })
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-accent rounded-sm" /> Shelf</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-accent/30 rounded-sm" /> Empty shelf</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-warning rounded-sm" /> Dispatch</span>
          </div>
        </div>

        {/* Focus legend */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setFocus(z.id)}
              className={cn(
                'rounded-lg border p-2 text-left transition-colors',
                focus === z.id
                  ? 'border-accent/60 bg-accent-soft/60'
                  : 'border-border-default bg-surface hover:bg-muted/40'
              )}
            >
              <span className={cn('block h-1.5 w-6 rounded-full mb-1.5', zoneColor[z.id])} />
              <span className="block text-[11px] font-semibold text-text-primary">{z.label}</span>
              <span className="block text-[10px] text-text-muted leading-tight">{z.desc}</span>
            </button>
          ))}
        </div>

        {/* Focused controls */}
        <div className="mt-4 space-y-5">
          {focus === 'geometry' && (
            <GeometryBlock g={props.geometry} onChange={props.onGeometryChange} onCommit={props.onGeometryCommit} accent="card" />
          )}
          {focus === 'inventory' && (
            <div className="space-y-5">
              <VariantSlider label="SKU Count" value={props.skuCount} min={500} max={10000} step={1} display={props.skuCount.toLocaleString()} hint="Unique products to generate." onChange={props.onSkuCountChange} />
              <VariantSlider label="Demand Distribution" value={props.demandDistribution} min={0} max={100} step={1} display={`${props.demandDistribution}%`} low="Uniform" high="Pareto" stat={`Top 20% → ${Math.round(props.demandSummary.topShare * 100)}%`} onChange={props.onDemandDistributionChange} />
              <VariantSlider label="Product Affinity" value={props.productAffinity} min={0} max={100} step={1} display={`${props.productAffinity}%`} low="Independent" high="Related" stat={`${props.affinitySummary.groupCount} groups`} onChange={props.onProductAffinityChange} />
              <VariantSlider label="Storage Footprint" value={props.storageFootprint} min={0} max={100} step={1} display={`${props.storageFootprint}%`} low="Compact" high="Bulky" stat={`Needs ${props.footprintSummary.totalBins} bins`} onChange={props.onStorageFootprintChange} />
            </div>
          )}
          {focus === 'placement' && (
            <div className="space-y-5">
              <VariantSlider label="Slotting Bias" value={props.slottingBias} min={0} max={100} step={1} display={`${props.slottingBias}%`} low="Random" high="Demand-Based" stat={`${props.placementSummary.placed}/${props.placementSummary.total} SKUs placed`} onChange={props.onSlottingBiasChange} />
              <VariantSlider label="Category Clustering" value={props.categoryClustering} min={0} max={100} step={1} display={`${props.categoryClustering}%`} low="Scattered" high="Clustered" stat={`${props.placementSummary.categoryCount} categories`} onChange={props.onCategoryClusteringChange} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Variant 5 · DIAL BOARD ──────────────────────────────────────────────────
// A cockpit of mini "instruments" per variable — gauges, sparklines, bars.
// Every slider is an adjustable dial; every value is also read back as a live
// gauge. Organized into three instrument clusters.

export function VariantDialBoard(props: LayoutConfigVariantProps) {
  const [cluster, setCluster] = useState<StepRailId>('geometry');

  const demandCurve = useMemo(() => {
    // approximate Pareto curve for sparkline: (i+1)^-alpha normalized
    const alpha = (props.demandDistribution / 100) * 2;
    const n = 32;
    return Array.from({ length: n }, (_, i) => 1 / Math.pow((i + 1) / n, alpha));
  }, [props.demandDistribution]);

  const clusterTabs = [
    { id: 'geometry' as const, label: 'Geometry', icon: Warehouse },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'placement' as const, label: 'Placement', icon: Boxes },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-4 pt-4">
        {clusterTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setCluster(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                cluster === t.id ? 'bg-accent text-primary-foreground' : 'text-text-muted hover:bg-muted'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {cluster === 'geometry' && (
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

        {cluster === 'inventory' && (
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

        {cluster === 'placement' && (
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

// ── Preview insights (layout / demand / affinity) ─────────────────────────
// Small live readouts under the grid that "figure something out" from the
// current placement: geometry footprint, demand-to-dispatch correlation,
// affinity group concentration.

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
  { id: 1, name: 'Step Rails', short: 'Steps', Component: VariantStepRails },
  { id: 2, name: 'Horizon Tabs', short: 'Tabs', Component: VariantHorizonTabs },
  { id: 3, name: 'Question Wizard', short: 'Wizard', Component: VariantWizard },
  { id: 4, name: 'Field Map', short: 'Map', Component: VariantFieldMap },
  { id: 5, name: 'Dial Board', short: 'Dials', Component: VariantDialBoard },
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
