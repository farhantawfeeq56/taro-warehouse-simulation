'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import type { WarehouseInsight } from '@/lib/taro/experiment-recommendation';
import { cn } from '@/lib/utils';

/* Baked table numbers — same run as /animation/5. Animation only. */
interface Baked {
  name: string;
  estimatedTime: number;
  totalDistance: number;
  workerUtilization: number;
  costPerOrder: number;
  ordersCompleted: number;
}

const DATA: Baked[] = [
  { name: 'Single', estimatedTime: 13.3, totalDistance: 1848, workerUtilization: 100, costPerOrder: 0.46, ordersCompleted: 50 },
  { name: 'Double', estimatedTime: 12.6, totalDistance: 868, workerUtilization: 100, costPerOrder: 0.29, ordersCompleted: 50 },
  { name: 'Clustered', estimatedTime: 14.5, totalDistance: 1648, workerUtilization: 100, costPerOrder: 0.43, ordersCompleted: 50 },
  { name: 'Grand', estimatedTime: 10.6, totalDistance: 1204, workerUtilization: 100, costPerOrder: 0.34, ordersCompleted: 50 },
];

/* Baked AI inputs from the same real run — animation only. */
const INSIGHTS: WarehouseInsight[] = [
  { id: 'wh-0', name: 'Single', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 }, inventory: { skuCount: 430, demandDistribution: 10, productAffinity: 10, storageFootprint: 88 }, placement: { slottingBias: 10, categoryClustering: 10 } }, bestEfficiency: 55, bestEstimatedTime: 15.3, bestTotalDistance: 1760, bestCostPerOrder: 0.45, averageDistance: 4600, averageTime: 21.633333333333336 },
  { id: 'wh-1', name: 'Double', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 2 }, inventory: { skuCount: 420, demandDistribution: 70, productAffinity: 30, storageFootprint: 82 }, placement: { slottingBias: 80, categoryClustering: 30 } }, bestEfficiency: 29, bestEstimatedTime: 9.6, bestTotalDistance: 1576, bestCostPerOrder: 0.4, averageDistance: 1608, averageTime: 11.333333333333334 },
  { id: 'wh-2', name: 'Clustered', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 }, inventory: { skuCount: 435, demandDistribution: 40, productAffinity: 80, storageFootprint: 88 }, placement: { slottingBias: 40, categoryClustering: 85 } }, bestEfficiency: 57, bestEstimatedTime: 12.5, bestTotalDistance: 1704, bestCostPerOrder: 0.44, averageDistance: 4280, averageTime: 19.533333333333335 },
  { id: 'wh-3', name: 'Grand', configuration: { layout: { gridHeight: 24, rackCount: 12, aisleWidth: 1, crossAisleCount: 3 }, inventory: { skuCount: 530, demandDistribution: 55, productAffinity: 50, storageFootprint: 72 }, placement: { slottingBias: 65, categoryClustering: 60 } }, bestEfficiency: 54, bestEstimatedTime: 11.3, bestTotalDistance: 1168, bestCostPerOrder: 0.34, averageDistance: 3225.3333333333335, averageTime: 16.2 },
];

const BASE = DATA[0];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

const METRIC_DEFS = [
  { key: 'time', label: 'Est. Time', pick: (r: Baked) => r.estimatedTime, format: (n: number) => `${fmtNumber(n)} min` },
  { key: 'util', label: 'Worker Util.', pick: (r: Baked) => r.workerUtilization, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'cost', label: 'Cost / Order', pick: (r: Baked) => r.costPerOrder, format: (n: number) => `$${fmtNumber(n, 2)}` },
  { key: 'orders', label: 'Orders Done', pick: (r: Baked) => r.ordersCompleted, format: (n: number) => `${fmtNumber(n, 0)}` },
];

const TOTAL = 5;
/* When each variant auto-opens the recommendation (0 = stays closed). */
const OPEN_AT: Record<number, number> = { 1: 0, 2: 3.2, 3: 3.6 };

const VARIANTS = [
  { n: 1, label: 'Nudge' },
  { n: 2, label: 'Open' },
  { n: 3, label: 'Glow' },
];

export default function Animation6Page() {
  const [time, setTime] = useState(0);
  const [variant, setVariant] = useState(1);

  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const prevTime = useRef(0);
  const maxH = useRef(0);
  const [fit, setFit] = useState(1);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const replay = (v?: number) => {
    if (v !== undefined) setVariant(v);
    last.current = null;
    prevTime.current = 0;
    setTime(0);
    setPlaying(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'r') replay();
      else if (['1', '2', '3'].includes(k)) replay(Number(k));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Master clock — plays once per R.
  useEffect(() => {
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
  }, []);

  // Auto-open the recommendation as the clock crosses OPEN_AT.
  useEffect(() => {
    const at = OPEN_AT[variant] ?? 0;
    if (at > 0 && prevTime.current < at && time >= at) {
      aiRef.current?.querySelector('button')?.click();
    }
    prevTime.current = time;
  }, [time, variant]);

  // Shrink-to-fit on the tallest seen state — never rescales mid-play.
  useEffect(() => {
    const compute = () => {
      const h = cardRef.current?.offsetHeight ?? 0;
      if (h > maxH.current) maxH.current = h;
      const f = maxH.current > 0 ? Math.min(1, (window.innerHeight - 32) / maxH.current) : 1;
      setFit((prev) => (prev === f ? prev : f));
    };
    compute();
    window.addEventListener('resize', compute);
    const ob = cardRef.current ? new ResizeObserver(compute) : null;
    if (cardRef.current && ob) ob.observe(cardRef.current);
    return () => {
      window.removeEventListener('resize', compute);
      ob?.disconnect();
    };
  }, []);

  const rankDist = [...DATA]
    .map((col) => ({ col, dist: col.totalDistance }))
    .sort((a, b) => a.dist - b.dist);

  // Table cascade (locked winner style from /animation/5).
  const rowIn = (i: number) => {
    const p = easeOutCubic(clamp01((time - (0.3 + i * 0.35)) / 0.4));
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px)` };
  };
  const deltaStyle = (i: number): React.CSSProperties => ({
    opacity: clamp01((time - (0.3 + i * 0.35 + 0.25)) / 0.3),
  });

  // AI block entrance per variant.
  const aiIn = (() => {
    const p = easeOutCubic(clamp01((time - 2.6) / 0.5));
    return { opacity: p, transform: `translateY(${(1 - p) * 16}px)` };
  })();
  const glowing = variant === 3 && time >= 2.8 && time < 3.6;
  const pulse = (() => {
    const at = OPEN_AT[variant] ?? 0;
    if (!at || time < at) return {};
    const p = clamp01((time - at) / 0.4);
    return { transform: `scale(${1 + 0.012 * Math.sin(p * Math.PI)})` };
  })();

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <style>{`
        @keyframes a6-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(76, 92, 45, 0); } 50% { box-shadow: 0 0 0 4px rgba(76, 92, 45, 0.35); } }
        .a6-glow { animation: a6-glow 0.9s ease-in-out infinite; border-radius: 0.5rem; }
      `}</style>
      <div ref={cardRef} style={{ transform: `scale(${fit})` }} className="w-full max-w-4xl">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={rowIn(0)}>
                  <th className="h-11 px-3 text-left align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-r border-border/60 pr-4">
                    Metric
                  </th>
                  {rankDist.map(({ col }, rank) => (
                    <th
                      key={col.name}
                      style={rowIn(0)}
                      className={cn('h-11 px-3 text-left align-middle whitespace-nowrap', rank === 0 && 'bg-primary/5')}
                    >
                      <span className="flex items-center gap-2">
                        <span
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
                <tr className="border-b border-border/60" style={rowIn(1)}>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border/60 pr-4">
                    Total Distance
                  </td>
                  {rankDist.map(({ col, dist }) => (
                    <td key={col.name} className={cn('px-3 py-3 align-middle whitespace-nowrap', col.name === rankDist[0].col.name && 'bg-primary/5')}>
                      <span className="text-sm font-bold tabular-nums text-foreground">{fmtNumber(dist)} m</span>
                    </td>
                  ))}
                </tr>
                {METRIC_DEFS.map((m, mi) => (
                  <tr key={m.key} style={rowIn(mi + 2)} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3 align-middle whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border/60 pr-4">
                      {m.label}
                    </td>
                    {rankDist.map(({ col }) => {
                      const isBase = col.name === BASE.name;
                      const baseVal = isBase ? undefined : m.pick(BASE);
                      const cur = m.pick(col);
                      const diff = baseVal !== undefined ? cur - baseVal : 0;
                      const pct = baseVal ? (diff / Math.abs(baseVal)) * 100 : 0;
                      return (
                        <td key={col.name} className={cn('px-3 py-3 align-middle whitespace-nowrap tabular-nums', col.name === rankDist[0].col.name && 'bg-primary/5')}>
                          <span className="font-medium text-foreground">{m.format(cur)}</span>
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

        {/* The genuine AI recommendation, animated in per variant. */}
        <div ref={aiRef} style={{ ...aiIn, ...pulse }} className={glowing ? 'a6-glow mt-3' : 'mt-3'}>
          <AiSuggestion insights={INSIGHTS} isRunning={false} onGenerate={async () => {}} />
        </div>
      </div>

      {/* vartest switcher — keys 1-3, R replay */}
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
          {playing ? 'playing…' : 'R replay · 1–3 variant'}
        </p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
