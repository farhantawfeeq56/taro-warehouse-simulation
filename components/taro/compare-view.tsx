'use client';

/**
 * CompareView — a dedicated "special page" (in-app route) for comparing
 * warehouse simulations side by side.
 *
 * Flow:
 *   1. The user clicked "Compare" on a warehouse in the workspace. That
 *      warehouse is passed in as `baseWarehouseId` and is pre-selected as the
 *      fixed base column of the comparison.
 *   2. A multi-select lets the user pick one or MORE other warehouses to
 *      compare against the base.
 *   3. "Run Comparison" runs `runSimulation` on the base + every selected
 *      warehouse — silently, with no user-visible simulation UI — and shows
 *      each warehouse's key metrics per strategy.
 *
 * vartest5: the results block (was a plain table) is now presented in 5
 * visual variants, switched by the floating segmented control in the
 * bottom-right corner (keys 1–5):
 *   1 Timeline — strategies as phases on a vertical rail, metric chips per warehouse
 *   2 Cards    — one card per warehouse with all 3 strategies inside
 *   3 Split    — one block per warehouse, 3 strategy columns side by side
 *   4 Scored   — warehouses ranked by best efficiency with score bars
 *   5 Classic  — the original comparison table
 *
 * All state lives in TaroApp memory, so leaving the page loses nothing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, GitCompareArrows, Layers, Loader2, Map, Trophy, UserRound, X } from 'lucide-react';
import { ExperimentRecommendationCard } from './experiment-recommendation-card';
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
import { LoadingButton } from '@/components/interior/loading-button';
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

/** Strategy label + short description for the table rows. */
const STRATEGY_META: Record<StrategyType, { label: string; description: string }> = {
  single: { label: 'Single Order', description: 'One worker, one order at a time' },
  batch: { label: 'Batch Picking', description: 'Group orders into batches' },
  zone: { label: 'Zone Picking', description: 'Workers own zones' },
};

const STRATEGY_ICONS = { single: UserRound, batch: Layers, zone: Map } as const;

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

/** Delta value vs a base warehouse, with ▲/▼ % tag (same rule as the table). */
function DeltaChip({
  label,
  base,
  current,
  pick,
  format,
}: {
  label: string;
  base?: StrategyResult;
  current: StrategyResult;
  pick: (r: StrategyResult) => number;
  format: (n: number) => string;
}) {
  const b = base ? pick(base) : undefined;
  const c = pick(current);
  const diff = b !== undefined ? c - b : 0;
  const pct = b ? (diff / Math.abs(b)) * 100 : 0;
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold tabular-nums text-foreground">{format(c)}</span>
        {b !== undefined && Math.abs(diff) > 1e-9 && (
          <span className={cn('text-[10px] font-medium', diff < 0 ? 'text-positive' : 'text-destructive')}>
            {diff < 0 ? '▼' : '▲'}
            {fmtNumber(Math.abs(pct), 0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function bestOf(byStrategy: Record<StrategyType, StrategyResult>): StrategyResult | undefined {
  return Object.values(byStrategy).filter(Boolean).sort((a, b) => b.efficiency - a.efficiency)[0];
}

function WhName({ name, isBase }: { name: string; isBase?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      {isBase && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      {name}
      {isBase && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">base</Badge>
      )}
    </span>
  );
}

function BestBadge({ byStrategy }: { byStrategy: Record<StrategyType, StrategyResult> }) {
  const best = bestOf(byStrategy);
  return best ? <Badge variant="secondary">{STRATEGY_META[best.strategy].label}</Badge> : <Badge variant="secondary">—</Badge>;
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
  const others = useMemo(
    () => warehouses.filter((w) => w.id !== baseWarehouseId),
    [warehouses, baseWarehouseId],
  );

  // Multi-select of other warehouses to compare against the base.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => others.map((w) => w.id));
  const [resultsByWarehouse, setResultsByWarehouse] = useState<Record<string, WarehouseResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // vartest5: results-presentation variant (1 timeline · 2 cards · 3 split · 4 scored · 5 classic)
  const [variant, setVariant] = useState<1 | 2 | 3 | 4 | 5>(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setVariant(n as 1 | 2 | 3 | 4 | 5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleWarehouse = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? others.map((w) => w.id) : []);
  }, [others]);

  const handleRun = useCallback(() => {
    if (!baseEntry) return;
    // The selected set INCLUDES the base — we always run the base too so the
    // table has a reference column.
    const ids = [baseEntry.id, ...selectedIds];
    setIsRunning(true);
    setRunError(null);

    // Run synchronously (same engine the main app uses) but off the paint
    // path so the page stays responsive. Simulations here are "silent": no
    // animation, no right-sidebar UI — just results.
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
  }, [baseEntry, selectedIds, warehouses, ordersByWarehouse, workerCount, warehouseProfile, laborProfile]);

  const allSelected = others.length > 0 && selectedIds.length === others.length;

  // ── AI experiment insights ─────────────────────────────────────────────
  // Reduce every warehouse's results + config into the flat shape the
  // heuristic engine consumes. Recomputed whenever a run lands.
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
  // Columns are warehouses (base first). Each column holds its per-strategy
  // results, indexed by strategy type.
  const columns = useMemo(() => {
    if (!baseEntry) return null;
    const columnWarehouses = [baseEntry.id, ...selectedIds]
      .map((id) => warehouses.find((w) => w.id === id))
      .filter(Boolean) as WorkspaceWarehouse[];

    const colResults = columnWarehouses.map((w) => {
      const whRes = resultsByWarehouse[w.id];
      if (!whRes) return null;
      const byStrategy = Object.fromEntries(
        whRes.results.strategies.map((s) => [s.strategy, s]),
      ) as Record<StrategyType, StrategyResult>;
      return { entry: w, byStrategy };
    });
    return { colResults, hasResults: colResults.some((c) => c !== null) };
  }, [baseEntry, selectedIds, resultsByWarehouse, warehouses]);

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
  const strategies = Object.entries(STRATEGY_META) as [StrategyType, { label: string; description: string }][];
  const baseByStrategy = cols[0]?.byStrategy;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Header — back button + title. */}
      <div className="shrink-0 flex items-center gap-3 border-b border-primary/20 bg-primary px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onExit}
          title="Back to workspace"
          className="text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-primary-foreground/80" />
          <h1 className="text-base font-semibold text-primary-foreground">Compare Warehouses</h1>
        </div>
        <div className="flex-1" />
        <Badge className="border-transparent bg-primary-foreground/15 text-primary-foreground">
          {cols.length} warehouse{cols.length !== 1 ? 's' : ''} in comparison
        </Badge>
      </div>

      {/* Body. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
          {/* Base + selection card. */}
          <section className="rounded-lg border border-border bg-surface p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Base warehouse
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{baseEntry.name}</span>
              <Badge variant="outline" className="text-muted-foreground">base</Badge>
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Compare against
            </div>
            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other warehouses available. Add another warehouse first.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {others.map((w) => {
                    const active = selectedIds.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleWarehouse(w.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {w.name}
                        {active && <X className="h-3 w-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    Select all
                  </label>
                  <LoadingButton
                    onAction={handleRun}
                    disabled={isRunning || selectedIds.length === 0}
                    pendingLabel="Running…"
                    successLabel="Done"
                    tone="primary"
                    className="gap-1.5"
                  >
                    Run Comparison
                  </LoadingButton>
                </div>
              </>
            )}
          </section>

          {isRunning && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Running simulations…</span>
                <span className="text-xs text-muted-foreground">
                  Simulating {1 + selectedIds.length} warehouse{1 + selectedIds.length > 1 ? 's' : ''} across all picking strategies.
                </span>
              </div>
            </div>
          )}

          {runError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {runError}
            </div>
          )}

          {/* Results — vartest5: one of 5 presentations. */}
          {columns && columns.hasResults && (
            <section className="rounded-lg border border-border bg-surface overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Simulation comparison</h2>
                <p className="text-xs text-muted-foreground">
                  Each warehouse runs the same strategy set on its own orders. Delta vs the base warehouse is shown where relevant.
                </p>
              </div>
              <div className="p-4 space-y-4">
                {variant === 1 && (
                  <div className="relative pl-8">
                    <span className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
                    {strategies.map(([strategy, meta]) => {
                      const Icon = STRATEGY_ICONS[strategy];
                      return (
                        <div key={strategy} className="relative pb-5 last:pb-0">
                          <span className="absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface shadow-sm">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                            <span className="text-[11px] text-muted-foreground">{meta.description}</span>
                          </div>
                          <div className="mt-2 space-y-2">
                            {cols.map((col) => {
                              const sr = col.byStrategy[strategy];
                              if (!sr) return null;
                              return (
                                <div key={col.entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
                                  <span className="w-36 shrink-0 truncate text-xs font-medium text-foreground">{col.entry.name}</span>
                                  {METRIC_DEFS.map((m) => (
                                    <DeltaChip
                                      key={m.key}
                                      label={m.label}
                                      base={baseByStrategy?.[strategy]}
                                      current={sr}
                                      pick={m.pick}
                                      format={m.format}
                                    />
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {variant === 2 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {cols.map((col, i) => (
                      <div
                        key={col.entry.id}
                        className={cn(
                          'rounded-xl border bg-surface p-4 space-y-3',
                          i === 0 && 'border-primary/60 ring-1 ring-primary/20',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <WhName name={col.entry.name} isBase={i === 0} />
                          <BestBadge byStrategy={col.byStrategy} />
                        </div>
                        {strategies.map(([strategy, meta]) => {
                          const sr = col.byStrategy[strategy];
                          if (!sr) return null;
                          const Icon = STRATEGY_ICONS[strategy];
                          return (
                            <div key={strategy} className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Icon className="h-3 w-3 text-primary" />
                                {meta.label}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                {METRIC_DEFS.map((m) => (
                                  <DeltaChip key={m.key} label={m.label} base={i === 0 ? undefined : baseByStrategy?.[strategy]} current={sr} pick={m.pick} format={m.format} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {variant === 3 && (
                  <div className="space-y-4">
                    {cols.map((col, i) => (
                      <div key={col.entry.id} className="overflow-hidden rounded-xl border border-border">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                          <WhName name={col.entry.name} isBase={i === 0} />
                          <BestBadge byStrategy={col.byStrategy} />
                        </div>
                        <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
                          {strategies.map(([strategy, meta]) => {
                            const sr = col.byStrategy[strategy];
                            if (!sr) return null;
                            const Icon = STRATEGY_ICONS[strategy];
                            return (
                              <div key={strategy} className="p-3 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Icon className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {METRIC_DEFS.map((m) => (
                                    <DeltaChip key={m.key} label={m.label} base={i === 0 ? undefined : baseByStrategy?.[strategy]} current={sr} pick={m.pick} format={m.format} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {variant === 4 && (
                  <div className="space-y-3">
                    {cols
                      .map((col) => ({ col, best: bestOf(col.byStrategy) }))
                      .filter((x): x is { col: NonNullable<typeof cols[number]>; best: StrategyResult } => !!x.best)
                      .sort((a, b) => b.best.efficiency - a.best.efficiency)
                      .map(({ col, best }, rank) => {
                        const topEff = Math.max(...cols.map((c) => bestOf(c.byStrategy)?.efficiency ?? 0)) || 1;
                        return (
                          <div key={col.entry.id} className="rounded-xl border border-border bg-surface p-4">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                rank === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                              )}>
                                {rank === 0 ? <Trophy className="h-3.5 w-3.5" /> : rank + 1}
                              </span>
                              <WhName name={col.entry.name} isBase={col.entry.id === baseEntry.id} />
                              <div className="ml-auto text-right">
                                <span className="text-lg font-bold tabular-nums text-foreground">{fmtNumber(best.efficiency)}%</span>
                                <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">eff.</span>
                                <div className="mt-0.5 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${(best.efficiency / topEff) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                              {METRIC_DEFS.map((m) => (
                                <DeltaChip
                                  key={m.key}
                                  label={m.label}
                                  base={col.entry.id === baseEntry.id ? undefined : baseByStrategy?.[best.strategy]}
                                  current={best}
                                  pick={m.pick}
                                  format={m.format}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {variant === 5 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">
                            Metric
                          </th>
                          {cols.map((col, i) => (
                            <th
                              key={col.entry.id}
                              className={cn(
                                'h-10 px-3 text-left align-middle font-medium whitespace-nowrap',
                                i === 0 ? 'text-primary' : 'text-foreground',
                              )}
                            >
                              <WhName name={col.entry.name} isBase={i === 0} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {strategies.map(([strategy, meta]) => (
                          <tr key={strategy} className="border-b border-border bg-muted/50">
                            <td colSpan={cols.length + 1} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                                  {meta.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">{meta.description}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {strategies.flatMap(([strategy]) =>
                          METRIC_DEFS.map((m) => (
                            <tr key={`${strategy}-${m.key}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2 align-middle whitespace-nowrap font-medium text-foreground">{m.label}</td>
                              {cols.map((col, i) => {
                                const sr = col.byStrategy[strategy];
                                if (!sr) {
                                  return <td key={col.entry.id} className="px-3 py-2 text-muted-foreground">—</td>;
                                }
                                const b = i === 0 ? undefined : baseByStrategy?.[strategy];
                                const baseVal = b ? m.pick(b) : undefined;
                                const cur = m.pick(sr);
                                const diff = baseVal !== undefined ? cur - baseVal : 0;
                                const pct = baseVal ? (diff / Math.abs(baseVal)) * 100 : 0;
                                return (
                                  <td key={col.entry.id} className="px-3 py-2 whitespace-nowrap tabular-nums">
                                    {m.format(cur)}
                                    {baseVal !== undefined && Math.abs(diff) > 1e-9 && (
                                      <span className={cn('ml-1 text-[10px] font-medium', diff < 0 ? 'text-positive' : 'text-destructive')}>
                                        {diff < 0 ? '▼' : '▲'}{fmtNumber(Math.abs(pct), 0)}%
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          )),
                        )}
                        <tr className="border-t border-border bg-muted/20">
                          <td className="px-3 py-2 align-middle whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">Best Strategy</span>
                              <span className="text-[10px] text-muted-foreground">Highest-efficiency strategy per warehouse</span>
                            </div>
                          </td>
                          {cols.map((col) => (
                            <td key={col.entry.id} className="px-3 py-2 whitespace-nowrap">
                              <BestBadge byStrategy={col.byStrategy} />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* AI experiment suggestion — the mock-AI block. */}
          {columns && columns.hasResults && (
            <ExperimentRecommendationCard
              insights={insights}
              isRunning={isRunning}
              onGenerate={onGenerateExperiment}
            />
          )}
        </div>
      </div>

      {/* vartest5: floating segmented toolbar — switches results variant (keys 1–5). */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex items-center gap-1.5">
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
          Results 1–5
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shadow-lg">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v as 1 | 2 | 3 | 4 | 5)}
              title={`Results variant ${v}`}
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold transition-colors',
                variant === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
