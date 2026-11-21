'use client';

/**
 * 8 — The film, as ordered: /1 → (Generate press) → /6 → /2 → (press) → /3
 * → /4 → /5 → (press) → /7.
 *
 * Every scene is the real Taro UI (ConfigTab, WarehouseSvgRenderer,
 * LoadingButton, AiSuggestion) against live runPipeline sessions — the same
 * pieces as /stage-show/1–7. All seven scenes stay mounted and crossfade, so
 * a cut never moves layout; the cut lands on the press frame itself (the
 * button going small), never after its animation settles.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { ConfigTab } from '@/components/taro/config-tab';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { LoadingButton } from '@/components/interior/loading-button';
import { toWarehouseInsight, generateExperiment } from '@/lib/taro/experiment-recommendation';
import { StageNav } from '../nav';
import {
  BASE_CONFIG,
  DEMO_ORDERS,
  DEMO_WORKERS,
  VARIANT_DEMAND,
  VARIANT_WIDE,
  bestOf,
  runPipeline,
} from '../run';

const noop = () => {};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* Master clock (seconds). Cuts land ON the press frame. */
const TOTAL = 28;
const GEN_PRESS = 4.8;
const SIM_BEAT = 9.2;
const SIM_PRESS = 12.0;
const ROUTE_END = 16.2;
const COMPARE_END = 20.2;
const AI_PRESS = 23.4;
const DIM_T0 = 27.0;
const PRESS_LEN = 0.35;

const BEATS = [
  { k: '01', label: 'Configure' },
  { k: '02', label: 'Four warehouses' },
  { k: '03', label: 'Simulate' },
  { k: '04', label: 'Winning route' },
  { k: '05', label: 'Ranked' },
  { k: '06', label: 'Experiment' },
  { k: '07', label: 'Taro' },
];

function beatAt(t: number): number {
  if (t < GEN_PRESS) return 0;
  if (t < SIM_BEAT) return 1;
  if (t < SIM_PRESS) return 2;
  if (t < ROUTE_END) return 3;
  if (t < COMPARE_END) return 4;
  if (t < AI_PRESS) return 5;
  return 6;
}

function pressAt(t: number): boolean {
  return (
    (t >= GEN_PRESS && t < GEN_PRESS + PRESS_LEN) ||
    (t >= SIM_PRESS && t < SIM_PRESS + PRESS_LEN) ||
    (t >= AI_PRESS && t < AI_PRESS + PRESS_LEN)
  );
}

const GRAND = {
  layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 2 },
  inventory: { skuCount: 420, demandDistribution: 55, productAffinity: 50, storageFootprint: 60 },
  placement: { slottingBias: 65, categoryClustering: 60 },
} as const;

export default function StageShow8() {
  const data = useMemo(() => {
    const all = [
      runPipeline(BASE_CONFIG, 'Flagship build'),
      runPipeline(VARIANT_WIDE, 'Wide cross-aisles'),
      runPipeline(VARIANT_DEMAND, 'Demand slotting'),
      runPipeline(GRAND, 'Grand hall'),
    ];
    const insights = all
      .filter((w) => w.results)
      .map((w) => toWarehouseInsight(w.name, w.name, w.configuration, w.results!));
    const ranked = all
      .filter((w) => w.results && bestOf(w.results))
      .map((w) => ({ pipe: w, best: bestOf(w.results!)! }))
      .sort((a, b) => a.best.totalDistance - b.best.totalDistance);
    let experiment: ReturnType<typeof runPipeline> | null = null;
    try {
      const rec = generateExperiment(insights, '');
      experiment = runPipeline(rec.configuration, `Experiment — ${rec.axis}`);
    } catch {
      experiment = null;
    }
    return { all, insights, ranked, experiment, base: all[0] };
  }, []);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const genWrapRef = useRef<HTMLSpanElement | null>(null);
  const simWrapRef = useRef<HTMLSpanElement | null>(null);
  const aiWrapRef = useRef<HTMLSpanElement | null>(null);
  const aiRootRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const routeRef = useRef(0);
  const stillRef = useRef(1);
  const cursorPos = useRef({ x: -100, y: -100 });
  const firedRef = useRef<{ loop: number; keys: Set<string> }>({ loop: -1, keys: new Set() });

  const [beat, setBeat] = useState(0);
  const [loop, setLoop] = useState(0);
  const [reduced, setReduced] = useState(false);

  const baseBest = bestOf(data.base.results);
  const expBest = bestOf(data.experiment?.results ?? null);

  useEffect(() => {
    stillRef.current = 1;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      routeRef.current = 1;
      setReduced(true);
      return;
    }
    let raf = 0;
    let lastUi = 0;
    let lastBeat = -1;
    let lastLoop = -1;
    const start = performance.now();

    const center = (el: Element | null) => {
      const stage = stageRef.current;
      if (!el || !stage) return null;
      const sr = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
    };
    const clickBtn = (wrap: HTMLElement | null) => {
      const b = wrap?.querySelector('button');
      if (b && !b.disabled) (b as HTMLButtonElement).click();
    };
    const fire = (loopN: number, key: string, at: number, t: number, fn: () => void) => {
      if (t >= at && !firedRef.current.keys.has(key)) {
        firedRef.current.keys.add(key);
        fn();
      }
      void loopN;
    };

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const loopN = Math.floor(elapsed / TOTAL);
      const t = elapsed - loopN * TOTAL;
      if (firedRef.current.loop !== loopN) firedRef.current = { loop: loopN, keys: new Set() };

      /* Real presses — the cut below lands on this same frame. */
      fire(loopN, 'gen', GEN_PRESS, t, () => clickBtn(genWrapRef.current));
      fire(loopN, 'sim', SIM_PRESS, t, () => clickBtn(simWrapRef.current));
      fire(loopN, 'ai', AI_PRESS, t, () => {
        const root = aiRootRef.current;
        if (root) {
          const btns = root.querySelectorAll('button');
          for (const b of btns) {
            if (/Generate/i.test(b.textContent ?? '') && !b.disabled) {
              (b as HTMLButtonElement).click();
              break;
            }
          }
        }
        clickBtn(aiWrapRef.current);
      });

      const b = beatAt(t);
      const pressing = pressAt(t);

      /* Frame-accurate cuts: scenes + button shrink driven by refs, not state. */
      sceneRefs.current.forEach((el, i) => {
        if (!el) return;
        const on = i === b;
        el.style.opacity = on ? '1' : '0';
        el.style.transform = on ? 'translateY(0)' : 'translateY(10px)';
        el.style.pointerEvents = on ? 'auto' : 'none';
        el.style.visibility = on ? 'visible' : 'hidden';
      });
      /* The shrink lives on the pressed beat's own button — keyed by time window,
         not by beat, because the cut has already advanced the beat. */
      const pressKind =
        t >= AI_PRESS && t < AI_PRESS + PRESS_LEN ? 5
        : t >= SIM_PRESS && t < SIM_PRESS + PRESS_LEN ? 2
        : t >= GEN_PRESS && t < GEN_PRESS + PRESS_LEN ? 0
        : -1;
      const wraps = [genWrapRef.current, simWrapRef.current, aiWrapRef.current];
      const kinds = [0, 2, 5];
      wraps.forEach((w, i) => {
        if (!w) return;
        const on = pressKind === kinds[i];
        w.style.transform = on ? 'scale(0.94)' : 'scale(1)';
        w.style.filter = on ? 'brightness(0.92)' : 'none';
      });

      /* Route draws across its beat, then holds — never rewinds in view. */
      routeRef.current = t < SIM_PRESS ? 0 : t > SIM_PRESS + 4 ? 1 : easeInOutCubic((t - SIM_PRESS) / 4);

      /* One authored cursor: measures the real button, presses on it. */
      let target: { x: number; y: number } | null = null;
      if (t >= 2.6 && t < GEN_PRESS + PRESS_LEN) target = center(genWrapRef.current?.querySelector('button') ?? null);
      else if (t >= SIM_BEAT + 0.6 && t < SIM_PRESS + PRESS_LEN) target = center(simWrapRef.current?.querySelector('button') ?? null);
      else if (t >= COMPARE_END + 0.8 && t < AI_PRESS + PRESS_LEN) target = center(aiWrapRef.current?.querySelector('button') ?? null);
      if (!target && stageRef.current) {
        const r = stageRef.current.getBoundingClientRect();
        target = { x: r.width - 120, y: r.height - 110 };
      }
      if (target && cursorRef.current) {
        const p = cursorPos.current;
        p.x += (target.x - p.x) * 0.18;
        p.y += (target.y - p.y) * 0.18;
        cursorRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${pressing ? 0.86 : 1})`;
        cursorRef.current.style.opacity = t < 1.4 ? String(clamp01((t - 0.6) / 0.8)) : '1';
      }
      if (dimRef.current) dimRef.current.style.opacity = t >= DIM_T0 ? String(clamp01((t - DIM_T0) / 0.8)) : '0';
      if (barRef.current) barRef.current.style.transform = `scaleX(${t / TOTAL})`;

      if (now - lastUi > 120) {
        lastUi = now;
        if (b !== lastBeat) {
          lastBeat = b;
          setBeat(b);
        }
        if (loopN !== lastLoop) {
          lastLoop = loopN;
          setLoop(loopN);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!data.base.results || !baseBest) {
    return (
      <div className="shot-page">
        <div className="shot-inner">
          <StageNav />
          <p>Simulation unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shot-page">
      <style>{`
        .film-scene { position: absolute; inset: 0; transition: opacity .45s ease, transform .45s ease; }
        .film-stage { height: 580px; }
        @media (max-width: 640px) { .film-stage { height: 640px; } }
        @keyframes film-taro-in { 0% { opacity: 0; transform: translateY(-30px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
        .film-taro-ch { opacity: 0; animation: film-taro-in .8s cubic-bezier(.2,.9,.3,1) forwards; }
        @keyframes film-taro-tag { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .film-taro-tag { opacity: 0; animation: film-taro-tag .55s cubic-bezier(.22,1,.36,1) .55s forwards; }
      `}</style>
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">08 · The film</div>
          <h1 className="shot-title">Press Generate. Watch it think.</h1>
          <p className="shot-sub">
            Configure → four warehouses → Simulate → route → ranked → experiment → Taro.
            Cuts land on the press, never after it — a 28-second loop.
          </p>
        </div>

        <div ref={stageRef} className="shot-frame film-stage">
          {/* Beat rail */}
          <div className="absolute inset-x-0 top-0 z-20">
            <div ref={barRef} className="h-0.5 origin-left bg-primary" style={{ transform: 'scaleX(0)' }} />
            <div className="flex items-center gap-1.5 px-4 pt-2.5">
              {BEATS.map((x, i) => (
                <span
                  key={x.k}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                    i === beat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {x.k} · {x.label}
                </span>
              ))}
            </div>
          </div>

          {/* 01 — /1 Configure: the real config tab + the real Generate button */}
          <div ref={(n) => { sceneRefs.current[0] = n; }} className="film-scene" aria-hidden={beat !== 0}>
            <div className="grid h-full gap-3.5 p-4 pt-12 lg:grid-cols-[320px_1fr]">
              <div className="overflow-hidden rounded-xl border border-border-default">
                <ConfigTab configuration={data.base.configuration} onEdit={noop} />
              </div>
              <div className="flex flex-col justify-center rounded-xl border border-border-default bg-muted/20 p-8">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Layout pipeline</div>
                <div className="mt-1 text-xl font-bold text-foreground">Tune it, then generate the building.</div>
                <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  Geometry, inventory and placement from the real config — {DEMO_ORDERS} orders,{' '}
                  {DEMO_WORKERS} workers waiting downstream.
                </p>
                <span ref={genWrapRef} data-cursor="pointer" className="mt-5 inline-flex transition-transform duration-150" style={{ transition: 'transform .15s ease, filter .15s ease' }}>
                  <LoadingButton tone="primary" pendingLabel="Generating…" onAction={async () => {}}>
                    Generate Warehouse
                  </LoadingButton>
                </span>
              </div>
            </div>
          </div>

          {/* 02 — /6 Four warehouses, shells only */}
          <div ref={(n) => { sceneRefs.current[1] = n; }} className="film-scene" aria-hidden={beat !== 1}>
            <div className="grid h-full grid-cols-2 gap-3.5 p-4 pt-12">
              {data.all.map((w) => (
                <div key={w.name} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border-default">
                  <div className="relative min-h-0 flex-1">
                    <WarehouseSvgRenderer
                      warehouseId={`film8-${w.name}`}
                      warehouse={w.warehouse}
                      onWarehouseChange={noop}
                      selectedTool="select"
                      activeRoute={null}
                      animationProgressRef={stillRef}
                      zVisualizationMode="all"
                      animationReplayId={0}
                      zoom={1}
                    />
                  </div>
                  <div className="border-t border-border-default px-3 py-2">
                    <div className="text-[13px] font-semibold text-foreground">{w.name}</div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {w.warehouse.width}×{w.warehouse.height} · {w.orders.length} orders staged
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 03 — /2 Simulate: hero canvas + the real Simulate button */}
          <div ref={(n) => { sceneRefs.current[2] = n; }} className="film-scene" aria-hidden={beat !== 2}>
            <div className="flex h-full flex-col p-4 pt-12">
              <div className="flex items-center gap-3 px-1 pb-3">
                <span className="text-sm font-semibold text-foreground">{data.base.name}</span>
                <span className="text-xs text-muted-foreground">
                  {data.base.orders.length} orders · {DEMO_WORKERS} workers
                </span>
                <span className="flex-1" />
                <span ref={simWrapRef} data-cursor="pointer" className="inline-flex" style={{ transition: 'transform .15s ease, filter .15s ease' }}>
                  <LoadingButton tone="primary" pendingLabel="Simulating…" onAction={async () => {}}>
                    Simulate
                  </LoadingButton>
                </span>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border-default">
                <WarehouseSvgRenderer
                  warehouseId="film8-sim"
                  warehouse={data.base.warehouse}
                  onWarehouseChange={noop}
                  selectedTool="select"
                  activeRoute={null}
                  animationProgressRef={stillRef}
                  zVisualizationMode="all"
                  animationReplayId={0}
                  zoom={1}
                />
              </div>
            </div>
          </div>

          {/* 04 — /3 The winning route draws and holds */}
          <div ref={(n) => { sceneRefs.current[3] = n; }} className="film-scene" aria-hidden={beat !== 3}>
            <div className="relative h-full p-4 pt-12">
              <span className="shot-tag">
                {data.base.name} · <b>{baseBest.strategyName}</b> route
              </span>
              <div className="h-full overflow-hidden rounded-xl border border-border-default">
                <WarehouseSvgRenderer
                  warehouseId="film8-route"
                  warehouse={data.base.warehouse}
                  onWarehouseChange={noop}
                  selectedTool="select"
                  activeRoute={baseBest}
                  animationProgressRef={routeRef}
                  zVisualizationMode="all"
                  animationReplayId={0}
                  zoom={1}
                />
              </div>
            </div>
          </div>

          {/* 05 — /4 Ranked by travel distance */}
          <div ref={(n) => { sceneRefs.current[4] = n; }} className="film-scene" aria-hidden={beat !== 4}>
            <div className="mx-auto flex h-full max-w-xl flex-col justify-center p-4 pt-12">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Ranked by travel distance
              </div>
              <div className="space-y-2">
                {data.ranked.map(({ pipe, best }, i) => {
                  const leader = data.ranked[0].best.totalDistance;
                  const over = best.totalDistance - leader;
                  return (
                    <div key={pipe.name} className="flex items-center gap-2.5 rounded-xl border border-border-default bg-card px-4 py-3">
                      <span
                        className={
                          i === 0
                            ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                            : 'flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground'
                        }
                      >
                        {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{pipe.name}</span>
                      <span className="ml-auto text-sm font-bold tabular-nums text-foreground">
                        {best.totalDistance.toLocaleString()} m
                      </span>
                      {over > 0 && (
                        <span className="text-[11px] font-medium tabular-nums text-destructive">
                          +{Math.round((over / leader) * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 06 — /5 The AI card + its Generate press */}
          <div ref={(n) => { sceneRefs.current[5] = n; }} className="film-scene" aria-hidden={beat !== 5}>
            <div className="grid h-full items-start gap-3.5 p-4 pt-12 lg:grid-cols-[1fr_320px]">
              <div ref={aiRootRef} className="rounded-xl border border-border-default p-4">
                <AiSuggestion insights={data.insights} isRunning={false} onGenerate={async () => {}} />
              </div>
              <div className="rounded-xl border border-border-default p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next step</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {data.experiment ? data.experiment.name : 'Grow the experiment'}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {expBest ? `${expBest.strategyName} · ${expBest.totalDistance.toLocaleString()} m` : 'Simulated on press'}
                </div>
                <span ref={aiWrapRef} data-cursor="pointer" className="mt-3 inline-flex" style={{ transition: 'transform .15s ease, filter .15s ease' }}>
                  <LoadingButton tone="primary" pendingLabel="Generating…" onAction={async () => {}}>
                    Generate experiment
                  </LoadingButton>
                </span>
              </div>
            </div>
          </div>

          {/* 07 — /7 Taro lockup */}
          <div ref={(n) => { sceneRefs.current[6] = n; }} className="film-scene" aria-hidden={beat !== 6}>
            <div className="flex h-full items-center justify-center">
              <div key={reduced ? 'still' : loop} className="text-center">
                <div className="text-7xl font-bold tracking-tight text-foreground sm:text-8xl" aria-label="Taro">
                  {['T', 'a', 'r', 'o'].map((ch, i) => (
                    <span key={i} className="film-taro-ch inline-block" style={{ animationDelay: `${i * 75}ms` }}>
                      {ch}
                    </span>
                  ))}
                </div>
                <p className="film-taro-tag mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Warehouse Decision Lab
                </p>
              </div>
            </div>
          </div>

          {/* Seam cover for the loop reset */}
          <div ref={dimRef} className="pointer-events-none absolute inset-0 z-10 bg-background" style={{ opacity: 0 }} />

          {/* One authored cursor for the whole film */}
          {!reduced && (
            <span
              ref={cursorRef}
              aria-hidden
              className="shot-cursor pointer-events-none absolute left-0 top-0 z-20"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))', opacity: 0 }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22">
                <path
                  d="M5 3 L5 16 L10 12.5 L12.5 18 L14.8 17 L12.3 11.5 L17 11.5 Z"
                  fill="#111"
                  stroke="#fff"
                  strokeWidth="1.4"
                />
              </svg>
            </span>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Beat {BEATS[beat].k} · {BEATS[beat].label} — every warehouse above was generated and simulated live in your browser.
        </p>
      </div>
    </div>
  );
}
