'use client';

/**
 * CompareView — a dedicated "special page" (in-app route) for comparing
 * warehouse simulations side by side.
 *
 * Flow (locked in):
 *   1. The user clicked "Compare" on a warehouse. Entering this page
 *      AUTOMATICALLY runs the simulation for EVERY warehouse (no selection,
 *      no Run button — all warehouses compete).
 *   2. The page shows, top to bottom: a quiet AI suggestion line, then the
 *      ranked results in the Editorial style (big-type banner rows, hairline
 *      separators, labeled metrics with deltas vs the base warehouse).
 *
 * The AI experiment suggestion is NOT a card in the page flow anymore — it
 * surfaces as one of 5 light forms (banner / bubble / rail / toast / line)
 * via AiSuggestion, switched by the floating segmented control in the
 * bottom-right corner (keys 1–5).
 *
 * All state lives in TaroApp memory, so leaving the page loses nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  GitCompareArrows,
  Loader2,
} from 'lucide-react';
import { AiSuggestion } from './experiment-recommendation-card';
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

/** Strategy label for the results. */
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

/** Labeled metric + delta vs base. */
function MetricValue({
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
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{format(c)}</span>
      {b !== undefined && Math.abs(diff) > 1e-9 && (
        <span className={cn('text-[10px] font-medium', diff < 0 ? 'text-positive' : 'text-destructive')}>
          {diff < 0 ? '▼' : '▲'}{fmtNumber(Math.abs(pct), 0)}%
        </span>
      )}
    </span>
  );
}

/** The full labeled metric strip (deltas vs base). */
function MetricStrip({ best, base }: { best: StrategyResult; base?: StrategyResult }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
      {METRIC_DEFS.map((m) => (
        <MetricValue
          key={m.key}
          label={m.label}
          base={base}
          current={best}
          pick={m.pick}
          format={m.format}
        />
      ))}
    </div>
  );
}

function bestOf(byStrategy: Record<StrategyType, StrategyResult>): StrategyResult | undefined {
  return Object.values(byStrategy).filter(Boolean).sort((a, b) => b.efficiency - a.efficiency)[0];
}

function WhName({ name, isBase, className }: { name: string; isBase?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-sm font-semibold text-foreground', className)}>
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

  // vartest5: AI-suggestion form variant (1 banner · 2 bubble · 3 rail · 4 toast · 5 line)
  const [aiVariant, setAiVariant] = useState<1 | 2 | 3 | 4 | 5>(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setAiVariant(n as 1 | 2 | 3 | 4 | 5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  // Base's best strategy result — the reference for every delta chip.
  const baseBest = baseByStrategy ? bestOf(baseByStrategy) : undefined;

  const rankEff = cols
    .map((col) => ({ col, eff: bestOf(col.byStrategy)?.efficiency ?? 0 }))
    .sort((a, b) => b.eff - a.eff);
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

  const aiSuggestion = hasResults ? (
    <AiSuggestion
      insights={insights}
      isRunning={isRunning}
      onGenerate={onGenerateExperiment}
      variant={aiVariant}
      onVariantChange={setAiVariant}
    />
  ) : null;

  const scrollBody = (children: React.ReactNode) => (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
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
          {cols.length} warehouse{cols.length !== 1 ? 's' : ''} · {baseEntry.name} is base
        </Badge>
      </div>

      {statusBlock && <div className="mx-auto w-full max-w-5xl px-6 pt-4">{statusBlock}</div>}

      {/* Editorial (locked in): big-type banner rows, hairline separators. */}
      {scrollBody(
        <div className="space-y-6">
          {/* AI suggestion — a quiet line above the rankings (form varies via AiSuggestion). */}
          {aiSuggestion}

          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">Warehouse rankings</h2>
            <span className="text-xs text-muted-foreground">best strategy · efficiency</span>
          </div>
          {hasResults && (
            <div>
              {rankEff.map(({ col, eff }, rank) => {
                const best = bestOf(col.byStrategy)!;
                const isBase = col.entry.id === baseEntry.id;
                return (
                  <div key={col.entry.id} className="border-b border-border py-6 last:border-0">
                    <div className="flex items-baseline gap-4">
                      <span className="text-4xl font-bold tabular-nums text-muted-foreground/30">
                        {String(rank + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <WhName name={col.entry.name} isBase={isBase} className="text-lg" />
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {STRATEGY_META[best.strategy].label} · delta vs base
                        </div>
                      </div>
                      <span className="ml-auto text-3xl font-bold tabular-nums text-foreground">
                        {fmtNumber(eff)}<span className="ml-0.5 text-base font-medium text-muted-foreground">%</span>
                      </span>
                    </div>
                    <div className="mt-3 pl-14">
                      <MetricStrip best={best} base={isBase ? undefined : baseBest} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>,
      )}
    </div>
  );
}
