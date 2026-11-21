'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { SimulationPanel } from '@/components/taro/simulation-panel';
import { LayoutConfigOverlay, type LayoutConfig } from '@/components/taro/layout-config-overlay';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { toWarehouseInsight } from '@/lib/taro/experiment-recommendation';
import { validateItems } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import { LoadingButton } from '@/components/interior/loading-button';
import { StageNav } from '../nav';
import {
  BASE_CONFIG,
  DEMO_AVG_SIZE,
  DEMO_ORDERS,
  DEMO_WORKERS,
  VARIANT_DEMAND,
  VARIANT_WIDE,
  bestOf,
  configFromOverlay,
  generateOnly,
  runPipeline,
  simulateOnly,
  type PipelineResult,
} from '../run';

const noop = () => {};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* Master clock (seconds). */
const TOTAL = 34;
const T_SPLASH_END = 2.6;
const T_TAB = 4.6;
const T_GENERATE = 7.4;
const T_CANVAS = 9.6;
const T_SIM = 12.4;
const T_DRAW_END = 17;
const T_COMPARE = 19;
const T_AI = 24;
const T_AIGEN = 25.6;
const T_NOCON = 27.6;
const T_DIM = 32.6;

type Phase = 'splash' | 'config' | 'canvas' | 'compare' | 'ai';

function phaseAt(t: number): Phase {
  if (t < T_SPLASH_END) return 'splash';
  if (t < T_CANVAS) return 'config';
  if (t < T_COMPARE) return 'canvas';
  if (t < T_AI) return 'compare';
  return 'ai';
}

function clickText(root: HTMLElement | null, re: RegExp): boolean {
  if (!root) return false;
  const btns = root.querySelectorAll('button');
  for (const b of btns) {
    if (re.test(b.textContent ?? '') && !b.disabled) {
      (b as HTMLButtonElement).click();
      return true;
    }
  }
  return false;
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function findButton(root: HTMLElement | null, re: RegExp): Element | null {
  if (!root) return null;
  const btns = root.querySelectorAll('button');
  for (const b of btns) {
    if (re.test(b.textContent ?? '')) return b;
  }
  return null;
}

/** 7 — The whole flow as a film: configure → generate → simulate → compare → AI. */
export default function StageShow7() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const simTargetRef = useRef<HTMLSpanElement | null>(null);
  const aiRootRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const cursorPos = useRef({ x: -100, y: -100 });
  const firedRef = useRef<{ loop: number; keys: Set<string> }>({ loop: -1, keys: new Set() });
  const progressRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('splash');
  const [generating, setGenerating] = useState(false);
  const [base, setBase] = useState<(Omit<PipelineResult, 'results'> & { results: PipelineResult['results'] }) | null>(null);
  const [variants, setVariants] = useState<PipelineResult[]>([]);
  const [experiment, setExperiment] = useState<(PipelineResult & { axis: string }) | null>(null);
  const [pressed, setPressed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  /* The overlay's real Apply — runs the live pipeline. */
  const handleApply = (cfg: LayoutConfig) => {
    const configuration = configFromOverlay(cfg);
    setBase({ ...generateOnly(configuration, 'Showcase warehouse'), results: null });
    setGenerating(true);
  };

  /* The toolbar Simulate — runs the live simulation. */
  const handleSimulate = () => {
    setBase((prev) => {
      if (!prev || prev.results) return prev;
      return { ...prev, results: simulateOnly(prev.warehouse, prev.orders) };
    });
  };

  const readiness = useMemo(
    () =>
      base
        ? evaluateReadiness(base.warehouse, base.orders, 'all', validateItems(base.orders, base.warehouse))
        : null,
    [base],
  );

  const ranked = useMemo(() => {
    const all = [...(base?.results ? [{ name: base.name, results: base.results }] : []), ...variants.filter((v) => v.results)];
    return all
      .map((w) => ({ name: w.name, best: bestOf(w.results)! }))
      .sort((a, b) => a.best.totalDistance - b.best.totalDistance);
  }, [base, variants]);

  const insights = useMemo(() => {
    const all: { name: string; configuration: PipelineResult['configuration']; results: NonNullable<PipelineResult['results']> }[] = [];
    if (base?.results) all.push({ name: base.name, configuration: base.configuration, results: base.results });
    for (const v of variants) if (v.results) all.push({ name: v.name, configuration: v.configuration, results: v.results });
    return all.map((w) => toWarehouseInsight(w.name, w.name, w.configuration, w.results));
  }, [base, variants]);

  const baseBest = bestOf(base?.results ?? null);

  /* Master loop. */
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const b = runPipeline(BASE_CONFIG, 'Showcase warehouse');
      const vs = [runPipeline(VARIANT_WIDE, 'Wide cross-aisles'), runPipeline(VARIANT_DEMAND, 'Demand slotting')];
      setBase(b);
      setVariants(vs);
      progressRef.current = 1;
      setProgress(1);
      setPhase('ai');
      setReduced(true);
      return;
    }
    let raf = 0;
    let lastUi = 0;
    let lastPhase: Phase = 'splash';
    const start = performance.now();

    const fire = (loop: number, key: string, at: number, t: number, fn: () => void) => {
      if (t >= at && !firedRef.current.keys.has(key)) {
        firedRef.current.keys.add(key);
        fn();
      }
      void loop;
    };

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const loop = Math.floor(elapsed / TOTAL);
      const t = elapsed - loop * TOTAL;
      if (firedRef.current.loop !== loop) {
        firedRef.current = { loop, keys: new Set() };
        setVariants([]);
        setExperiment(null);
        setGenerating(false);
      }

      /* Fired events — the cursor presses real controls. */
      fire(loop, 'tab', T_TAB, t, () => clickText(overlayRootRef.current, /Placement/));
      fire(loop, 'gen', T_GENERATE, t, () => clickText(overlayRootRef.current, /Generate Warehouse/));
      fire(loop, 'sim', T_SIM, t, () => handleSimulate());
      fire(loop, 'variants', T_COMPARE, t, () => {
        setVariants([
          runPipeline(VARIANT_WIDE, 'Wide cross-aisles'),
          runPipeline(VARIANT_DEMAND, 'Demand slotting'),
        ]);
      });
      fire(loop, 'aigen', T_AIGEN, t, () => clickText(aiRootRef.current, /Generate experiment/));
      fire(loop, 'nocon', T_NOCON, t, () => clickText(aiRootRef.current, /No constraints/));

      /* Cursor target for this beat. */
      let target: { x: number; y: number } | null = null;
      if (t >= 3.4 && t < 5.4) {
        const el = findButton(overlayRootRef.current, /Placement/);
        if (el) target = center(el);
      } else if (t >= 5.4 && t < 8.4) {
        const el = findButton(overlayRootRef.current, /Generate Warehouse/);
        if (el) target = center(el);
      } else if (t >= 11.2 && t < 13.2 && simTargetRef.current) {
        target = center(simTargetRef.current);
      } else if (t >= 24.4 && t < 26.4) {
        const el = findButton(aiRootRef.current, /Generate experiment/);
        if (el) target = center(el);
      } else if (t >= 26.4 && t < 28.4) {
        const el = findButton(aiRootRef.current, /No constraints/);
        if (el) target = center(el);
      }
      if (!target && stageRef.current) {
        const r = stageRef.current.getBoundingClientRect();
        target = { x: r.right - 140, y: r.top + 320 };
      }
      if (target && cursorRef.current) {
        const p = cursorPos.current;
        const k = 0.16;
        p.x += (target.x - p.x) * k;
        p.y += (target.y - p.y) * k;
        const pressWindows = [
          [T_TAB, T_TAB + 0.35],
          [T_GENERATE, T_GENERATE + 0.35],
          [T_SIM, T_SIM + 0.35],
          [T_AIGEN, T_AIGEN + 0.35],
          [T_NOCON, T_NOCON + 0.35],
        ];
        const isPress = pressWindows.some(([a, b]) => t >= a && t < b);
        cursorRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${isPress ? 0.86 : 1})`;
        if (now - lastUi > 120) {
          lastUi = now;
          setPressed(isPress);
        }
      }
      if (dimRef.current) {
        dimRef.current.style.opacity = t >= T_DIM ? String(clamp01((t - T_DIM) / 0.8)) : '0';
      }

      const p = t < T_SIM ? 0 : t > T_DRAW_END ? 1 : (t - T_SIM) / (T_DRAW_END - T_SIM);
      progressRef.current = p;

      const ph = phaseAt(t);
      if (ph !== lastPhase) {
        lastPhase = ph;
        setPhase(ph);
        if (ph === 'canvas') setGenerating(false);
      }
      if (now - lastUi > 200) {
        lastUi = now;
        setProgress(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMain = phase === 'canvas';
  const showCompare = phase === 'compare';
  const showAi = phase === 'ai' || reduced;

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">07 · The flow, as a film</div>
          <h1 className="shot-title">From empty screen to experiment in 34 seconds.</h1>
          <p className="shot-sub">
            One looping run of the real pipeline — the cursor configures, generates,
            simulates, ranks and grows an experiment. Everything below actually ran.
          </p>
        </div>

        <div ref={stageRef} className="shot-frame relative" style={{ height: 600 }}>
          {/* Splash */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-background transition-opacity duration-500"
            style={{ opacity: phase === 'splash' ? 1 : 0, pointerEvents: 'none' }}
          >
            <div className="text-6xl font-bold tracking-tight text-foreground">Taro</div>
            <p className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Warehouse Decision Lab
            </p>
          </div>

          {/* Canvas + panel */}
          <div
            className="absolute inset-0 flex-col transition-opacity duration-500"
            style={{ opacity: showMain ? 1 : 0, pointerEvents: showMain ? 'auto' : 'none', display: 'flex' }}
          >
            <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
              <span className="text-sm font-semibold text-foreground">{base?.name ?? 'Showcase warehouse'}</span>
              {base && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {base.orders.length} orders · {DEMO_WORKERS} workers
                </span>
              )}
              <span className="flex-1" />
              <span ref={simTargetRef} className="inline-flex">
                <LoadingButton tone="primary" pendingLabel="Simulating…" onAction={async () => handleSimulate()}>
                  Simulate
                </LoadingButton>
              </span>
            </div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_320px]">
              <div className="relative min-h-[320px]">
                {base && (
                  <WarehouseSvgRenderer
                    warehouseId="stage-7-base"
                    warehouse={base.warehouse}
                    onWarehouseChange={noop}
                    selectedTool="select"
                    activeRoute={baseBest}
                    animationProgressRef={progressRef}
                    zVisualizationMode="all"
                    animationReplayId={0}
                    zoom={1}
                  />
                )}
              </div>
              <div className="border-t border-border-default lg:border-l lg:border-t-0">
                {base && (
                  <SimulationPanel
                    embedded
                    flowStep={base.results ? 'simulation' : 'setup'}
                    orders={base.orders}
                    onGenerateOrders={noop}
                    orderCount={DEMO_ORDERS}
                    avgOrderSize={DEMO_AVG_SIZE}
                    onOrderCountChange={noop}
                    onAvgOrderSizeChange={noop}
                    warehouse={base.warehouse}
                    results={base.results}
                    readiness={readiness ?? undefined}
                    isSimulating={false}
                    activeStrategy={base.results?.bestStrategy ?? null}
                    onStrategySelect={noop}
                    animationProgress={progress}
                    workerCount={DEMO_WORKERS}
                    onWorkerCountChange={noop}
                    executionPlan={null}
                    onSimulate={handleSimulate}
                    onFlowStepChange={noop}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Compare */}
          <div
            className="absolute inset-0 flex-col justify-center gap-2 p-8 transition-opacity duration-500"
            style={{ opacity: showCompare ? 1 : 0, pointerEvents: 'none', display: 'flex' }}
          >
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ranked by travel distance — live runs
            </div>
            {ranked.map(({ name, best }, i) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-border-default bg-surface px-4 py-3">
                <span
                  className={
                    i === 0
                      ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                      : 'flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground'
                  }
                >
                  {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-sm font-semibold text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">{best.strategyName}</span>
                <span className="ml-auto text-sm font-bold tabular-nums text-foreground">
                  {best.totalDistance.toLocaleString()} m
                </span>
              </div>
            ))}
          </div>

          {/* AI + experiment */}
          <div
            className="absolute inset-0 grid-cols-[1fr_360px] gap-3.5 overflow-y-auto p-4 transition-opacity duration-500 lg:grid"
            style={{ opacity: showAi ? 1 : 0, pointerEvents: showAi ? 'auto' : 'none', display: 'grid' }}
          >
            <div ref={aiRootRef}>
              <AiSuggestion
                insights={insights}
                isRunning={false}
                onGenerate={async (_constraints, recommendation) => {
                  setExperiment({
                    axis: recommendation.axis,
                    ...runPipeline(recommendation.configuration, `Experiment — ${recommendation.axis}`),
                  });
                }}
              />
            </div>
            <div className="rounded-xl border border-border-default bg-surface p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Experiment output
              </div>
              {experiment && experiment.results && bestOf(experiment.results) ? (
                <div>
                  <div className="h-64 overflow-hidden rounded-lg border border-border-default">
                    <WarehouseSvgRenderer
                      warehouseId="stage-7-experiment"
                      warehouse={experiment.warehouse}
                      onWarehouseChange={noop}
                      selectedTool="select"
                      activeRoute={bestOf(experiment.results)}
                      animationProgressRef={progressRef}
                      zVisualizationMode="all"
                      animationReplayId={0}
                      zoom={1}
                    />
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{experiment.name}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {bestOf(experiment.results)!.totalDistance.toLocaleString()} m ·{' '}
                    {bestOf(experiment.results)!.estimatedTime} min
                  </div>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  The recommendation lands here, generated and simulated.
                </p>
              )}
            </div>
          </div>

          {/* Loop-seam cover */}
          <div ref={dimRef} className="pointer-events-none absolute inset-0 bg-background" style={{ opacity: 0 }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Splash → configure → generate → simulate → rank → experiment. Loops every {TOTAL}s.
        </p>
      </div>

      {/* Real config overlay — full takeover, exactly like the app. */}
      {phase === 'config' && (
        <div ref={overlayRootRef}>
          <LayoutConfigOverlay onClose={noop} canClose={false} isGenerating={generating} onApply={handleApply} />
        </div>
      )}

      {/* Fixed cursor above everything, incl. the overlay. */}
      {!reduced && (
        <span
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[300]"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path
              d="M5 3 L5 16 L10 12.5 L12.5 18 L14.8 17 L12.3 11.5 L17 11.5 Z"
              fill={pressed ? '#4c5c2d' : '#111'}
              stroke="#fff"
              strokeWidth="1.4"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
