'use client';

/**
 * CompareView — a dedicated "special page" (in-app route) for comparing
 * warehouse simulations side by side.
 *
 * Flow (locked in):
 *   1. The user clicked "Compare" on a warehouse. Entering this page
 *      AUTOMATICALLY runs the simulation for EVERY warehouse (no selection,
 *      no Run button — all warehouses compete).
 *   2. The page shows the ranked results as a transposed TABLE: warehouses
 *      as columns (X axis, ranked by lowest Total Distance, #1 marked
 *      with a trophy), metrics as rows (Y axis), with deltas vs the base
 *      warehouse. Efficiency is intentionally NOT shown — the comparison
 *      ranks purely on travel distance.
 *
 * Below the rankings, ExperimentSuggestion is a quiet nudge: a small line offering a
 * recommended experiment that expands downward on click.
 *
 * All state lives in TaroApp memory, so leaving the page loses nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  GitCompareArrows,
  Loader2,
  Trophy,
} from 'lucide-react';
import { ExperimentSuggestion } from './experiment-recommendation-card';
import {
  toWarehouseInsight,
  type ExperimentRecommendation,
} from '@/lib/taro/experiment-recommendation';
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import { reconcile } from '@/lib/taro/corrector';
import type {
  Order,
  SimulationResults,
  StrategyResult,
  StrategyType,
  WarehouseProfile,
  LaborProfile,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CompareViewProps {
  /** All warehouses in the workspace (base + selectable others). */
  warehouses: WorkspaceWarehouse[];
  /** Orders for each warehouse id (per-warehouse order sets). */
  ordersByWarehouse: Record<string, Order[]>;
  /** The warehouse the user clicked "Compare" on — fixed base column. */
  baseWarehouseId: string | null;
  workerCount: number;
  warehouseProfile: WarehouseProfile;
  laborProfile: LaborProfile;
  /** Called when the user leaves the compare page. */
  onExit: () => void;
  /**
   * Generates a new experiment warehouse (via the existing session pipeline)
   * and adds it to the workspace. Resolves when the warehouse is committed.
   */
  onGenerateExperiment: (
    constraintsRaw: string,
    recommendation: ExperimentRecommendation,
  ) => Promise<void>;
}

interface WarehouseResult {
  id: string;
  name: string;
  /** Full results from the silent run (all 3 strategies). */
  results: SimulationResults;
}

const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

const METRIC_DEFS = [
  { key: 'time', label: 'Est. Time', pick: (r: StrategyResult) => r.estimatedTime, format: (n: number) => `${fmtNumber(n)} min` },
  { key: 'dist', label: 'Total Distance', pick: (r: StrategyResult) => r.totalDistance, format: (n: number) => `${fmtNumber(n)} m` },
  { key: 'eff', label: 'Efficiency', pick: (r: StrategyResult) => r.efficiency, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'util', label: 'Worker Util.', pick: (r: StrategyResult) => r.workerUtilization, format: (n: number) => `${fmtNumber(n)}%` },
  { key: 'cost', label: 'Cost / Order', pick: (r: StrategyResult) => r.costPerOrder, format: (n: number) => `$${fmtNumber(n, 2)}` },
  { key: 'orders', label: 'Orders Done', pick: (r: StrategyResult) => r.ordersCompleted, format: (n: number) => `${fmtNumber(n, 0)}` },
];

type MetricDef = (typeof METRIC_DEFS)[number];

function bestOf(byStrategy: Record<StrategyType, StrategyResult>): StrategyResult | undefined {
  // Best = LOWEST total distance (comparison ranks by travel distance).
  return Object.values(byStrategy)
    .filter(Boolean)
    .sort((a, b) => a.totalDistance - b.totalDistance)[0];
}

function WhName({ name, isBase }: { name: string; isBase?: boolean }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-sm font-semibold text-foreground')}>
      {isBase && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
      {name}
      {isBase && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">base</Badge>
      )}
    </span>
  );
}

export function CompareView({
  warehouses,
  ordersByWarehouse,
  baseWarehouseId,
  workerCount,
  warehouseProfile,
  laborProfile,
  onExit,
  onGenerateExperiment,
}: CompareViewProps) {
  const baseEntry = useMemo(
    () => warehouses.find((w) => w.id === baseWarehouseId) ?? null,
    [warehouses, baseWarehouseId],
  );

  const [resultsByWarehouse, setResultsByWarehouse] = useState<Record<string, WarehouseResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // ── Auto-run all warehouses on entry ────────────────────────────────────
  const handleRun = useCallback(() => {
    if (!baseEntry || warehouses.length === 0) return;
    const ids = warehouses.map((w) => w.id);
    setIsRunning(true);
    setRunError(null);

    requestAnimationFrame(() => {
      try {
        const next: Record<string, WarehouseResult> = {};
        for (const id of ids) {
          const entry = warehouses.find((w) => w.id === id);
          const orders = ordersByWarehouse[id] ?? [];
          if (!entry) continue;
          // Hidden corrector — same as the main Simulate button: repair
          // anything broken before running so a clean run is guaranteed.
          const corrected = reconcile(entry.warehouse, orders);
          const results = runSimulation(corrected.warehouse, corrected.orders, workerCount, {
            warehouseProfile,
            laborProfile,
          });
          next[id] = { id, name: entry.name, results };
        }
        setResultsByWarehouse(next);
      } catch (error) {
        console.error('Comparison run failed:', error);
        setRunError(
          error instanceof UnreachableLocationError
            ? 'One of the warehouses has unreachable pick locations. Fix the layout and try again.'
            : error instanceof Error
              ? error.message
              : 'Simulation failed. Please try again.',
        );
      } finally {
        setIsRunning(false);
      }
    });
  }, [baseEntry, warehouses, ordersByWarehouse, workerCount, warehouseProfile, laborProfile]);

  // Debounced auto-run on entry (and when warehouses change).
  const runRef = useRef(handleRun);
  useEffect(() => {
    runRef.current = handleRun;
  }, [handleRun]);
  useEffect(() => {
    if (!baseEntry) return;
    const t = setTimeout(() => runRef.current(), 250);
    return () => clearTimeout(t);
  }, [baseEntry?.id, warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Experiment suggestion insights ───────────────────────────────────────
  const insights = useMemo(() => {
    return Object.values(resultsByWarehouse)
      .map((whRes) => {
        const entry = warehouses.find((w) => w.id === whRes.id);
        if (!entry) return null;
        return toWarehouseInsight(
          entry.id,
          entry.name,
          entry.configuration ?? null,
          whRes.results,
        );
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [resultsByWarehouse, warehouses]);

  // ── Comparison assembly ────────────────────────────────────────────────
  const columns = useMemo(() => {
    if (!baseEntry) return null;
    const colResults = warehouses.map((w) => {
      const whRes = resultsByWarehouse[w.id];
      if (!whRes) return null;
      const byStrategy = Object.fromEntries(
        whRes.results.strategies.map((s) => [s.strategy, s]),
      ) as Record<StrategyType, StrategyResult>;
      return { entry: w, byStrategy };
    });
    return { colResults, hasResults: colResults.some((c) => c !== null) };
  }, [baseEntry, warehouses, resultsByWarehouse]);

  if (!baseEntry) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No warehouse selected for comparison.</p>
          <Button variant="outline" onClick={onExit}>
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Button>
        </div>
      </div>
    );
  }

  const cols = columns?.colResults.filter((c): c is NonNullable<typeof c> => c !== null) ?? [];
  const baseByStrategy = cols.find((c) => c.entry.id === baseEntry.id)?.byStrategy;

  const rankDist = cols
    .map((col) => ({ col, dist: bestOf(col.byStrategy)?.totalDistance ?? Infinity }))
    .sort((a, b) => a.dist - b.dist);
  const hasResults = !!columns?.hasResults;

  // ── Status (shared) ─────────────────────────────────────────────────────
  const statusBlock = (
    <>
      {isRunning && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Running simulations…</span>
            <span className="text-xs text-muted-foreground">
              Simulating {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''} across all picking strategies.
            </span>
          </div>
        </div>
      )}
      {runError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {runError}
        </div>
      )}
    </>
  );

  const experimentSuggestion = hasResults ? (
    <ExperimentSuggestion
      insights={insights}
      isRunning={isRunning}
      onGenerate={onGenerateExperiment}
    />
  ) : null;

  const scrollBody = (children: React.ReactNode) => (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Header — back button + title. Same bg as the screen; only the table differs. */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onExit} title="Back to workspace">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">Compare Warehouses</h1>
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="text-muted-foreground">
          {cols.length} warehouse{cols.length !== 1 ? 's' : ''} · {baseEntry.name} is base
        </Badge>
      </div>

      {statusBlock && <div className="mx-auto w-full max-w-5xl px-6 pt-4">{statusBlock}</div>}

      {/* Rankings — transposed table: warehouses as columns, metrics as rows. */}
      {scrollBody(
        <div className="space-y-6">
          {hasResults && (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="h-11 px-3 text-left align-middle text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-r border-border/60 pr-4">
                      Metric
                    </th>
                    {rankDist.map(({ col }, rank) => (
                      <th
                        key={col.entry.id}
                        className={cn(
                          'h-11 px-3 text-left align-middle whitespace-nowrap',
                          rank === 0 && 'bg-primary/5',
                        )}
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
                          <span className="text-sm font-semibold text-foreground">{col.entry.name}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Total Distance row — first, so the ranked metric tops the table. */}
                  <tr className="border-b border-border/60">
                    <td className="px-3 py-3 align-middle whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border/60 pr-4">
                      Total Distance
                    </td>
                    {rankDist.map(({ dist }, rank) => (
                      <td
                        key={rank}
                        className={cn('px-3 py-3 align-middle whitespace-nowrap', rank === 0 && 'bg-primary/5')}
                      >
                        <span className="text-sm font-bold tabular-nums text-foreground">{fmtNumber(dist)} m</span>
                      </td>
                    ))}
                  </tr>
                  {METRIC_DEFS.filter((m) => m.key !== 'eff' && m.key !== 'dist').map((m) => (
                    <tr key={m.key} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-3 align-middle whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border/60 pr-4">
                        {m.label}
                      </td>
                      {rankDist.map(({ col }, rank) => {
                        const best = bestOf(col.byStrategy)!;
                        const isBase = col.entry.id === baseEntry.id;
                        const b = isBase ? undefined : baseByStrategy?.[best.strategy];
                        const baseVal = b ? m.pick(b) : undefined;
                        const cur = m.pick(best);
                        const diff = baseVal !== undefined ? cur - baseVal : 0;
                        const pct = baseVal ? (diff / Math.abs(baseVal)) * 100 : 0;
                        return (
                          <td
                            key={col.entry.id}
                            className={cn('px-3 py-3 align-middle whitespace-nowrap tabular-nums', rank === 0 && 'bg-primary/5')}
                          >
                            <span className="font-medium text-foreground">{m.format(cur)}</span>
                            {baseVal !== undefined && Math.abs(diff) > 1e-9 && (
                              <span className={cn('ml-1 text-[10px] font-medium', diff < 0 ? 'text-positive' : 'text-destructive')}>
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

          {/* Experiment suggestion — a quiet nudge below the rankings, expands downward. */}
          {experimentSuggestion}
        </div>,
      )}
    </div>
  );
}
