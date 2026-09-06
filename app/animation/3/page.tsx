'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { reconcile } from '@/lib/taro/corrector';
import { runSimulation } from '@/core/simulationEngine';
import type { Order, SimulationResults, StrategyResult, Warehouse } from '@/lib/taro/types';
import { CELL_SIZE } from '@/lib/taro/constants';

/* ── Four distinct warehouses ───────────────────────────────── */
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

/* Drop every order rooted in the left end (left fifth) — their excursions
   stretch the route across the floorplan. Warehouse 2 only. */
function dropLeftEndOrders(warehouse: Warehouse, orders: Order[]): Order[] {
  const skuX = new Map<string, number>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const loc of cell.locations) {
        const prev = skuX.get(loc.sku);
        if (prev === undefined || loc.x < prev) skuX.set(loc.sku, loc.x);
      }
    }
  }
  const edge = warehouse.width * 0.2;
  return orders.filter((o) => {
    let m = Infinity;
    for (const it of o.items) {
      const x = skuX.get(it.skuId);
      if (x !== undefined) m = Math.min(m, x);
    }
    return m >= edge;
  });
}
/** Same baseline as the main app's strategy replay. */
const REPLAY_MS = 3000;

type Session = ReturnType<typeof generateWarehouseSession>;

export default function Animation3Page() {
  const [active, setActive] = useState(0);
  const [sessions, setSessions] = useState<(Session | null)[]>([null, null, null, null]);
  const [sim, setSim] = useState<{ idx: number; results: SimulationResults } | null>(null);
  const [replayId, setReplayId] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  // Route playback — read by the renderer at 60fps, exactly like the main app.
  const animationProgressRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const go = (next: number) =>
    setActive((next + SHOWCASES.length) % SHOWCASES.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(active + 1);
      else if (e.key === 'ArrowLeft') go(active - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Stage size — drives the fit-to-viewport scale.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Generate the active warehouse lazily, once each.
  useEffect(() => {
    if (sessions[active]) return;
    const t = setTimeout(() => {
      const raw = generateWarehouseSession(SHOWCASES[active].config, ORDER_COUNT, AVG_ORDER_SIZE);
      // Warehouse 2 only: prune the lone left-extreme order.
      const s =
        active === 1
          ? { ...raw, orders: dropLeftEndOrders(raw.warehouse, raw.orders) }
          : raw;
      setSessions((prev) => {
        if (prev[active]) return prev;
        const next = [...prev];
        next[active] = s;
        return next;
      });
    }, 30);
    return () => clearTimeout(t);
  }, [active, sessions]);

  // Auto-run the simulation on arrival, then play the winning route.
  useEffect(() => {
    const s = sessions[active];
    if (!s) {
      setSim(null);
      return;
    }
    try {
      const corrected = reconcile(s.warehouse, s.orders);
      const results = runSimulation(corrected.warehouse, corrected.orders, WORKERS, {});
      setSim({ idx: active, results });

      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationProgressRef.current = 0;
      setReplayId((id) => id + 1);
      let lastTime: number | null = null;
      let elapsed = 0;
      const animate = (now: number) => {
        const delta = lastTime !== null ? now - lastTime : 0;
        lastTime = now;
        elapsed += delta;
        animationProgressRef.current = Math.min(elapsed / REPLAY_MS, 1);
        if (animationProgressRef.current < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    } catch {
      setSim(null);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [active, sessions]);

  const session = sessions[active];
  const results = sim?.idx === active ? sim.results : null;
  const activeRoute: StrategyResult | null =
    results?.strategies.find((r) => r.strategy === results.bestStrategy) ??
    results?.strategies[0] ??
    null;

  const W = session?.warehouse.width ?? 0;
  const H = session?.warehouse.height ?? 0;
  const logicalW = W * CELL_SIZE;
  const logicalH = H * CELL_SIZE;
  // Same size as the main page: its canvas is the viewport minus the 320px
  // sidebar, run through the identical fit formula (48px pads, 32px header,
  // 1.5x upscale cap from multi-warehouse-scroll).
  const availW = Math.max(stage.w - 320 - 48, 1);
  const availH = Math.max(stage.h - 32 - 48, 1);
  const fitScale =
    logicalW > 0 && logicalH > 0 && stage.w > 0 && stage.h > 0
      ? Math.min(availW / logicalW, availH / logicalH, 1.5) * 0.8
      : 0.8;

  return (
    <div className="h-screen overflow-hidden bg-muted/20">
      <div ref={stageRef} className="relative flex h-full w-full items-center justify-center">
        {!session ? (
          <p className="animate-pulse text-sm text-text-secondary">Preparing warehouse…</p>
        ) : (
          <div className="flex flex-col items-center">
            {/* The exact card from the main app, scaled as one unit. */}
            <div
              className="flex flex-col shrink-0 border border-border rounded-md overflow-hidden pointer-events-none"
              style={{ transform: `scale(${fitScale})` }}
            >
              <div className="relative" style={{ width: logicalW, height: logicalH }}> 
                <WarehouseSvgRenderer
                  warehouseId={`a3-${active}`}
                  warehouse={session.warehouse}
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
