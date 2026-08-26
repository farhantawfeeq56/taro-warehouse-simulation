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
 *      a table with each warehouse's key metrics per strategy.
 *
 * All state lives in TaroApp memory, so leaving the page loses nothing.
 */

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, GitCompareArrows, Loader2, Play, X } from 'lucide-react';
import { runSimulation, UnreachableLocationError } from '@/core/simulationEngine';
import { reconcile } from '@/lib/taro/corrector';
import type {
  Order,
  SimulationResults,
  StrategyResult,
  StrategyType,
  Warehouse,
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
}

/** Strategy label + short description for the table rows. */
const STRATEGY_META: Record<StrategyType, { label: string; description: string }> = {
  single: { label: 'Single Order', description: 'One worker, one order at a time' },
  batch: { label: 'Batch Picking', description: 'Group orders into batches' },
  zone: { label: 'Zone Picking', description: 'Workers own zones' },
};

interface WarehouseResult {
  id: string;
  name: string;
  /** Full results from the silent run (all 3 strategies). */
  results: SimulationResults;
}

const fmtNumber = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits });

function metricCell(
  base: StrategyResult | undefined,
  current: StrategyResult,
  pick: (r: StrategyResult) => number,
  format: (n: number) => string,
) {
  if (!base) {
    return <span>{format(pick(current))}</span>;
  }
  const b = pick(base);
  const c = pick(current);
  const diff = c - b;
  const pct = b !== 0 ? (diff / Math.abs(b)) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-1">
      {format(c)}
      {Math.abs(diff) > 1e-9 && (
        <span
          className={cn(
            'text-[10px] font-medium',
            diff < 0 ? 'text-positive' : 'text-destructive',
          )}
        >
          {diff < 0 ? '▼' : '▲'}
          {fmtNumber(Math.abs(pct), 0)}%
        </span>
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

  // ── Table assembly ──────────────────────────────────────────────────────
  // Each row is a single metric for a single strategy. Columns are warehouses
  // (base first). This makes the mapping of values → columns unambiguous.
  type TableRow = {
    key: string;
    label: string;
    description?: string;
    strategy: StrategyType;
    /** Format a numeric metric. Absent on label-only rows (best strategy). */
    format?: (n: number) => string;
    pick?: (r: StrategyResult) => number;
    /** True for the summary label row (shows a badge, not a number). */
    labelRow?: boolean;
    /** Group-header rows span the full width and split the table by strategy. */
    groupHeader?: boolean;
  };
  const table = useMemo(() => {
    if (!baseEntry) return null;
    const columnWarehouses = [baseEntry.id, ...selectedIds]
      .map((id) => warehouses.find((w) => w.id === id))
      .filter(Boolean) as WorkspaceWarehouse[];

    // Results for the columns, in order, with strategies indexed by type.
    const colResults = columnWarehouses.map((w) => {
      const whRes = resultsByWarehouse[w.id];
      if (!whRes) return null;
      const byStrategy = Object.fromEntries(
        whRes.results.strategies.map((s) => [s.strategy, s]),
      ) as Record<StrategyType, StrategyResult>;
      return { entry: w, byStrategy };
    });
    const hasResults = colResults.some((c) => c !== null);

    const rows: TableRow[] = [];
    const metricDefs: {
      key: string;
      label: string;
      pick: (r: StrategyResult) => number;
      format: (n: number) => string;
    }[] = [
      { key: 'time', label: 'Est. Time', pick: (r) => r.estimatedTime, format: (n) => `${fmtNumber(n)} min` },
      { key: 'dist', label: 'Total Distance', pick: (r) => r.totalDistance, format: (n) => `${fmtNumber(n)} m` },
      { key: 'eff', label: 'Efficiency', pick: (r) => r.efficiency, format: (n) => `${fmtNumber(n)}%` },
      { key: 'util', label: 'Worker Util.', pick: (r) => r.workerUtilization, format: (n) => `${fmtNumber(n)}%` },
      { key: 'cost', label: 'Cost / Order', pick: (r) => r.costPerOrder, format: (n) => `$${fmtNumber(n, 2)}` },
      { key: 'orders', label: 'Orders Done', pick: (r) => r.ordersCompleted, format: (n) => `${fmtNumber(n, 0)}` },
    ];

    for (const [strategy, meta] of Object.entries(STRATEGY_META) as [StrategyType, { label: string; description: string }][]) {
      // Group header row so the table reads as sections, not one long list.
      rows.push({
        key: `group-${strategy}`,
        groupHeader: true,
        label: meta.label,
        description: meta.description,
        strategy,
      });
      for (const m of metricDefs) {
        rows.push({
          key: `${strategy}-${m.key}`,
          label: m.label,
          strategy,
          pick: m.pick,
          format: m.format,
        });
      }
    }
    // Summary row: each warehouse's best strategy.
    rows.push({
      key: 'best-strategy',
      label: 'Best Strategy',
      description: 'Highest-efficiency strategy per warehouse',
      strategy: 'single' as StrategyType,
      pick: (r) => r.efficiency,
      labelRow: true,
    });

    return { rows, colResults, hasResults };
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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Header — back button + title. */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Button variant="ghost" size="icon-sm" onClick={onExit} title="Back to workspace">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold text-foreground">Compare Warehouses</h1>
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="text-muted-foreground">
          {table?.colResults.length} warehouse{table?.colResults.length && table.colResults.length > 1 ? 's' : ''} in comparison
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
                  <Button
                    onClick={handleRun}
                    disabled={isRunning || selectedIds.length === 0}
                    size="sm"
                    className="gap-1.5"
                  >
                    {isRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {isRunning ? 'Running…' : 'Run Comparison'}
                  </Button>
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

          {/* Results table. */}
          {table && table.hasResults && (
            <section className="rounded-lg border border-border bg-surface overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Simulation comparison</h2>
                <p className="text-xs text-muted-foreground">
                  Each warehouse runs the same strategy set on its own orders. Delta vs the base warehouse is shown in the table.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">
                        Metric
                      </th>
                      {table.colResults.map((c, i) => (
                        <th
                          key={c?.entry.id ?? `col-${i}`}
                          className={cn(
                            'h-10 px-3 text-left align-middle font-medium whitespace-nowrap',
                            i === 0 ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            {c?.entry.name}
                            {i === 0 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                base
                              </Badge>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) =>
                      row.groupHeader ? (
                        <tr key={row.key} className="border-b border-border bg-muted/50">
                          <td
                            colSpan={table.colResults.length + 1}
                            className="px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                                {row.label}
                              </span>
                              {row.description && (
                                <span className="text-[11px] text-muted-foreground">
                                  {row.description}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                      <tr key={row.key} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 align-middle whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.label}</span>
                            {row.description && (
                              <span className="text-[10px] text-muted-foreground">{row.description}</span>
                            )}
                          </div>
                        </td>
                        {table.colResults.map((c, i) => {
                          // Column without results (not yet run / no data).
                          if (!c) {
                            return (
                              <td key={`empty-${i}`} className="px-3 py-2 text-muted-foreground">
                                —
                              </td>
                            );
                          }
                          const sr = c.byStrategy[row.strategy];
                          if (!sr) {
                            return (
                              <td key={c.entry.id} className="px-3 py-2 text-muted-foreground">
                                —
                              </td>
                            );
                          }
                          if (row.labelRow) {
                            const best = Object.values(c.byStrategy)
                              .filter(Boolean)
                              .sort((a, b) => b.efficiency - a.efficiency)[0];
                            return (
                              <td key={c.entry.id} className="px-3 py-2 whitespace-nowrap">
                                <Badge variant="secondary">
                                  {best ? STRATEGY_META[best.strategy].label : '—'}
                                </Badge>
                              </td>
                            );
                          }
                          return (
                            <td key={c.entry.id} className="px-3 py-2 whitespace-nowrap">
                              {metricCell(
                                i === 0 ? undefined : table.colResults[0]?.byStrategy[row.strategy],
                                sr,
                                row.pick!,
                                row.format!,
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
