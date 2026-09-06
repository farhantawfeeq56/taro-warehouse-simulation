'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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

/* Sliding tab bar with the indicator driven by the page timeline — never by
   its own spring — so it glides exactly with the content switch. */
const SWITCH_W = 0.45;
const TAB_DEFS: { id: Tab; label: string }[] = [
  { id: 'geometry', label: 'Geometry' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'placement', label: 'Placement' },
];
const SWITCHES = [
  { at: INV_TAB, from: 0, to: 1 },
  { at: PLC_TAB, from: 1, to: 2 },
];

function SyncedTabs({ time, tab }: { time: number; tab: Tab }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [rects, setRects] = useState<{ x: number; w: number }[]>([]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const read = () => {
      const r = btnRefs.current.map((b) => ({
        x: b?.offsetLeft ?? 0,
        w: b?.offsetWidth ?? 0,
      }));
      setRects((prev) =>
        prev.length === r.length && prev.every((p, i) => p.x === r[i].x && p.w === r[i].w)
          ? prev
          : r
      );
    };
    read();
    const ob = new ResizeObserver(read);
    ob.observe(row);
    return () => ob.disconnect();
  }, []);

  const activeIdx = tab === 'geometry' ? 0 : tab === 'inventory' ? 1 : 2;
  let ix = rects[activeIdx]?.x ?? 0;
  let iw = rects[activeIdx]?.w ?? 0;
  for (const s of SWITCHES) {
    const p = clamp01((time - (s.at - SWITCH_W / 2)) / SWITCH_W);
    if (p > 0 && p < 1 && rects.length === 3) {
      const e = easeInOutCubic(p);
      ix = rects[s.from].x + (rects[s.to].x - rects[s.from].x) * e;
      iw = rects[s.from].w + (rects[s.to].w - rects[s.from].w) * e;
    }
  }

  return (
    <div className="pointer-events-none w-full rounded-lg border border-border bg-muted/40 p-1" aria-hidden>
      <div ref={rowRef} className="relative flex w-full gap-0.5">
        <span
          aria-hidden
          className="absolute bottom-0 top-0 rounded-md bg-surface shadow-sm"
          style={{ left: ix, width: iw, opacity: rects.length === 3 ? 1 : 0 }}
        />
        {TAB_DEFS.map((t, i) => {
          const selected = i === activeIdx;
          return (
            <span
              key={t.id}
              ref={(node) => {
                btnRefs.current[i] = node;
              }}
              className={`relative z-10 flex h-8 flex-1 min-w-0 shrink items-center justify-center rounded-md px-3 text-[12.5px] ${
                selected ? 'font-medium text-text-primary' : 'text-text-secondary'
              }`}
            >
              <span className="relative grid place-items-center leading-[1.4]">
                <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">
                  {t.label}
                </span>
                <span className={`col-start-1 row-start-1 ${selected ? 'font-medium' : ''}`}>
                  {t.label}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function LayoutVideoPage() {
  const [time, setTime] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState(1);

  // Shrink-to-fit so the fixed viewport stage never clips nor scrolls.
  useLayoutEffect(() => {
    const compute = () => {
      const h = asideRef.current?.offsetHeight ?? 0;
      const avail = window.innerHeight - 32;
      const f = h > 0 ? Math.min(1, avail / h) : 1;
      setFit((prev) => (prev === f ? prev : f));
    };
    compute();
    window.addEventListener('resize', compute);
    const ob = asideRef.current ? new ResizeObserver(compute) : null;
    if (asideRef.current && ob) ob.observe(asideRef.current);
    return () => {
      window.removeEventListener('resize', compute);
      ob?.disconnect();
    };
  }, []);

  const buttonRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const clickRef = useRef({ x: 170, y: 300 });
  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [groupH, setGroupH] = useState<number[]>([0, 0, 0]);

  useLayoutEffect(() => {
    const read = () => {
      const h = measureRefs.current.map((b) => b?.offsetHeight ?? 0);
      setGroupH((prev) =>
        prev.length === 3 && prev.every((x, i) => x === h[i]) ? prev : h
      );
    };
    read();
    const ros = measureRefs.current.map((el) => {
      if (!el) return null;
      const o = new ResizeObserver(read);
      o.observe(el);
      return o;
    });
    return () => ros.forEach((o) => o?.disconnect());
  }, []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTime(TOTAL);
      return;
    }
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      // Measure the real button center so the cursor lands exactly on it.
      const wrap = wrapRef.current;
      const btn = buttonRef.current;
      if (wrap && btn) {
        const wb = wrap.getBoundingClientRect();
        const bb = btn.getBoundingClientRect();
        const s = scaleRef.current || 1;
        clickRef.current = {
          x: (bb.left + bb.width / 2 - wb.left) / s,
          y: (bb.top + bb.height / 2 - wb.top) / s,
        };
      }
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
  const scale = Math.round((0.7 + 0.3 * zoomP) * 1000) / 1000;
  // From nothing: fades in just ahead of the zoom.
  const appear = easeOutExpo(clamp01((time - (ZOOM_T0 - 0.5)) / 1.2));
  scaleRef.current = scale * fit;
  const click = clickRef.current;

  // Cursor: flies in from bottom-right, clicks, fades out before the loop.
  const cursorP = easeInOutCubic(clamp01((time - CURSOR_T0) / (CLICK_T - CURSOR_T0)));
  const cursorOpacity =
    time < CURSOR_T0
      ? 0
      : time < CURSOR_OUT_T0
        ? cursorP
        : Math.max(0, 1 - (time - CURSOR_OUT_T0) / (TOTAL - CURSOR_OUT_T0));
  const cursorDX = 150 * (1 - cursorP);
  const cursorDY = 140 * (1 - cursorP);
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

  const groups: ReactNode[][] = [
    [
      <FauxSlider key="gh" label="Grid Height" value={v.gridHeight} min={4} max={25} display={`${Math.round(v.gridHeight)}`} />,
      <FauxSlider key="rc" label="Rack Count" value={v.rackCount} min={5} max={25} display={`${Math.round(v.rackCount)}`} />,
      <FauxSlider key="ca" label="Cross Aisles" value={v.crossAisle} min={0} max={4} display={`${Math.round(v.crossAisle)}`} low="0 · Parallel" high="4 · Thoroughfares" />,
    ],
    [
      <FauxSlider key="sku" label="SKU Count" value={v.sku} min={500} max={1000} display={Math.round(v.sku).toLocaleString()} />,
      <FauxSlider key="dd" label="Demand Distribution" value={v.demand} min={0} max={100} display={`${Math.round(v.demand)}%`} low="Uniform" high="Pareto" />,
      <FauxSlider key="pa" label="Product Affinity" value={v.affinity} min={0} max={100} display={`${Math.round(v.affinity)}%`} low="Independent" high="Highly Related" />,
      <FauxSlider key="sf" label="Storage Footprint" value={v.footprint} min={0} max={100} display={`${Math.round(v.footprint)}%`} low="Compact" high="Bulky" />,
    ],
    [
      <FauxSlider key="sb" label="Slotting Bias" value={v.slotting} min={0} max={100} display={`${Math.round(v.slotting)}%`} low="Random" high="Demand-Based" />,
      <FauxSlider key="cc" label="Category Clustering" value={v.clustering} min={0} max={100} display={`${Math.round(v.clustering)}%`} low="Scattered" high="Clustered" />,
    ],
  ];

  // vartest transition: which groups are on stage + eased progress.
  const stageIdx = tab === 'geometry' ? 0 : tab === 'inventory' ? 1 : 2;
  let fromIdx = stageIdx;
  let toIdx = stageIdx;
  let tp = -1;
  for (const s of SWITCHES) {
    const pr = (time - (s.at - SWITCH_W / 2)) / SWITCH_W;
    if (pr >= 0 && pr <= 1) {
      fromIdx = s.from;
      toIdx = s.to;
      tp = easeInOutCubic(pr);
    }
  }
  const heightsReady = groupH.every((h) => h > 0);
  const boxH = tp < 0 ? groupH[fromIdx] : groupH[fromIdx] + (groupH[toIdx] - groupH[fromIdx]) * tp;

  // Winner: slide — outgoing slides left-out, incoming slides right-in.
  let outStyle: CSSProperties = {};
  let inStyle: CSSProperties = {};
  if (tp >= 0) {
    outStyle = { opacity: Math.max(0, 1 - tp * 1.6), transform: `translateX(${-48 * tp}px)` };
    inStyle = {
      opacity: Math.min(1, Math.max(0, (tp - 0.15) / 0.6)),
      transform: `translateX(${48 * (1 - tp)}px)`,
    };
  }

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        ref={wrapRef}
        style={{ transform: `scale(${scale * fit})`, opacity: appear }}
        className="relative w-[340px] max-w-[calc(100vw-2rem)]"
      >
        <aside ref={asideRef} className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
          <div className="space-y-3 p-3">
            <SyncedTabs time={time} tab={tab} />
            {/* Hidden measurer — group heights drive the smooth height ease. */}
            <div aria-hidden className="invisible h-0 overflow-hidden">
              {groups.map((g, i) => (
                <div
                  key={i}
                  ref={(node) => {
                    measureRefs.current[i] = node;
                  }}
                  className="space-y-4"
                >
                  {g}
                </div>
              ))}
            </div>
            <div
              className="overflow-hidden rounded-xl border border-border bg-surface p-3"
              style={heightsReady ? { height: boxH + 24 } : undefined}
            >
              {tp < 0 ? (
                <div className="space-y-4">{groups[fromIdx]}</div>
              ) : (
                <div className="grid">
                  <div className="col-start-1 row-start-1 space-y-4" style={outStyle}>
                    {groups[fromIdx]}
                  </div>
                  <div className="col-start-1 row-start-1 space-y-4" style={inStyle}>
                    {groups[toIdx]}
                  </div>
                </div>
              )}
            </div>
          </div>
          <footer className="border-t border-border bg-card px-3 py-2.5">
            <div
              ref={buttonRef}
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
              left: click.x + cursorDX,
              top: click.y + cursorDY,
              opacity: cursorOpacity,
            }}
          >
            {/* Arrow pointer — offset so the tip sits exactly on the click point */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              className="absolute"
              style={{ left: -5.4, top: -3.25, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}
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
      {/* Never in prod: local dev always, Vercel preview only when explicitly set. */}
      <AgentationToolbar
        enabled={
          process.env.NODE_ENV === 'development' ||
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
        }
      />
    </div>
  );
}
