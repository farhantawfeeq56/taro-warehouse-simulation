'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';
import { cn } from '@/lib/utils';

/* Baked once from a real run (reconcile + runSimulation, 5 workers,
   50 orders) — this page is animation only, it never simulates. */
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

const BASE = DATA[0];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

/* Same metric defs as the real compare screen (minus Efficiency). */
const METRIC_DEFS = [
  { key: 'time', label: 'Est. Time', pick: (r: Baked) => r.estimatedTime, format: (n: number) => `${fmtNumber(n)} min` },
  { key: 'util', label: 'Worker Util.', pick: (r: Baked) => r.workerUtilization, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'cost', label: 'Cost / Order', pick: (r: Baked) => r.costPerOrder, format: (n: number) => `$${fmtNumber(n, 2)}` },
  { key: 'orders', label: 'Orders Done', pick: (r: Baked) => r.ordersCompleted, format: (n: number) => `${fmtNumber(n, 0)}` },
];

const TOTAL = 4;

export default function Animation5Page() {
  const [time, setTime] = useState(0);

  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const replay = () => {
    last.current = null;
    setTime(0);
    setPlaying(true);
  };

  // R replays. Nothing else ever starts it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') replay();
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

  // Shrink-to-fit so the fixed stage never clips nor scrolls.
  useEffect(() => {
    const compute = () => {
      const h = cardRef.current?.offsetHeight ?? 0;
      const avail = window.innerHeight - 32;
      const f = h > 0 ? Math.min(1, avail / h) : 1;
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

  // Ranked by lowest Total Distance — same rule as the real screen.
  const rankDist = [...DATA]
    .map((col) => ({ col, dist: col.totalDistance }))
    .sort((a, b) => a.dist - b.dist);

  // Row cascade — rows drop in top-first, deltas follow their row.
  const rowIn = (i: number) => {
    const p = easeOutCubic(clamp01((time - (0.3 + i * 0.35)) / 0.4));
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px)` };
  };
  const deltaStyle = (i: number): React.CSSProperties => ({
    opacity: clamp01((time - (0.3 + i * 0.35 + 0.25)) / 0.3),
  });

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div ref={cardRef} style={{ transform: `scale(${fit})` }} className="w-full max-w-4xl">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
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
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
