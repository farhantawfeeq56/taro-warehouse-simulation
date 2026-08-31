'use client';

/**
 * CompareView — a dedicated "special page" (in-app route) for comparing
 * warehouse simulations side by side.
 *
 * Flow (locked in, do not restructure):
 *   1. The user clicked "Compare" on a warehouse in the workspace. That
 *      warehouse is the fixed base.
 *   2. Entering this page AUTOMATICALLY runs the simulation for the base +
 *      every other warehouse (no Run button). Toggling the selection
 *      re-runs automatically too.
 *   3. The page shows, top to bottom: setup/selection, ranked results, and
 *      the AI experiment card — all on one scrollable page.
 *
 * vartest5: the flow stays identical in every variant; only the VISUAL
 * treatment of the page changes. 5 designs, switched by the floating
 * segmented control in the bottom-right corner (keys 1–5):
 *
 *   1 Cards   — warm background, white bordered cards, dot labels (baseline)
 *   2 Report  — seamless white page, hairline dividers, uppercase micro-labels
 *   3 Podium  — dark toolbar, top-3 podium with bars, medal ranking
 *   4 Tiles   — results as a responsive grid of stat tiles
 *   5 Minimal — airy, borderless, slim leaderboard rows
 *
 * All state lives in TaroApp memory, so leaving the page loses nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  GitCompareArrows,
  Loader2,
  Trophy,
  X,
} from 'lucide-react';
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

/** Strategy label for the table rows. */
const STRATEGY_META: Record<StrategyType, { label: string }> = {
  single: { label: 'Single Order' },
  batch: { label: 'Batch Picking' },
  zone: { label: 'Zone Picking' },
};

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

/** Delta value vs a base warehouse, with ▲/▼ % tag. */
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

/** One-line compact metric row with deltas (Report + Minimal variants). */
function MetricLine({ best, base }: { best: StrategyResult; base?: StrategyResult }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
      {METRIC_DEFS.map((m) => {
        const b = base ? m.pick(base) : undefined;
        const c = m.pick(best);
        const diff = b !== undefined ? c - b : 0;
        const pct = b ? (diff / Math.abs(b)) * 100 : 0;
        return (
          <span key={m.key}>
            <span className="font-medium text-foreground">{m.format(c)}</span>
            {b !== undefined && Math.abs(diff) > 1e-9 && (
              <span className={cn('ml-0.5', diff < 0 ? 'text-positive' : 'text-destructive')}>
                {diff < 0 ? '▼' : '▲'}{fmtNumber(Math.abs(pct), 0)}%
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function bestOf(byStrategy: Record<StrategyType, StrategyResult>): StrategyResult | undefined {
  return Object.values(byStrategy).filter(Boolean).sort((a, b) => b.efficiency - a.efficiency)[0];
}

function WhName({ name, isBase }: { name: string; isBase?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      {isBase && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
      {name}
      {isBase && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">base</Badge>
      )}
    </span>
  );
}

/** Selection chips (shared by every variant). */
function SelectionChips({
  others,
  selectedIds,
  onToggle,
  dark = false,
}: {
  others: WorkspaceWarehouse[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {others.map((w) => {
        const active = selectedIds.includes(w.id);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onToggle(w.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              dark
                ? active
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-white/20 bg-white/5 text-background hover:bg-white/10'
                : active
                  ? 'border-foreground/25 bg-muted text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {w.name}
            {active && <X className={cn('h-3 w-3', dark ? 'text-primary-foreground' : 'text-foreground/60')} />}
          </button>
        );
      })}
    </div>
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
  const others = useMemo(
    () => warehouses.filter((w) => w.id !== baseWarehouseId),
    [warehouses, baseWarehouseId],
  );

  // Multi-select of other warehouses to compare against the base.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => others.map((w) => w.id));
  const [resultsByWarehouse, setResultsByWarehouse] = useState<Record<string, WarehouseResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // vartest5: page design variant (1 cards · 2 report · 3 podium · 4 tiles · 5 minimal)
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

  // ── Auto-run ────────────────────────────────────────────────────────────
  // No Run button: entering the page (or changing the selection) runs the
  // simulation automatically for base + every selected warehouse.
  const handleRun = useCallback(() => {
    if (!baseEntry) return;
    const ids = [baseEntry.id, ...selectedIds];
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
  }, [baseEntry, selectedIds, warehouses, ordersByWarehouse, workerCount, warehouseProfile, laborProfile]);

  // Debounced auto-run on entry + selection change.
  const runRef = useRef(handleRun);
  useEffect(() => {
    runRef.current = handleRun;
  }, [handleRun]);
  useEffect(() => {
    if (!baseEntry) return;
    const t = setTimeout(() => runRef.current(), 250);
    return () => clearTimeout(t);
  }, [baseEntry?.id, selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSelected = others.length > 0 && selectedIds.length === others.length;

  // ── AI experiment insights ─────────────────────────────────────────────
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
  const baseByStrategy = cols[0]?.byStrategy;

  const rankEff = cols
    .map((col) => ({ col, eff: bestOf(col.byStrategy)?.efficiency ?? 0 }))
    .sort((a, b) => b.eff - a.eff);
  const topEff = Math.max(...rankEff.map((r) => r.eff)) || 1;

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
    </>
  );

  const aiBlock = hasResults ? (
    <ExperimentRecommendationCard
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

  const microLabel = (text: string) => (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      {text}
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Header — back button + title. */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onExit} title="Back to workspace">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">Compare Warehouses</h1>
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="text-muted-foreground">
          {cols.length} warehouse{cols.length !== 1 ? 's' : ''} in comparison
        </Badge>
      </div>

      {/* ── V1 · Cards (baseline) ───────────────────────────────────────── */}
      {variant === 1 && (
        scrollBody(
          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-surface p-4 space-y-4">
              {microLabel('Base warehouse')}
              <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                <span className="text-sm font-semibold text-foreground">{baseEntry.name}</span>
                <Badge variant="outline" className="text-muted-foreground">base</Badge>
              </div>
              {microLabel('Compare against')}
              {others.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other warehouses available. Add another warehouse first.
                </p>
              ) : (
                <div className="space-y-3">
                  <SelectionChips others={others} selectedIds={selectedIds} onToggle={toggleWarehouse} />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Select all
                  </label>
                </div>
              )}
            </section>

            {statusBlock}

            {hasResults && (
              <section className="rounded-lg border border-border bg-surface overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Simulation comparison</h2>
                  <p className="text-xs text-muted-foreground">
                    Each warehouse runs the same strategy set on its own orders. Delta vs the base warehouse is shown where relevant.
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {rankEff.map(({ col, eff }, rank) => {
                    const best = bestOf(col.byStrategy)!;
                    const isBase = col.entry.id === baseEntry.id;
                    return (
                      <div key={col.entry.id} className="rounded-xl border border-border bg-surface p-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                              rank === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {rank === 0 ? <Trophy className="h-3.5 w-3.5" /> : rank + 1}
                          </span>
                          <WhName name={col.entry.name} isBase={isBase} />
                          <div className="ml-auto text-right">
                            <span className="text-lg font-bold tabular-nums text-foreground">{fmtNumber(eff)}%</span>
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">eff.</span>
                            <div className="mt-0.5 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(eff / topEff) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                          {METRIC_DEFS.map((m) => (
                            <DeltaChip
                              key={m.key}
                              label={m.label}
                              base={isBase ? undefined : baseByStrategy?.[best.strategy]}
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
              </section>
            )}

            {aiBlock}
          </div>,
        )
      )}

      {/* ── V2 · Report (seamless white page, hairlines) ─────────────────── */}
      {variant === 2 && (
        <div className="flex-1 min-h-0 overflow-y-auto bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-6">
            {/* Setup — inline single line, no card. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-4">
              {microLabel('Base')}
              <span className="text-sm font-semibold text-foreground">{baseEntry.name}</span>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">base</Badge>
              <span className="mx-1 h-4 w-px bg-border" />
              {microLabel('Compare')}
              {others.length === 0 ? (
                <span className="text-sm text-muted-foreground">No other warehouses.</span>
              ) : (
                <SelectionChips others={others} selectedIds={selectedIds} onToggle={toggleWarehouse} />
              )}
              {others.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Select all
                </label>
              )}
            </div>

            <div className="mt-4">{statusBlock}</div>

            {hasResults && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-foreground">Results</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Best strategy per warehouse, ranked by efficiency.
                </p>
                <div className="mt-4 divide-y divide-border border-t border-border">
                  {rankEff.map(({ col, eff }, rank) => {
                    const best = bestOf(col.byStrategy)!;
                    const isBase = col.entry.id === baseEntry.id;
                    return (
                      <div key={col.entry.id} className="py-4">
                        <div className="flex items-center gap-4">
                          <span className="w-7 shrink-0 text-center text-sm font-bold text-muted-foreground">
                            {rank + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <WhName name={col.entry.name} isBase={isBase} />
                            <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(eff / topEff) * 100}%` }} />
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-bold tabular-nums text-foreground">{fmtNumber(eff)}%</span>
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">eff.</span>
                          </div>
                        </div>
                        <div className="mt-3 pl-11">
                          <MetricLine best={best} base={isBase ? undefined : baseByStrategy?.[best.strategy]} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiBlock && (
              <div className="mt-10 border-t border-border pt-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">AI suggestion</h2>
                {aiBlock}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── V3 · Podium (dark toolbar, top-3 podium) ─────────────────────── */}
      {variant === 3 && (
        scrollBody(
          <div className="space-y-6">
            {/* Dark toolbar. */}
            <div className="rounded-xl bg-foreground px-4 py-3 text-background">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-background/60">
                  Base · {baseEntry.name}
                </span>
                <span className="mx-1 h-4 w-px bg-background/20" />
                <span className="text-xs font-semibold uppercase tracking-wider text-background/60">
                  vs
                </span>
                {others.length === 0 ? (
                  <span className="text-sm text-background/60">No other warehouses.</span>
                ) : (
                  <SelectionChips dark others={others} selectedIds={selectedIds} onToggle={toggleWarehouse} />
                )}
              </div>
            </div>

            {statusBlock}

            {hasResults && (
              <section className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-sm font-semibold text-foreground">Podium</h2>
                <p className="text-xs text-muted-foreground">
                  Best efficiency per warehouse, ranked.
                </p>

                {/* Top-3 podium. */}
                <div className="mt-6 flex items-end justify-center gap-4">
                  {(() => {
                    const top3 = rankEff.slice(0, 3);
                    const order = [1, 0, 2]; // 2nd, 1st, 3rd on the podium
                    const heights = ['h-28', 'h-40', 'h-20'];
                    const labels = ['2nd', '1st', '3rd'];
                    return order.map((idx, pos) => {
                      const item = top3[idx];
                      if (!item) return <div key={pos} className="w-24" />;
                      const best = bestOf(item.col.byStrategy)!;
                      const isBase = item.col.entry.id === baseEntry.id;
                      return (
                        <div key={item.col.entry.id} className="flex w-28 flex-col items-center">
                          <span className="text-lg font-bold tabular-nums text-foreground">{fmtNumber(item.eff)}%</span>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{labels[pos]}</span>
                          <div
                            className={cn(
                              'mt-2 w-full rounded-t-lg flex flex-col items-center justify-end pb-2',
                              idx === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                              heights[idx],
                            )}
                          >
                            <span className="px-2 text-center text-xs font-semibold leading-tight">
                              {item.col.entry.name}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            {isBase && <Badge variant="outline" className="text-[10px] text-muted-foreground">base</Badge>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Full results, all warehouses. */}
                <div className="mt-8 space-y-3">
                  {rankEff.map(({ col, eff }, rank) => {
                    const best = bestOf(col.byStrategy)!;
                    const isBase = col.entry.id === baseEntry.id;
                    return (
                      <div key={col.entry.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                              rank === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {rank + 1}
                          </span>
                          <WhName name={col.entry.name} isBase={isBase} />
                          <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{fmtNumber(eff)}%</span>
                        </div>
                        <div className="mt-2">
                          <MetricLine best={best} base={isBase ? undefined : baseByStrategy?.[best.strategy]} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {aiBlock}
          </div>,
        )
      )}

      {/* ── V4 · Tiles (responsive stat-tile grid) ───────────────────────── */}
      {variant === 4 && (
        scrollBody(
          <div className="space-y-6">
            {/* Compact chips row. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                Base · {baseEntry.name}
              </span>
              <span className="mx-1 h-4 w-px bg-border" />
              {others.length === 0 ? (
                <span className="text-sm text-muted-foreground">No other warehouses.</span>
              ) : (
                <SelectionChips others={others} selectedIds={selectedIds} onToggle={toggleWarehouse} />
              )}
            </div>

            {statusBlock}

            {hasResults && (
              <div className="grid gap-4 md:grid-cols-2">
                {rankEff.map(({ col, eff }, rank) => {
                  const best = bestOf(col.byStrategy)!;
                  const isBase = col.entry.id === baseEntry.id;
                  return (
                    <div
                      key={col.entry.id}
                      className={cn(
                        'rounded-xl border bg-surface p-4',
                        rank === 0 ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                            rank === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {rank === 0 ? <Trophy className="h-3 w-3" /> : rank + 1}
                        </span>
                        <WhName name={col.entry.name} isBase={isBase} />
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <div className="text-2xl font-bold tabular-nums text-foreground">{fmtNumber(eff)}%</div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">best efficiency</div>
                        </div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(eff / topEff) * 100}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {METRIC_DEFS.map((m) => (
                          <DeltaChip
                            key={m.key}
                            label={m.label}
                            base={isBase ? undefined : baseByStrategy?.[best.strategy]}
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

            {aiBlock}
          </div>,
        )
      )}

      {/* ── V5 · Minimal (borderless, airy, slim rows) ───────────────────── */}
      {variant === 5 && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            {/* Setup — one quiet line. */}
            <p className="text-sm text-muted-foreground">
              Comparing <span className="font-semibold text-foreground">{baseEntry.name}</span>
              {others.length > 0 ? (
                <>
                  {' '}against{' '}
                  {selectedIds.length === 0 ? (
                    <span className="text-foreground">no one</span>
                  ) : (
                    <span className="font-semibold text-foreground">
                      {selectedIds.length} other{selectedIds.length > 1 ? 's' : ''}
                    </span>
                  )}
                </>
              ) : null}
            </p>
            {others.length > 0 && (
              <div className="mt-4 space-y-2">
                <SelectionChips others={others} selectedIds={selectedIds} onToggle={toggleWarehouse} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Select all
                </label>
              </div>
            )}

            <div className="mt-6">{statusBlock}</div>

            {hasResults && (
              <div className="mt-10">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Results</h2>
                <div className="mt-4 space-y-2">
                  {rankEff.map(({ col, eff }, rank) => {
                    const best = bestOf(col.byStrategy)!;
                    const isBase = col.entry.id === baseEntry.id;
                    return (
                      <div key={col.entry.id} className="py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground">{rank + 1}</span>
                          <WhName name={col.entry.name} isBase={isBase} />
                          <div className="ml-auto flex items-center gap-3">
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${(eff / topEff) * 100}%` }} />
                            </div>
                            <span className="w-14 text-right text-sm font-semibold tabular-nums text-foreground">{fmtNumber(eff)}%</span>
                          </div>
                        </div>
                        <div className="mt-1.5 pl-9">
                          <MetricLine best={best} base={isBase ? undefined : baseByStrategy?.[best.strategy]} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiBlock && (
              <div className="mt-12">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI suggestion</h2>
                {aiBlock}
              </div>
            )}
          </div>
        </div>
      )}

      {/* vartest5: floating segmented toolbar — switches page design (keys 1–5). */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex items-center gap-1.5">
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
          UI 1–5
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shadow-lg">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v as 1 | 2 | 3 | 4 | 5)}
              title={`UI variant ${v}`}
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
