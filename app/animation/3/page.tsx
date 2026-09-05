'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { reconcile } from '@/lib/taro/corrector';
import { runSimulation } from '@/core/simulationEngine';
import type { SimulationResults, StrategyType } from '@/lib/taro/types';
import {
  SHELF_COLOR,
  WORKER_COLOR,
  GRID_COLOR,
  STRATEGY_COLORS,
  STRATEGY_NAMES,
} from '@/lib/taro/constants';

/* ── Four distinct warehouses ───────────────────────────────── */
interface Showcase {
  name: string;
  config: WarehouseConfiguration;
}

const SHOWCASES: Showcase[] = [
  {
    name: 'Parallel',
    config: {
      layout: { gridHeight: 10, rackCount: 6, aisleWidth: 1, crossAisleCount: 0 },
      inventory: { skuCount: 400, demandDistribution: 10, productAffinity: 10, storageFootprint: 20 },
      placement: { slottingBias: 10, categoryClustering: 10 },
    },
  },
  {
    name: 'Thoroughfare',
    config: {
      layout: { gridHeight: 12, rackCount: 8, aisleWidth: 1, crossAisleCount: 2 },
      inventory: { skuCount: 450, demandDistribution: 70, productAffinity: 30, storageFootprint: 30 },
      placement: { slottingBias: 80, categoryClustering: 30 },
    },
  },
  {
    name: 'Clustered',
    config: {
      layout: { gridHeight: 12, rackCount: 10, aisleWidth: 1, crossAisleCount: 1 },
      inventory: { skuCount: 450, demandDistribution: 40, productAffinity: 80, storageFootprint: 40 },
      placement: { slottingBias: 40, categoryClustering: 85 },
    },
  },
  {
    name: 'Grand',
    config: {
      layout: { gridHeight: 14, rackCount: 12, aisleWidth: 1, crossAisleCount: 3 },
      inventory: { skuCount: 500, demandDistribution: 55, productAffinity: 50, storageFootprint: 60 },
      placement: { slottingBias: 65, categoryClustering: 60 },
    },
  },
];

const ORDER_COUNT = 10;
const AVG_ORDER_SIZE = 3;
const WORKERS = 2;

type Session = ReturnType<typeof generateWarehouseSession>;

export default function Animation3Page() {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);
  const [sessions, setSessions] = useState<(Session | null)[]>([null, null, null, null]);
  const [sim, setSim] = useState<{ idx: number; results: SimulationResults } | null>(null);

  const go = (next: number, d: number) => {
    setDir(d);
    setActive((next + SHOWCASES.length) % SHOWCASES.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(active + 1, 1);
      else if (e.key === 'ArrowLeft') go(active - 1, -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Generate the active warehouse lazily, once each.
  useEffect(() => {
    if (sessions[active]) return;
    const t = setTimeout(() => {
      const s = generateWarehouseSession(SHOWCASES[active].config, ORDER_COUNT, AVG_ORDER_SIZE);
      setSessions((prev) => {
        if (prev[active]) return prev;
        const next = [...prev];
        next[active] = s;
        return next;
      });
    }, 30);
    return () => clearTimeout(t);
  }, [active, sessions]);

  // Auto-run the simulation on arrival.
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
    } catch {
      setSim(null);
    }
  }, [active, sessions]);

  const session = sessions[active];
  const results = sim?.idx === active ? sim.results : null;

  const grid = session?.warehouse.grid;
  const W = session?.warehouse.width ?? 0;
  const H = session?.warehouse.height ?? 0;
  const cell = W > 0 && H > 0 ? Math.max(4, Math.min(18, Math.floor(Math.min(460 / W, 300 / H)))) : 10;

  const bestRoute = useMemo(() => {
    if (!results) return null;
    const best = results.strategies.find((r) => r.strategy === results.bestStrategy) ?? results.strategies[0];
    if (!best || best.route.length === 0) return null;
    return { color: STRATEGY_COLORS[best.strategy as StrategyType] ?? '#111', points: best.route };
  }, [results]);

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <style>{`
        @keyframes a3-slide-l { from { opacity: 0; transform: translateX(48px); } to { opacity: 1; transform: none; } }
        @keyframes a3-slide-r { from { opacity: 0; transform: translateX(-48px); } to { opacity: 1; transform: none; } }
        @keyframes a3-draw { to { stroke-dashoffset: 0; } }
        .a3-route { stroke-dasharray: 1; stroke-dashoffset: 1; animation: a3-draw 1.6s ease-out 0.2s forwards; }
      `}</style>

      <div className="relative w-full max-w-xl">
        {/* Name + transfer */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => go(active - 1, -1)}
            aria-label="Previous warehouse"
            className="rounded-full border border-border bg-card p-2 text-text-secondary transition hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p key={active} className="text-lg font-semibold tracking-tight text-text-primary">
            {SHOWCASES[active].name}
          </p>
          <button
            onClick={() => go(active + 1, 1)}
            aria-label="Next warehouse"
            className="rounded-full border border-border bg-card p-2 text-text-secondary transition hover:text-text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Warehouse + simulation */}
        <div
          key={active}
          style={{ animation: dir >= 0 ? 'a3-slide-l 0.35s ease-out' : 'a3-slide-r 0.35s ease-out' }}
          className="rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/5"
        >
          {!session || !grid ? (
            <div className="flex h-64 items-center justify-center">
              <p className="animate-pulse text-sm text-text-secondary">Preparing warehouse…</p>
            </div>
          ) : (
            <div className="flex justify-center">
              <svg
                width={W * cell}
                height={H * cell}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`${SHOWCASES[active].name} warehouse layout`}
              >
                {grid.flatMap((row, y) =>
                  row.map((c, x) => {
                    if (c.type === 'shelf') {
                      return <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.12} fill={SHELF_COLOR} />;
                    }
                    if (c.type === 'worker-start') {
                      return <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.32} fill={WORKER_COLOR} />;
                    }
                    return (
                      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="none" stroke={GRID_COLOR} strokeWidth={0.03} />
                    );
                  })
                )}
                {bestRoute && (
                  <polyline
                    key={`route-${active}`}
                    points={bestRoute.points.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ')}
                    fill="none"
                    stroke={bestRoute.color}
                    strokeWidth={0.28}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    className="a3-route"
                  />
                )}
              </svg>
            </div>
          )}

          {/* Simulation results */}
          <div className="mt-3 space-y-1.5">
            {!results ? (
              <p className="animate-pulse py-2 text-center text-xs text-text-secondary">Simulating…</p>
            ) : (
              results.strategies.map((r) => {
                const isBest = r.strategy === results.bestStrategy;
                return (
                  <div
                    key={r.strategy}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      isBest ? 'border-primary/40 bg-accent-soft' : 'border-border bg-surface'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STRATEGY_COLORS[r.strategy as StrategyType] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                      {STRATEGY_NAMES[r.strategy as StrategyType] ?? r.strategyName}
                      {isBest && (
                        <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Best
                        </span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-text-secondary">
                      {r.estimatedTime.toFixed(1)} min
                    </span>
                    <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, Math.max(0, r.efficiency))}%` }}
                      />
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dots */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {SHOWCASES.map((s, i) => (
            <button
              key={s.name}
              onClick={() => go(i, i > active ? 1 : -1)}
              aria-label={`Go to ${s.name}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-text-secondary'
              }`}
            />
          ))}
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
