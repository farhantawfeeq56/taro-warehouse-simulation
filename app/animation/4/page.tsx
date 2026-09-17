'use client';

import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';
import { ExperimentSuggestion } from '@/components/taro/experiment-recommendation-card';
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

const INSIGHTS: WarehouseInsight[] = [
  { id: 'wh-0', name: 'Single', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 }, inventory: { skuCount: 430, demandDistribution: 10, productAffinity: 10, storageFootprint: 88 }, placement: { slottingBias: 10, categoryClustering: 10 } }, bestEfficiency: 55, bestEstimatedTime: 15.3, bestTotalDistance: 1760, bestCostPerOrder: 0.45, averageDistance: 4600, averageTime: 21.633333333333336 },
  { id: 'wh-1', name: 'Double', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 2 }, inventory: { skuCount: 420, demandDistribution: 70, productAffinity: 30, storageFootprint: 82 }, placement: { slottingBias: 80, categoryClustering: 30 } }, bestEfficiency: 29, bestEstimatedTime: 9.6, bestTotalDistance: 1576, bestCostPerOrder: 0.4, averageDistance: 1608, averageTime: 11.333333333333334 },
  { id: 'wh-2', name: 'Clustered', configuration: { layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 }, inventory: { skuCount: 435, demandDistribution: 40, productAffinity: 80, storageFootprint: 88 }, placement: { slottingBias: 40, categoryClustering: 85 } }, bestEfficiency: 57, bestEstimatedTime: 12.5, bestTotalDistance: 1704, bestCostPerOrder: 0.44, averageDistance: 4280, averageTime: 19.533333333333335 },
  { id: 'wh-3', name: 'Grand', configuration: { layout: { gridHeight: 24, rackCount: 12, aisleWidth: 1, crossAisleCount: 3 }, inventory: { skuCount: 530, demandDistribution: 55, productAffinity: 50, storageFootprint: 72 }, placement: { slottingBias: 65, categoryClustering: 60 } }, bestEfficiency: 54, bestEstimatedTime: 11.3, bestTotalDistance: 1168, bestCostPerOrder: 0.34, averageDistance: 3225.3333333333335, averageTime: 16.2 },
];

const BASE = DATA[0];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

const METRIC_DEFS = [
  { key: 'time', label: 'Est. Time', pick: (r: Baked) => r.estimatedTime, format: (n: number) => `${fmtNumber(n)} min` },
  { key: 'util', label: 'Worker Util.', pick: (r: Baked) => r.workerUtilization, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'cost', label: 'Cost / Order', pick: (r: Baked) => r.costPerOrder, format: (n: number) => `$${fmtNumber(n, 2)}` },
  { key: 'orders', label: 'Orders Done', pick: (r: Baked) => r.ordersCompleted, format: (n: number) => `${fmtNumber(n, 0)}` },
];

/* Phases: table → close → suggestion chain → out. Ends on the last button. */
const TOTAL = 8.5;
const TABLE_OUT_T0 = 2.5;
const TABLE_OUT_T1 = 3.5;
const SUGG_IN_T = 3.5;
const CLICK_TS = [4.8, 5.8];
const TYPE_T0 = 6.1;
const TYPE_T1 = 6.8;
const CONSTRAINTS_TEXT = 'max 14 racks, height at least 20';

export default function Animation4Page() {
  const [time, setTime] = useState(0);
  const [clickT, setClickT] = useState(-1);
  const [runId, setRunId] = useState(0);

  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const suggRef = useRef<HTMLDivElement | null>(null);
  const anchors = useRef<({ el: Element; x: number; y: number } | null)[]>([null, null]);
  const done = useRef<boolean[]>([false, false]);
  const lastTry = useRef<number[]>([0, 0]);
  const typed = useRef(0);
  const prevTime = useRef(0);
  const [fit, setFit] = useState(1);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const replay = () => {
    last.current = null;
    prevTime.current = 0;
    setRunId((id) => id + 1);
    anchors.current = [null, null];
    done.current = [false, false];
    lastTry.current = [0, 0];
    typed.current = 0;
    setTime(0);
    setClickT(-1);
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

  // Measure each step's exact target, then click it on schedule.
  useEffect(() => {
    const stage = stageRef.current;
    const sugg = suggRef.current;
    const i = done.current.findIndex((f) => !f);
    if (stage && sugg && i >= 0 && time >= SUGG_IN_T) {
      const sr = stage.getBoundingClientRect();
      const pt = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
      };
      // Re-measure every frame until fired — cached anchors go stale
      // the moment the card shifts.
      if (i === 0) {
        const spans = sugg.querySelectorAll('span');
        for (const s of spans) {
          if (s.textContent === 'View it') {
            anchors.current[i] = pt(s);
            break;
          }
        }
      } else {
        const btns = sugg.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent?.includes('Generate experiment')) {
            anchors.current[i] = pt(b);
            break;
          }
        }
      }
      const at = CLICK_TS[i];
      const a = anchors.current[i];
      // A step is done when its UI is gone (opened / advanced).
      const gone =
        i === 0
          ? ![...sugg.querySelectorAll('span')].some((s) => s.textContent === 'View it')
          : ![...sugg.querySelectorAll('button')].some((b) => b.textContent?.includes('Generate experiment'));
      if (gone) {
        done.current[i] = true;
      } else if (a && time >= at && time - lastTry.current[i] > 0.4) {
        lastTry.current[i] = time;
        const el = a.el as HTMLElement;
        // Same press as /animation/2 — squash + dim, no ring.
        el.animate(
          [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(0.97)', filter: 'brightness(0.9)' },
            { transform: 'scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 350, easing: 'ease-out' }
        );
        el.click();
        setClickT(at);
      }
    }
    if (time >= TYPE_T0 && time <= TYPE_T1 + 0.2) {
      const ta = suggRef.current?.querySelector('textarea');
      if (ta) {
        const n = Math.min(
          CONSTRAINTS_TEXT.length,
          Math.floor(((time - TYPE_T0) / (TYPE_T1 - TYPE_T0)) * CONSTRAINTS_TEXT.length)
        );
        if (n !== typed.current) {
          typed.current = n;
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          setter?.call(ta, CONSTRAINTS_TEXT.slice(0, n));
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
    prevTime.current = time;
  }, [time]);

  // Stack height never changes (both acts share one grid cell) — one fit.
  useEffect(() => {
    const compute = () => {
      const h = cardRef.current?.offsetHeight ?? 0;
      const f = h > 0 ? Math.min(1, (window.innerHeight - 32) / h) : 1;
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

  const rowIn = (i: number) => {
    const p = easeOutCubic(clamp01((time - (0.3 + i * 0.35)) / 0.4));
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px)` };
  };
  const deltaStyle = (i: number): React.CSSProperties => ({
    opacity: clamp01((time - (0.3 + i * 0.35 + 0.25)) / 0.3),
  });

  // Table closes: rises + fades as one piece.
  const tableClose = (() => {
    const p = easeInOutCubic(clamp01((time - TABLE_OUT_T0) / (TABLE_OUT_T1 - TABLE_OUT_T0)));
    return {
      opacity: 1 - p,
      transform: `translateY(${-18 * p}px) scale(${1 - 0.02 * p})`,
      visibility: (time >= TABLE_OUT_T1 ? 'hidden' : 'visible') as 'hidden' | 'visible',
    };
  })();

  // Suggestion enters after the table is gone and stays — the finale is the
  // genuine Generate result painting on screen.
  const suggShow = (() => {
    if (time < SUGG_IN_T) return { opacity: 0, visibility: 'hidden' as const };
    const pIn = easeOutCubic(clamp01((time - SUGG_IN_T) / 0.3));
    return {
      opacity: pIn,
      transform: `translateY(${(1 - pIn) * 16}px)`,
      visibility: 'visible' as const,
    };
  })();

  /* ── Pointer chain: View it → Generate experiment → No constraints ── */
  const AN = anchors.current;
  const A0 = AN[0] ?? { x: 0, y: 0 };
  const A1 = AN[1] ?? A0;
  const A2 = AN[2] ?? A1;
  const SX = 190;
  const SY = 160;
  let cx = A0.x + SX;
  let cy = A0.y + SY;
  let cop = 0;

  const leg = (t0: number, t1: number, fx: number, fy: number, tx: number, ty: number) => {
    const p = easeInOutCubic(clamp01((time - t0) / (t1 - t0)));
    cx = fx + (tx - fx) * p;
    cy = fy + (ty - fy) * p;
    cop = clamp01((time - t0) / 0.2);
  };

  if (time < CLICK_TS[0]) {
    leg(3.6, CLICK_TS[0], A0.x + SX, A0.y + SY, A0.x, A0.y);
  } else if (time < CLICK_TS[1]) {
    leg(CLICK_TS[0], CLICK_TS[1], A0.x, A0.y, A1.x, A1.y);
  } else {
    // Cursor's job ends on the Generate experiment click — typing and the
    // final Generate happen on their own.
    cx = A1.x;
    cy = A1.y;
    cop = Math.max(0, 1 - (time - CLICK_TS[1] - 0.1) / 0.6);
  }


  return (
    <div ref={stageRef} className="relative flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Both acts share one grid cell — the size never moves. */}
      <div ref={cardRef} style={{ transform: `scale(${fit})` }} className="grid w-full max-w-4xl place-items-center">
        <div className="col-start-1 row-start-1 w-full" style={tableClose}>
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
          </div>

        <div key={runId} ref={suggRef} style={suggShow} className="col-start-1 row-start-1 mt-3 w-full">
          {/* Confirmation paints after the last click — after we're gone. */}
          <ExperimentSuggestion insights={INSIGHTS} isRunning={false} onGenerate={() => new Promise<void>((r) => setTimeout(r, 600))} />
        </div>
      </div>

      {/* Pointer */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          className="absolute"
          style={{
            left: cx - 5.4,
            top: cy - 3.25,
            opacity: cop,
            filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))',
          }}
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

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
