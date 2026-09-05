'use client';

import { useEffect, useRef, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';

/* ── Easing ─────────────────────────────────────────────── */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ── Timeline (seconds, loops) ──────────────────────────── */
const TOTAL = 14;
const ZOOM_T0 = 1.6;
const ZOOM_T1 = 3.0;
const GEO_T0 = 3.4;
const GEO_T1 = 5.2;
const INV_TAB = 5.8;
const INV_T0 = 6.2;
const INV_T1 = 8.0;
const PLC_TAB = 8.6;
const PLC_T0 = 9.0;
const PLC_T1 = 10.8;
const CURSOR_T0 = 11.2;
const CLICK_T = 12.2;
const CURSOR_OUT_T0 = 13.2;

type Tab = 'geometry' | 'inventory' | 'placement';

/* Every slider in a phase shares one window — they move together,
   just in different directions / amounts. */
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

const ANIMS: SliderAnim[] = [
  // Geometry — height up, racks down, aisles up
  { key: 'gridHeight', t0: GEO_T0, t1: GEO_T1, from: 12, to: 21 },
  { key: 'rackCount', t0: GEO_T0, t1: GEO_T1, from: 18, to: 10 },
  { key: 'crossAisle', t0: GEO_T0, t1: GEO_T1, from: 1, to: 3 },
  // Inventory — sku up, demand up, affinity down, footprint up
  { key: 'sku', t0: INV_T0, t1: INV_T1, from: 750, to: 950 },
  { key: 'demand', t0: INV_T0, t1: INV_T1, from: 20, to: 78 },
  { key: 'affinity', t0: INV_T0, t1: INV_T1, from: 60, to: 25 },
  { key: 'footprint', t0: INV_T0, t1: INV_T1, from: 30, to: 58 },
  // Placement — slotting up, clustering down
  { key: 'slotting', t0: PLC_T0, t1: PLC_T1, from: 15, to: 85 },
  { key: 'clustering', t0: PLC_T0, t1: PLC_T1, from: 70, to: 35 },
];

function valueAt(key: string, t: number): number {
  const a = ANIMS.find((x) => x.key === key);
  if (!a) return BASE[key];
  if (t <= a.t0) return a.from;
  if (t >= a.t1) return a.to;
  return a.from + (a.to - a.from) * easeInOutCubic((t - a.t0) / (a.t1 - a.t0));
}

function tabAt(t: number): Tab {
  if (t < INV_TAB) return 'geometry';
  if (t < PLC_TAB) return 'inventory';
  return 'placement';
}

/* ── Faux slider (read-only, looks like the real one) ───── */
function FauxSlider({
  label,
  value,
  min,
  max,
  display,
  low,
  high,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  low?: string;
  high?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="space-y-1.5">
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
        step={0.01}
        value={value}
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
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTime(TOTAL);
      return;
    }
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const nt = t + dt;
        return nt >= TOTAL ? nt - TOTAL : nt;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = null;
    };
  }, []);

  const tab = tabAt(time);
  // Uniform scale zoom (no stretch) that lands on exactly 1.0 and stays
  // there — crisp for the whole second half, no zoom-out at the end.
  const zoomP = easeOutExpo(clamp01((time - ZOOM_T0) / (ZOOM_T1 - ZOOM_T0)));
  const scale = Math.round((0.85 + 0.15 * zoomP) * 1000) / 1000;

  // Cursor: flies in from bottom-right, clicks, fades out before the loop.
  const cursorP = easeInOutCubic(clamp01((time - CURSOR_T0) / (CLICK_T - CURSOR_T0)));
  const cursorOpacity =
    time < CURSOR_T0
      ? 0
      : time < CURSOR_OUT_T0
        ? cursorP
        : Math.max(0, 1 - (time - CURSOR_OUT_T0) / (TOTAL - CURSOR_OUT_T0));
  const cursorDX = 150 * (1 - cursorP);
  const cursorDY = -130 * (1 - cursorP);
  const clickP = clamp01((time - CLICK_T) / 0.6);
  const clicked = time >= CLICK_T;
  const pressing = time >= CLICK_T && time < CLICK_T + 0.45;

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div
        style={{ transform: `scale(${scale})` }}
        className="relative w-[340px] max-w-[calc(100vw-2rem)]"
      >
        <aside className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
          <div className="space-y-3 p-3">
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
                  />
                  <FauxSlider
                    label="Rack Count"
                    value={v.rackCount}
                    min={5}
                    max={25}
                    display={`${Math.round(v.rackCount)}`}
                  />
                  <FauxSlider
                    label="Cross Aisles"
                    value={v.crossAisle}
                    min={0}
                    max={4}
                    display={`${Math.round(v.crossAisle)}`}
                    low="0 · Parallel"
                    high="4 · Thoroughfares"
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
                  />
                  <FauxSlider
                    label="Demand Distribution"
                    value={v.demand}
                    min={0}
                    max={100}
                    display={`${Math.round(v.demand)}%`}
                    low="Uniform"
                    high="Pareto"
                  />
                  <FauxSlider
                    label="Product Affinity"
                    value={v.affinity}
                    min={0}
                    max={100}
                    display={`${Math.round(v.affinity)}%`}
                    low="Independent"
                    high="Highly Related"
                  />
                  <FauxSlider
                    label="Storage Footprint"
                    value={v.footprint}
                    min={0}
                    max={100}
                    display={`${Math.round(v.footprint)}%`}
                    low="Compact"
                    high="Bulky"
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
                  />
                  <FauxSlider
                    label="Category Clustering"
                    value={v.clustering}
                    min={0}
                    max={100}
                    display={`${Math.round(v.clustering)}%`}
                    low="Scattered"
                    high="Clustered"
                  />
                </>
              )}
            </div>
          </div>
          <footer className="border-t border-border bg-card px-3 py-2.5">
            <div
              className={`w-full rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground transition-all duration-150 ${
                pressing ? 'scale-[0.97] brightness-90' : ''
              }`}
            >
              Generate Warehouse
            </div>
          </footer>
        </aside>
        {/* Cursor + click ripple, anchored to the button (bottom-center) */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute"
            style={{
              left: `calc(50% + ${cursorDX}px)`,
              bottom: `${30 + cursorDY}px`,
              opacity: cursorOpacity,
            }}
          >
            {/* Ripple rings on click — clearly visible */}
            {clicked && clickP < 1 && (
              <>
                <span
                  className="absolute rounded-full border-[3px] border-primary"
                  style={{
                    width: 14 + 56 * clickP,
                    height: 14 + 56 * clickP,
                    left: -(7 + 28 * clickP),
                    top: -(7 + 28 * clickP),
                    opacity: 1 - clickP,
                  }}
                />
                <span
                  className="absolute rounded-full bg-primary"
                  style={{
                    width: 10,
                    height: 10,
                    left: -5,
                    top: -5,
                    opacity: 0.9 * (1 - clickP),
                    transform: `scale(${1 + clickP * 0.6})`,
                  }}
                />
              </>
            )}
            {/* Arrow pointer, tip at the click point */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              style={{ transform: 'translate(-2px, -2px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}
            >
              <path
                d="M5 3l14 7.5-6.2 1.8L9.5 19 5 3z"
                fill="#111"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
      <AgentationToolbar enabled />
    </div>
  );
}
