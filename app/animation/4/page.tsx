'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { reconcile } from '@/lib/taro/corrector';
import { runSimulation } from '@/core/simulationEngine';
import type { SimulationResults, StrategyResult } from '@/lib/taro/types';
import { CELL_SIZE } from '@/lib/taro/constants';

/* Same four warehouses as /animation/3. */
const SHOWCASES: { name: string; config: WarehouseConfiguration }[] = [
  {
    name: 'Single',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 },
      inventory: { skuCount: 430, demandDistribution: 10, productAffinity: 10, storageFootprint: 88 },
      placement: { slottingBias: 10, categoryClustering: 10 },
    },
  },
  {
    name: 'Parallel',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 0 },
      inventory: { skuCount: 430, demandDistribution: 10, productAffinity: 10, storageFootprint: 88 },
      placement: { slottingBias: 10, categoryClustering: 10 },
    },
  },
  {
    name: 'Clustered',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 },
      inventory: { skuCount: 435, demandDistribution: 40, productAffinity: 80, storageFootprint: 88 },
      placement: { slottingBias: 40, categoryClustering: 85 },
    },
  },
  {
    name: 'Grand',
    config: {
      layout: { gridHeight: 24, rackCount: 12, aisleWidth: 1, crossAisleCount: 3 },
      inventory: { skuCount: 530, demandDistribution: 55, productAffinity: 50, storageFootprint: 72 },
      placement: { slottingBias: 65, categoryClustering: 60 },
    },
  },
];

const ORDER_COUNT = 50;
const AVG_ORDER_SIZE = 3;
const WORKERS = 5;

/* One continuous 0→100% journey — each warehouse carries one quarter of it. */
const TOTAL = 3;
const WIN_STARTS = [0, 0.6, 1.2, 1.8];
const WIN_DUR = 0.6;

function slotAt(t: number): { idx: number; progress: number } {
  let idx = 0;
  for (let k = 0; k < WIN_STARTS.length; k++) {
    if (t >= WIN_STARTS[k]) idx = k;
  }
  const start = WIN_STARTS[idx];
  const frac = t <= start + WIN_DUR ? (t - start) / WIN_DUR : 1;
  const progress = idx * 0.25 + 0.25 * Math.min(1, Math.max(0, frac));
  return { idx, progress };
}

type Built = {
  session: ReturnType<typeof generateWarehouseSession>;
  results: SimulationResults | null;
} | null;

export default function Animation4Page() {
  const [built, setBuilt] = useState<Built[]>([null, null, null, null]);
  const [readyCount, setReadyCount] = useState(0);
  const [time, setTime] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const animationProgressRef = useRef(0);
  const [replayId, setReplayId] = useState(0);
  const lastIdx = useRef(0);

  // Build all four warehouses + simulations once, yielding between each.
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      for (let i = 0; i < SHOWCASES.length; i++) {
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) return;
        let entry: Built = null;
        try {
          const session = generateWarehouseSession(SHOWCASES[i].config, ORDER_COUNT, AVG_ORDER_SIZE);
          let results: SimulationResults | null = null;
          try {
            const corrected = reconcile(session.warehouse, session.orders);
            results = runSimulation(corrected.warehouse, corrected.orders, WORKERS, {});
          } catch {
            results = null;
          }
          entry = { session, results };
        } catch {
          entry = null;
        }
        const done = entry;
        setBuilt((prev) => {
          const next = [...prev];
          next[i] = done;
          return next;
        });
        setReadyCount(i + 1);
      }
    };
    build();
    return () => {
      cancelled = true;
    };
  }, []);

  // Master clock — loops every 3s once everything is built.
  useEffect(() => {
    if (readyCount < SHOWCASES.length) return;
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
  }, [readyCount]);

  // Stage size — drives the fit scale.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = readyCount >= SHOWCASES.length && built.every(Boolean);
  const { idx, progress } = slotAt(time);
  if (idx !== lastIdx.current) {
    lastIdx.current = idx;
    setReplayId((id) => id + 1);
  }
  animationProgressRef.current = ready ? progress : 0;

  const entry = ready ? built[idx] : null;
  const results = entry?.results ?? null;
  const activeRoute: StrategyResult | null =
    results?.strategies.find((r) => r.strategy === results.bestStrategy) ??
    results?.strategies[0] ??
    null;

  const W = entry?.session.warehouse.width ?? 0;
  const H = entry?.session.warehouse.height ?? 0;
  const logicalW = W * CELL_SIZE;
  const logicalH = H * CELL_SIZE;
  const availW = Math.max(stage.w - 320 - 48, 1);
  const availH = Math.max(stage.h - 32 - 48, 1);
  const fitScale =
    logicalW > 0 && logicalH > 0 && stage.w > 0 && stage.h > 0
      ? Math.min(availW / logicalW, availH / logicalH, 1.5) * 0.8
      : 0.8;

  return (
    <div className="h-screen overflow-hidden bg-muted/20">
      <div ref={stageRef} className="relative flex h-full w-full items-center justify-center">
        {!ready || !entry ? (
          <p className="animate-pulse text-sm text-text-secondary">
            Preparing warehouses… {readyCount}/4
          </p>
        ) : (
          <div
            key={idx}
            className="flex flex-col shrink-0 border border-border rounded-md overflow-hidden pointer-events-none"
            style={{ transform: `scale(${fitScale})` }}
          >
            <div className="relative" style={{ width: logicalW, height: logicalH }}>
              <WarehouseSvgRenderer
                warehouseId={`a4-${idx}`}
                warehouse={entry.session.warehouse}
                onWarehouseChange={() => {}}
                selectedTool="select"
                activeRoute={activeRoute}
                animationProgressRef={animationProgressRef}
                zVisualizationMode="all"
                animationReplayId={replayId}
                zoom={fitScale}
              />
            </div>
          </div>
        )}
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
