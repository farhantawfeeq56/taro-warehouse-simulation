'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

/* ── Easing ─────────────────────────────────────────────── */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ── Timeline (seconds) ─────────────────────────────────── */
const TOTAL = 18;
const ZOOM_T0 = 2.2;
const ZOOM_T1 = 3.6;

type Tab = 'geometry' | 'inventory' | 'placement';

interface SliderAnim {
  key: string;
  t0: number;
  t1: number;
  from: number;
  to: number;
}

const BASE: Record<string, number> = {
  gridHeight: 12,
  rackCount: 18,
  crossAisle: 1,
  sku: 750,
  demand: 20,
  affinity: 60,
  footprint: 30,
  slotting: 15,
  clustering: 70,
};

/* One goes up, one goes down, staggered — never everything together. */
const ANIMS: SliderAnim[] = [
  // Geometry
  { key: 'gridHeight', t0: 3.8, t1: 5.4, from: 12, to: 21 },
  { key: 'rackCount', t0: 4.4, t1: 6.0, from: 18, to: 10 },
  { key: 'crossAisle', t0: 5.2, t1: 6.8, from: 1, to: 3 },
  // Inventory
  { key: 'sku', t0: 8.2, t1: 9.4, from: 750, to: 950 },
  { key: 'demand', t0: 8.8, t1: 10.2, from: 20, to: 78 },
  { key: 'affinity', t0: 9.5, t1: 10.9, from: 60, to: 25 },
  { key: 'footprint', t0: 10.1, t1: 11.5, from: 30, to: 58 },
  // Placement
  { key: 'slotting', t0: 13.0, t1: 14.4, from: 15, to: 85 },
  { key: 'clustering', t0: 13.7, t1: 15.2, from: 70, to: 35 },
];

function valueAt(key: string, t: number): number {
  const a = ANIMS.find((x) => x.key === key);
  if (!a) return BASE[key];
  if (t <= a.t0) return a.from;
  if (t >= a.t1) return a.to;
  return a.from + (a.to - a.from) * easeInOutCubic((t - a.t0) / (a.t1 - a.t0));
}

function activeSliderAt(t: number): string | null {
  for (const a of ANIMS) if (t >= a.t0 && t <= a.t1) return a.key;
  return null;
}

function tabAt(t: number): Tab {
  if (t < 7.4) return 'geometry';
  if (t < 12.3) return 'inventory';
  return 'placement';
}

function captionAt(t: number): { title: string; sub: string } {
  if (t < ZOOM_T0) return { title: 'The layout panel', sub: 'Starting wide — the whole config sidebar.' };
  if (t < ZOOM_T1) return { title: 'Zoom in · ease', sub: 'Camera pushes to center. Sliders take the stage.' };
  if (t < 7.4)
    return { title: 'Geometry', sub: 'Height climbs · rack count drops · cross aisles open.' };
  if (t < 12.3)
    return { title: 'Inventory', sub: 'SKU up · demand up · affinity down · footprint eases up.' };
  if (t < 15.8)
    return { title: 'Placement', sub: 'Slotting goes demand-based · clustering scatters.' };
  return { title: 'Settle', sub: 'Hold — then it loops.' };
}

/* ── Faux slider (read-only, looks like the real one) ───── */
function FauxSlider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  low,
  high,
  hot,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  low?: string;
  high?: string;
  hot?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const rounded = Math.round(value / step) * step;
  return (
    <div
      className={`space-y-1.5 rounded-lg px-1 py-0.5 transition-shadow duration-300 ${
        hot ? 'shadow-[0_0_0_1.5px_var(--color-accent,#4C5C2D)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
        <span className="text-xs font-sans text-text-primary bg-muted px-1.5 py-0.5 rounded tabular-nums">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={rounded}
        readOnly
        tabIndex={-1}
        aria-label={label}
        style={{ ['--fill' as string]: `${pct}%` }}
        className="layout-variant-range pointer-events-none"
      />
      {(low || high) && (
        <div className="flex justify-between text-[10px] text-text-secondary">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  );
}

function TabPills({ active }: { active: Tab }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'geometry', label: 'Geometry' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'placement', label: 'Placement' },
  ];
  return (
    <div className="flex gap-1 rounded-full border border-border bg-muted/40 p-1">
      {tabs.map((t) => (
        <span
          key={t.id}
          className={`flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-medium transition-all duration-300 ${
            active === t.id ? 'bg-primary text-primary-foreground shadow' : 'text-text-secondary'
          }`}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function LayoutVideoPage() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPlaying(false);
      setTime(TOTAL);
    }
  }, []);

  useEffect(() => {
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (playingRef.current) {
        setTime((t) => {
          const nt = t + dt;
          return nt >= TOTAL ? nt - TOTAL : nt;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = null;
    };
  }, []);

  const replay = useCallback(() => {
    last.current = null;
    setTime(0);
    setPlaying(true);
  }, []);

  // Derived frame state
  const tab = tabAt(time);
  const hot = activeSliderAt(time);
  const cap = captionAt(time);
  const zoomP = easeOutExpo(clamp01((time - ZOOM_T0) / (ZOOM_T1 - ZOOM_T0)));
  // Settle: gentle pull-back in the last 2s
  const settleP = easeInOutCubic(clamp01((time - 16) / 2));
  const scale = 0.85 + 0.27 * zoomP - 0.1 * settleP;
  const dim = 1 - 0.55 * zoomP + 0.25 * settleP; // backdrop overlay opacity inverse

  const v = {
    gridHeight: valueAt('gridHeight', time),
    rackCount: valueAt('rackCount', time),
    crossAisle: valueAt('crossAisle', time),
    sku: valueAt('sku', time),
    demand: valueAt('demand', time),
    affinity: valueAt('affinity', time),
    footprint: valueAt('footprint', time),
    slotting: valueAt('slotting', time),
    clustering: valueAt('clustering', time),
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#101210] text-white overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          Taro · Layout video
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
            className="rounded-full border border-white/15 p-2 text-white/80 transition hover:bg-white/10"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={replay}
            aria-label="Replay"
            className="rounded-full border border-white/15 p-2 text-white/80 transition hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Stage — panel zooms to center */}
      <div className="relative flex flex-1 items-center justify-center min-h-0 px-4">
        {/* Faint warehouse hint behind */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-6 rounded-2xl opacity-20"
          style={{
            opacity: 0.2 * dim,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />
        {/* Camera */}
        <div
          style={{ transform: `scale(${scale})` }}
          className="relative w-[340px] max-w-[calc(100vw-2rem)] will-change-transform"
        >
          <aside className="flex max-h-[62vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xl shadow-black/60">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <TabPills active={tab} />
              <div className="space-y-4 rounded-xl border border-border bg-surface p-3">
                {tab === 'geometry' && (
                  <>
                    <FauxSlider
                      label="Grid Height"
                      value={v.gridHeight}
                      min={4}
                      max={25}
                      display={`${Math.round(v.gridHeight)}`}
                      hot={hot === 'gridHeight'}
                    />
                    <FauxSlider
                      label="Rack Count"
                      value={v.rackCount}
                      min={5}
                      max={25}
                      display={`${Math.round(v.rackCount)}`}
                      hot={hot === 'rackCount'}
                    />
                    <FauxSlider
                      label="Cross Aisles"
                      value={v.crossAisle}
                      min={0}
                      max={4}
                      display={`${Math.round(v.crossAisle)}`}
                      low="0 · Parallel"
                      high="4 · Thoroughfares"
                      hot={hot === 'crossAisle'}
                    />
                  </>
                )}
                {tab === 'inventory' && (
                  <>
                    <FauxSlider
                      label="SKU Count"
                      value={v.sku}
                      min={500}
                      max={1000}
                      display={Math.round(v.sku).toLocaleString()}
                      hot={hot === 'sku'}
                    />
                    <FauxSlider
                      label="Demand Distribution"
                      value={v.demand}
                      min={0}
                      max={100}
                      display={`${Math.round(v.demand)}%`}
                      low="Uniform"
                      high="Pareto"
                      hot={hot === 'demand'}
                    />
                    <FauxSlider
                      label="Product Affinity"
                      value={v.affinity}
                      min={0}
                      max={100}
                      display={`${Math.round(v.affinity)}%`}
                      low="Independent"
                      high="Highly Related"
                      hot={hot === 'affinity'}
                    />
                    <FauxSlider
                      label="Storage Footprint"
                      value={v.footprint}
                      min={0}
                      max={100}
                      display={`${Math.round(v.footprint)}%`}
                      low="Compact"
                      high="Bulky"
                      hot={hot === 'footprint'}
                    />
                  </>
                )}
                {tab === 'placement' && (
                  <>
                    <FauxSlider
                      label="Slotting Bias"
                      value={v.slotting}
                      min={0}
                      max={100}
                      display={`${Math.round(v.slotting)}%`}
                      low="Random"
                      high="Demand-Based"
                      hot={hot === 'slotting'}
                    />
                    <FauxSlider
                      label="Category Clustering"
                      value={v.clustering}
                      min={0}
                      max={100}
                      display={`${Math.round(v.clustering)}%`}
                      low="Scattered"
                      high="Clustered"
                      hot={hot === 'clustering'}
                    />
                  </>
                )}
              </div>
            </div>
            <footer className="shrink-0 border-t border-border bg-card px-3 py-2.5">
              <div className="w-full rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground">
                Generate Warehouse
              </div>
            </footer>
          </aside>
        </div>

        {/* Caption */}
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center gap-1 px-6 text-center">
          <p key={cap.title} className="text-xl font-semibold tracking-tight">
            {cap.title}
          </p>
          <p key={cap.sub} className="max-w-md text-[13px] text-white/60">
            {cap.sub}
          </p>
        </div>
      </div>

      {/* Scrubber */}
      <footer className="shrink-0 px-5 pb-5">
        <input
          type="range"
          min={0}
          max={TOTAL}
          step={0.01}
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          aria-label="Video timeline"
          className="w-full accent-[#9DB25D]"
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/45">
          <span>{time.toFixed(1)}s</span>
          <span>{TOTAL.toFixed(0)}s · loops</span>
        </div>
      </footer>
    </div>
  );
}
