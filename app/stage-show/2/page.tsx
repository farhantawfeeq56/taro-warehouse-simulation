'use client';

import { useEffect, useRef, useState } from 'react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { SimulationPanel } from '@/components/taro/simulation-panel';
import { LoadingButton } from '@/components/interior/loading-button';
import { useDemoSession, DEMO_WORKER_COUNT } from '@/components/gallery/session';
import { StageNav } from '../nav';

const noop = () => {};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* Loop choreography — the cursor presses the real Simulate button. */
const TOTAL = 12;
const FLY_T0 = 1.0;
const FLY_T1 = 2.2;
const CLICK_T = 2.4;
const PRESS_MS = 350;
const DRAW_T0 = 2.4;
const DRAW_T1 = 6.4;
const BACK_T0 = 2.9;
const BACK_T1 = 4.2;
const DIM_T0 = 11.0;

/** 2 — One gesture: the cursor clicks Simulate and the winning route draws. */
export default function StageShow2() {
  const { base } = useDemoSession();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLSpanElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);
  const startRef = useRef(0);
  const [running, setRunning] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [progress, setProgress] = useState(0);

  const best = base.results?.strategies.find((s) => s.strategy === base.results!.bestStrategy) ?? null;

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      progressRef.current = 1;
      setProgress(1);
      setRunning(false);
      return;
    }
    let raf = 0;
    let lastUi = 0;
    startRef.current = performance.now();
    const tick = (now: number) => {
      let t = (now - startRef.current) / 1000;
      if (t >= TOTAL) {
        startRef.current = now;
        t = 0;
      }
      const wrap = wrapRef.current;
      const box = targetRef.current;
      if (wrap && box) {
        const wb = wrap.getBoundingClientRect();
        const bb = box.getBoundingClientRect();
        const click = {
          x: bb.left + bb.width * 0.72 - wb.left,
          y: bb.top + bb.height * 0.55 - wb.top,
        };
        const rest = {
          x: Math.min(click.x + 300, wb.width - 30),
          y: Math.min(click.y + 240, wb.height - 30),
        };
        let x = rest.x;
        let y = rest.y;
        if (t >= FLY_T0 && t < FLY_T1) {
          const k = easeInOutCubic((t - FLY_T0) / (FLY_T1 - FLY_T0));
          x = rest.x + (click.x - rest.x) * k;
          y = rest.y + (click.y - rest.y) * k;
        } else if (t >= FLY_T1 && t < BACK_T0) {
          x = click.x;
          y = click.y;
        } else if (t >= BACK_T0 && t < BACK_T1) {
          const k = easeInOutCubic((t - BACK_T0) / (BACK_T1 - BACK_T0));
          x = click.x + (rest.x - click.x) * k;
          y = click.y + (rest.y - click.y) * k;
        }
        if (cursorRef.current) {
          cursorRef.current.style.transform = `translate(${x}px, ${y}px) scale(${t >= CLICK_T && t * 1000 < CLICK_T * 1000 + PRESS_MS ? 0.86 : 1})`;
        }
        if (dimRef.current) {
          dimRef.current.style.opacity = t >= DIM_T0 ? String(clamp01((t - DIM_T0) / 0.8)) : '0';
        }
      }
      const p = t < DRAW_T0 ? 0 : t > DRAW_T1 ? 1 : easeInOutCubic((t - DRAW_T0) / (DRAW_T1 - DRAW_T0));
      progressRef.current = p;
      if (now - lastUi > 100) {
        lastUi = now;
        setPressed(t >= CLICK_T && t * 1000 < CLICK_T * 1000 + PRESS_MS);
        setProgress(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const restart = () => {
    startRef.current = performance.now();
    setRunning((r) => !r);
    setRunning(true);
  };

  if (!base.results || !best) {
    return (
      <div className="shot-page"><div className="shot-inner"><StageNav /><p>Simulation unavailable.</p></div></div>
    );
  }

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">02 · One gesture</div>
          <h1 className="shot-title">Press Simulate. Watch the winner draw.</h1>
          <p className="shot-sub">
            The real canvas, the real button, the real route — {best.strategyName} covers{' '}
            {best.totalDistance.toLocaleString()} m for {base.orders.length} orders.
          </p>
        </div>

        <div ref={wrapRef} className="shot-frame" style={{ minHeight: 560 }}>
          <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
            <span className="text-sm font-semibold text-foreground">{base.name}</span>
            <span className="text-xs text-muted-foreground">
              {base.orders.length} orders · {DEMO_WORKER_COUNT} workers
            </span>
            <span className="flex-1" />
            <span ref={targetRef} data-cursor="pointer" className="inline-flex">
              <LoadingButton tone="primary" pendingLabel="Simulating…" onAction={async () => restart()}>
                Simulate
              </LoadingButton>
            </span>
          </div>
          <div className="grid lg:grid-cols-[1fr_320px]">
            <div className="relative h-[420px] lg:h-[484px]">
              <WarehouseSvgRenderer
                warehouseId={base.id}
                warehouse={base.warehouse}
                onWarehouseChange={noop}
                selectedTool="select"
                activeRoute={best}
                animationProgressRef={progressRef}
                zVisualizationMode="all"
                animationReplayId={0}
                zoom={1}
              />
            </div>
            <div className="border-t border-border-default lg:border-l lg:border-t-0">
              <SimulationPanel
                embedded
                flowStep="simulation"
                orders={base.orders}
                onGenerateOrders={noop}
                orderCount={30}
                avgOrderSize={3}
                onOrderCountChange={noop}
                onAvgOrderSizeChange={noop}
                warehouse={base.warehouse}
                results={base.results}
                readiness={base.readiness}
                isSimulating={false}
                activeStrategy={base.results.bestStrategy}
                onStrategySelect={noop}
                animationProgress={progress}
                workerCount={DEMO_WORKER_COUNT}
                onWorkerCountChange={noop}
                executionPlan={null}
                onSimulate={noop}
                onFlowStepChange={noop}
              />
            </div>
          </div>

          {/* Seam cover for the loop reset */}
          <div ref={dimRef} className="pointer-events-none absolute inset-0 bg-background" style={{ opacity: 0 }} />

          {/* Authored cursor */}
          <span
            ref={cursorRef}
            aria-hidden
            className="shot-cursor pointer-events-none absolute left-0 top-0 z-10"
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
        </div>
      </div>
    </div>
  );
}
