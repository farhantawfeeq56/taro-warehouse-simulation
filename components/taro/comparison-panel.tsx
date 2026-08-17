'use client';

import { useState } from 'react';
import type { Comparison, ComparisonRunResult, WorkspaceWarehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  GitCompareArrows,
  Play,
  Loader2,
  Plus,
  X,
  Trophy,
  TrendingUp,
  MapPin,
  Clock,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface ComparisonPanelProps {
  comparison: Comparison;
  warehouses: WorkspaceWarehouse[];
  results: ComparisonRunResult[] | null;
  isRunning: boolean;
  /** When true, the comparison's current results are outdated. */
  isStale?: boolean;
  allWarehouseNames: Record<string, string>; // warehouseId → name
  onRun: (comparisonId: string) => void;
  onAddWarehouse: (comparisonId: string, warehouseId: string) => void;
  onRemoveWarehouse: (comparisonId: string, warehouseId: string) => void;
}

function ResultCard({
  result,
  isWinner,
}: {
  result: ComparisonRunResult;
  isWinner: boolean;
}) {
  const best = result.bestResult;
  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${
        isWinner
          ? 'border-warning/70 bg-warning-soft/60 ring-1 ring-warning/40'
          : 'border-border bg-muted/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isWinner && <Trophy className="h-4 w-4 text-warning shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate">
            {result.warehouseName}
          </span>
        </div>
        {isWinner && (
          <Badge className="text-[10px] bg-warning-soft text-warning border-warning/30">
            Best
          </Badge>
        )}
      </div>

      {result.error ? (
        <p className="text-xs text-destructive">{result.error}</p>
      ) : best ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Distance</span>
            <span className="font-mono font-semibold ml-auto">{best.totalDistance}m</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Time</span>
            <span className="font-mono font-semibold ml-auto">{best.estimatedTime} min</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Efficiency</span>
            <span className="font-mono font-semibold ml-auto">{best.efficiency}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Cost</span>
            <span className="font-mono font-semibold ml-auto">${best.costPerOrder}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No result available</p>
      )}
    </div>
  );
}

export function ComparisonPanel({
  comparison,
  warehouses,
  results,
  isRunning,
  isStale,
  allWarehouseNames,
  onRun,
  onAddWarehouse,
  onRemoveWarehouse,
}: ComparisonPanelProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  // Determine the winner. Guard against all-failure runs where results is
  // non-empty but the filtered valid list is empty — reduce() on an empty
  // array throws.
  const validResults = results?.filter((r) => r.bestResult && !r.error) ?? [];
  const winnerId =
    validResults.length > 0
      ? validResults.reduce((best, current) =>
          (current.bestResult?.efficiency ?? 0) >
          (best.bestResult?.efficiency ?? 0)
            ? current
            : best,
        ).warehouseId
      : null;

  const canAdd = comparison.warehouseIds.length < warehouses.length;

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <GitCompareArrows className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground truncate">
            {comparison.name}
          </h2>
          {isStale && results && (
            <span
              className="text-[10px] font-medium text-warning bg-warning-soft px-1.5 py-0.5 rounded border border-warning/30 shrink-0"
              title="Results are stale — a member warehouse or orders changed since the last run"
            >
              Stale
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onRun(comparison.id)}
            disabled={
              isRunning ||
              comparison.warehouseIds.length === 0
            }
            className={`h-7 text-xs flex-1 ${
              isStale && results
                ? 'bg-warning hover:bg-warning/90 text-white'
                : ''
            }`}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Running…
              </>
            ) : isStale && results ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                Re-run
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Run
              </>
            )}
          </Button>

          {/* Add warehouse dropdown */}
          {canAdd && (
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDropdown(!showDropdown)}
                className="h-7 text-xs px-2"
                title="Add a warehouse to this comparison"
              >
                <Plus className="h-3 w-3" />
              </Button>
              {showDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg z-50 w-48 max-h-48 overflow-y-auto">
                  {warehouses
                    .filter((w) => !comparison.warehouseIds.includes(w.id))
                    .map((w) => (
                      <button
                        key={w.id}
                        onClick={() => {
                          onAddWarehouse(comparison.id, w.id);
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors truncate"
                      >
                        {w.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Members + Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {comparison.warehouseIds.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Add warehouses, then run to compare.
          </p>
        ) : results ? (
          // Show results
          comparison.warehouseIds.map((wid) => {
            const result = results.find((r) => r.warehouseId === wid);
            if (!result) {
              return (
                <div
                  key={wid}
                  className="flex items-center justify-between border rounded-lg p-3 border-border bg-muted/10"
                >
                  <span className="text-xs font-medium truncate">
                    {allWarehouseNames[wid] ?? wid}
                  </span>
                  <button
                    onClick={() => onRemoveWarehouse(comparison.id, wid)}
                    className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Remove from comparison"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            }
            return (
              <div key={wid} className="relative">
                <ResultCard result={result} isWinner={wid === winnerId} />
                <button
                  onClick={() => onRemoveWarehouse(comparison.id, wid)}
                  className="absolute top-2 right-2 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Remove from comparison"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })
        ) : (
          // Show members list (before run)
          comparison.warehouseIds.map((wid) => (
            <div
              key={wid}
              className="flex items-center justify-between border rounded-lg p-2 border-border bg-muted/10"
            >
              <span className="text-xs font-medium truncate">
                {allWarehouseNames[wid] ?? wid}
              </span>
              <button
                onClick={() => onRemoveWarehouse(comparison.id, wid)}
                className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                title="Remove from comparison"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
