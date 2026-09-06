'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { reconcile } from '@/lib/taro/corrector';
import { runSimulation } from '@/core/simulationEngine';
import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';

/* Same warehouses as /animation/3+4. */
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
    name: 'Double',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 2 },
      inventory: { skuCount: 420, demandDistribution: 70, productAffinity: 30, storageFootprint: 82 },
      placement: { slottingBias: 80, categoryClustering: 30 },
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
const TOTAL = 4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

/* Same metric defs as the real compare screen (minus Efficiency). */
const METRIC_DEFS = [
  { key: 'time', label: 'Est. Time', pick: (r: StrategyResult) => r.estimatedTime, format: (n: number) => `${fmtNumber(n)} min` },
  { key: 'util', label: 'Worker Util.', pick: (r: StrategyResult) => r.workerUtilization, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'cost', label: 'Cost / Order', pick: (r: StrategyResult) => r.costPerOrder, format: (n: number) => `$${fmtNumber(n, 2)}` },
  { key: 'orders', label: 'Orders Done', pick: (r: StrategyResult) => r.ordersCompleted, format: (n: number) => `${fmtNumber(n, 0)}` },
];

function bestOf(byStrategy: Record<StrategyType, StrategyResult>): StrategyResult | undefined {
  return Object.values(byStrategy)
    .filter(Boolean)
    .sort((a, b) => a.totalDistance - b.totalDistance)[0];
}

type Built = { name: string; results: SimulationResults } | null;

const VARIANTS = [
  { n: 1, label: 'Count-up' },
  { n: 2, label: 'Column race' },
  { n: 3, label: 'Bar race' },
  { n: 4, label: 'Row cascade' },
  { n: 5, label: 'Trophy finale' },
];

export default function Animation5Page() {
  const [built, setBuilt] = useState<Built[]>([null, null, null, null]);
  const [readyCount, setReadyCount] = useState(0);
  const [time, setTime] = useState(0);
  const [variant, setVariant] = useState(1);

  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const replay = (v?: number) => {
    if (v !== undefined) setVariant(v);
    last.current = null;
    setTime(0);
    setPlaying(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'r') replay();
      else if (['1', '2', '3', '4', '5'].includes(k)) replay(Number(k));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Build all four + simulate once.
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      for (let i = 0; i < SHOWCASES.length; i++) {
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) return;
        let entry: Built = null;
        try {
          const s = generateWarehouseSession(SHOWCASES[i].config, ORDER_COUNT, AVG_ORDER_SIZE);
          const corrected = reconcile(s.warehouse, s.orders);
          entry = { name: SHOWCASES[i].name, results: runSimulation(corrected.warehouse, corrected.orders, WORKERS, {}) };
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

  // Master clock — plays once per R.
  useEffect(() => {
    if (readyCount < SHOWCASES.length) return;
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (playingRef.current) {
        setTime((t) => {
          const nt = t + dt;
          if (nt >= TOTAL) {
            setPlaying(false);
            return TOTAL;
          }
          return nt;
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
  }, [readyCount]);

  const ready = readyCount >= SHOWCASES.length && built.every(Boolean);
  const cols = (built.filter(Boolean) as NonNullable<Built>[]).map((b) => ({
    name: b.name,
    byStrategy: Object.fromEntries(b.results.strategies.map((s) => [s.strategy, s])) as Record<StrategyType, StrategyResult>,
  }));
  const base = cols[0]?.byStrategy;
  const rankDist = cols
    .map((col) => ({ col, dist: bestOf(col.byStrategy)?.totalDistance ?? Infinity }))
    .sort((a, b) => a.dist - b.dist);
  const maxDist = Math.max(1, ...rankDist.map((r) => r.dist));

  /* ── Per-variant presentation helpers ── */
  // Column entrance (V2): worst slides in first, winner last.
  const colIn = (rank: number) => {
    if (variant !== 2) return {};
    const at = 0.3 + (rankDist.length - 1 - rank) * 0.4;
    const p = easeOutCubic(clamp01((time - at) / 0.45));
    return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
  };
  // Row entrance (V4): top rows first.
  const rowIn = (i: number) => {
    if (variant !== 4) return {};
    const p = easeOutCubic(clamp01((time - (0.3 + i * 0.35)) / 0.4));
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px)` };
  };
  // Count-up numbers (V1).
  const countFmt = (m: (typeof METRIC_DEFS)[number], v: number) => {
    if (variant !== 1) return m.format(v);
    const p = easeInOutCubic(clamp01((time - 0.3) / 2));
    return m.format(v * p);
  };
  const distFmt = (v: number) => {
    if (variant !== 1) return `${fmtNumber(v)} m`;
    const p = easeInOutCubic(clamp01((time - 0.3) / 2));
    return `${fmtNumber(v * p)} m`;
  };
  // Trophy pop (V1 late, V2 with winner, V5 drop).
  const trophyStyle = (rank: number): React.CSSProperties => {
    if (rank !== 0) return {};
    if (variant === 1) {
      const p = clamp01((time - 2.3) / 0.5);
      return p <= 0 ? { opacity: 0, transform: 'scale(0.4)' } : { opacity: 1, transform: `scale(${easeOutBack(p)})` };
    }
    if (variant === 5) {
      const p = easeOutCubic(clamp01((time - 1.5) / 0.5));
      return { opacity: p, transform: `translateY(${(1 - p) * -26}px)` };
    }
    return colIn(rank);
  };
  // Deltas visibility.
  const deltaStyle = (i: number): React.CSSProperties => {
    if (variant === 1) return { opacity: clamp01((time - 2.3) / 0.4) };
    if (variant === 4) return { opacity: clamp01((time - (0.3 + i * 0.35 + 0.25)) / 0.3) };
    if (variant === 5) return { opacity: clamp01((time - 0.8) / 0.5) };
    return {};
  };
  // Bar race widths (V3).
  const barW = (rank: number, dist: number) => {
    if (variant !== 3) return '100%';
    const at = 0.3 + rank * 0.22;
    return `${(dist / maxDist) * 100 * easeOutCubic(clamp01((time - at) / 0.8))}%`;
  };
  const restFade = variant === 3 ? { opacity: clamp01((time - 2.4) / 0.5) } : {};
  // V5: everything together, then winner sweep.
  const v5col = variant === 5 ? { opacity: easeOutCubic(clamp01((time - 0.2) / 0.6)) } : {};
  const sweep = variant === 5 ? clamp01((time - 1.1) / 0.5) * (1 - clamp01((time - 2.2) / 0.6)) : 0;

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="w-full max-w-4xl">
        {!ready ? (
            <p className="animate-pulse py-10 text-center text-sm text-text-secondary">
              Running simulations… {readyCount}/4
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border" style={variant === 4 ? rowIn(0) : undefined}>
                      <th className="h-11 whitespace-nowrap border-r border-border/60 px-3 pr-4 text-left align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Metric
                      </th>
                      {rankDist.map(({ col }, rank) => (
                        <th
                          key={col.name}
                          style={variant === 4 ? rowIn(0) : { ...colIn(rank), ...v5col }}
                          className={cn('h-11 whitespace-nowrap px-3 text-left align-middle', rank === 0 && 'bg-primary/5')}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              style={trophyStyle(rank)}
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                                rank === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {rank === 0 ? <Trophy className="size-3" /> : rank + 1}
                            </span>
                            <span className="text-sm font-semibold text-foreground">{col.name}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/60" style={variant === 4 ? rowIn(1) : undefined}>
                      <td className="whitespace-nowrap border-r border-border/60 px-3 py-3 pr-4 align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Distance
                      </td>
                      {rankDist.map(({ col, dist }, rank) => (
                        <td key={col.name} style={{ ...colIn(rank), ...v5col }} className={cn('whitespace-nowrap px-3 py-3 align-middle', rank === 0 && 'bg-primary/5')}>
                          <span className="text-sm font-bold tabular-nums text-foreground">{distFmt(dist)}</span>
                          {variant === 3 && (
                            <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-primary" style={{ width: barW(rank, dist) }} />
                            </span>
                          )}
                          {rank === 0 && sweep > 0 && (
                            <span className="mt-1 block h-0.5 w-28 overflow-hidden rounded-full bg-primary/20">
                              <span className="block h-full bg-primary" style={{ width: `${sweep * 100}%` }} />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    {METRIC_DEFS.map((m, mi) => (
                      <tr key={m.key} style={{ ...restFade, ...(variant === 4 ? rowIn(mi + 2) : undefined) }} className="border-b border-border/60 last:border-0">
                        <td className="whitespace-nowrap border-r border-border/60 px-3 py-3 pr-4 align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.label}
                        </td>
                        {rankDist.map(({ col }, rank) => {
                          const best = bestOf(col.byStrategy)!;
                          const isBase = col.name === cols[0]?.name;
                          const b = isBase ? undefined : base?.[best.strategy];
                          const baseVal = b ? m.pick(b) : undefined;
                          const cur = m.pick(best);
                          const diff = baseVal !== undefined ? cur - baseVal : 0;
                          const pct = baseVal ? (diff / Math.abs(baseVal)) * 100 : 0;
                          return (
                            <td key={col.name} style={{ ...colIn(rank), ...v5col }} className={cn('whitespace-nowrap px-3 py-3 align-middle tabular-nums', rank === 0 && 'bg-primary/5')}>
                              <span className="font-medium text-foreground">{countFmt(m, cur)}</span>
                              {baseVal !== undefined && Math.abs(diff) > 1e-9 && (
                                <span
                                  style={deltaStyle(mi)}
                                  className={cn('ml-1 text-[10px] font-medium', diff < 0 ? 'text-positive' : 'text-destructive')}
                                >
                                  {diff < 0 ? '▼' : '▲'}{fmtNumber(Math.abs(pct), 0)}%
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>

      {/* vartest switcher — keys 1-5, R replay */}
      <div className="fixed bottom-4 right-4 z-[110] rounded-2xl border border-border bg-card p-2 shadow-lg">
        <div className="flex items-center gap-1">
          {VARIANTS.map((o) => (
            <button
              key={o.n}
              onClick={() => replay(o.n)}
              title={`${o.label} — press ${o.n}`}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                variant === o.n ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {o.n} · {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] text-text-secondary">
          {playing ? 'playing…' : 'R replay · 1–5 variant'}
        </p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
