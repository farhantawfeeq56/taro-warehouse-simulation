'use client';

import type { SimulationResults, StrategyResult, StrategyType, SimulationValidationContext } from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, CheckCircle2, Circle } from 'lucide-react';

interface ResultsBlockState {
  simulationState?: 'NO_VALID_ITEMS';
  title: string;
  description: string;
}

interface ResultsPanelProps {
  results: SimulationResults | null;
  readiness?: SimulationReadiness;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
  executionPlan: StrategyResult | null;
  validationContext?: SimulationValidationContext | null;
  blockState?: ResultsBlockState | null;
  onViewUnresolvableItems?: (itemIds: string[]) => void;
}

export function ResultsPanel({
  results,
  readiness,
  isSimulating,
  activeStrategy,
  onStrategySelect,
  animationProgress,
  workerCount,
  executionPlan,
  validationContext,
  blockState,
  onViewUnresolvableItems,
}: ResultsPanelProps) {
  const strategies = results?.strategies ?? [];
  const simulatedItemCount = validationContext
    ? validationContext.totalItems - validationContext.missingItems
    : null;

  const sortedStrategies = [...strategies].sort((a, b) => {
    if (a.strategy === 'single') return 1;
    if (b.strategy === 'single') return -1;
    if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
    if (a.criticalPathDistance !== b.criticalPathDistance) return a.criticalPathDistance - b.criticalPathDistance;
    if (a.estimatedTime !== b.estimatedTime) return a.estimatedTime - b.estimatedTime;
    return a.costPerOrder - b.costPerOrder;
  });

  if (!isSimulating && !results) {
    if (blockState) {
      return (
        <div className="w-80 border-l border-border bg-background flex flex-col">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-muted-foreground text-sm">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40 text-amber-600" />
              <p className="font-semibold text-foreground">{blockState.title}</p>
              <p className="text-xs mt-2">{blockState.description}</p>
              {!readiness?.isReady && (
                <div className="mt-6 space-y-2 text-left border-t border-border pt-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Readiness Checklist</p>
                  {readiness?.conditions.map((condition) => (
                    <div key={condition.id} className="flex items-center gap-2">
                      {condition.isMet ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                      )}
                      <span className={cn(
                        "text-[11px]",
                        condition.isMet ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {condition.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground text-sm w-full">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-foreground mb-4">Simulation Readiness</p>
            <div className="space-y-3 max-w-[220px] mx-auto border border-border/50 rounded-lg p-4 bg-muted/20">
              {readiness?.conditions.map((condition) => (
                <div key={condition.id} className="flex items-center gap-3 text-left">
                  {condition.isMet ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  )}
                  <span className={cn(
                    "text-xs",
                    condition.isMet ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {condition.label}
                  </span>
                </div>
              ))}
            </div>
            {!readiness?.isReady ? (
              <p className="text-[11px] mt-6 text-muted-foreground/80 leading-relaxed italic px-4">
                All requirements must be met before simulation can be performed.
              </p>
            ) : (
              <p className="text-[11px] mt-6 text-emerald-600 font-medium px-4">
                Ready to simulate! Click the Simulate button to start.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isSimulating) {
    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground text-sm">
            <div className="animate-spin h-8 w-8 border-2 border-muted-foreground border-t-transparent rounded-full mx-auto mb-3" />
            <p>Running all strategies…</p>
            <p className="text-xs mt-1">Preparing route animation and results.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!results) return null;

  const activeResult = activeStrategy
    ? results.strategies.find((strategy) => strategy.strategy === activeStrategy) ?? null
    : null;
  const baseline = results.strategies.find((strategy) => strategy.strategy === 'single') ?? null;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
          <Badge variant="outline" className="text-xs">
            {results.strategies.length} strategies
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="space-y-1.5">
          {sortedStrategies.map((strategy) => {
            const isSelected = activeStrategy === strategy.strategy;
            const isBest = strategy.strategy === results.bestStrategy;
            const isBaseline = strategy.strategy === 'single';

            return (
              <button
                key={strategy.strategy}
                onClick={() => onStrategySelect(strategy.strategy)}
                className={cn(
                  'w-full text-left border rounded p-2 transition-all',
                  isSelected
                    ? 'border-[#D8D8D8] bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-muted-foreground/50',
                  isBaseline && 'opacity-70'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  )}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                  </div>
                  <span className={cn('text-sm truncate', isBaseline ? 'text-muted-foreground font-medium' : 'font-semibold text-foreground')}>
                    {strategy.strategyName}
                  </span>
                  {!isBaseline && (
                    <span className="text-sm font-bold text-green-600 dark:text-green-400 shrink-0">{strategy.efficiency}%</span>
                  )}
                  <div className="flex-1" />
                  {isBest && !isBaseline && (
                    <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      Best
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 ml-5 text-xs text-muted-foreground">
                  <span className="font-mono">{strategy.totalDistance}m</span>
                  <span className="text-[10px] opacity-50">•</span>
                  <span className="font-mono">{strategy.estimatedTime} min</span>
                  <span className="text-[10px] opacity-50">•</span>
                  <span className="font-mono">${strategy.costPerOrder}</span>
                </div>
              </button>
            );
          })}
        </div>

        {activeResult?.workerRoutes && activeResult.workerRoutes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Worker Allocation
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{workerCount} configured</span>
              </div>
            </div>
            <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2">
              {activeResult.workerRoutes.map((worker) => {
                const totalPicks = worker.assignedPickCount;
                // Distribute picks proportionally across the route animation
                // This is simpler and more reliable than trying to match pick positions in the route
                // (which fails because pick positions are on shelves but routes use nearest walkable cells)
                const completedPicks = Math.min(
                  totalPicks,
                  Math.floor(totalPicks * animationProgress)
                );
                const progress = totalPicks > 0 ? (completedPicks / totalPicks) * 100 : 0;

                return (
                  <div key={worker.workerId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">Worker {worker.workerId}</span>
                      <span className="font-mono text-muted-foreground">{completedPicks} / {totalPicks} picks</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border/50">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress}%`, backgroundColor: worker.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {executionPlan && (
          <div className="space-y-3 border border-emerald-300/70 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-lg p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Execution Plan Output
            </div>

            <div className="space-y-2">
              {executionPlan.workerRoutes.map((worker) => (
                <div key={worker.workerId} className="border border-border rounded-md bg-background p-2">
                  <div className="text-xs font-semibold mb-1">Worker {worker.workerId}</div>
                  <ol className="space-y-1 text-xs">
                    {worker.tasks.map((task) => (
                      <li key={`${worker.workerId}-${task.step}`} className="font-mono">
                        {task.step}. {task.zone ? `${task.zone} → ` : ''}{task.location} ({task.item})
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1">
              <div className="font-semibold">Route Order</div>
              {executionPlan.workerRoutes.map((worker) => (
                <div key={`route-${worker.workerId}`} className="font-mono text-muted-foreground">
                  Worker {worker.workerId}: Start → {worker.tasks.map((task) => task.location).join(' → ') || 'No picks'}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="border border-border rounded-md p-2 bg-background">
                <div className="text-muted-foreground">Distance</div>
                <div className="font-bold font-mono">{executionPlan.totalDistance}m</div>
              </div>
              <div className="border border-border rounded-md p-2 bg-background">
                <div className="text-muted-foreground">Time</div>
                <div className="font-bold font-mono">{executionPlan.estimatedTime} min</div>
              </div>
              <div className="border border-border rounded-md p-2 bg-background">
                <div className="text-muted-foreground">Efficiency</div>
                <div className="font-bold font-mono">{executionPlan.efficiency}%</div>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <div className="font-semibold">Feedback</div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>
                  This plan minimizes critical travel by distributing picks across workers in parallel zones.
                </li>
                <li>
                  Compared with the baseline, distance improves by{' '}
                  {baseline ? Math.max(0, baseline.totalDistance - executionPlan.totalDistance) : 0}m and time by{' '}
                  {baseline ? Math.max(0, baseline.estimatedTime - executionPlan.estimatedTime) : 0} minutes.
                </li>
                <li>
                  Compared with other simulated strategies, this selected plan achieved the top efficiency score at {executionPlan.efficiency}%.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        Best strategy auto-plays on run. Click any strategy to compare its route.
      </div>
    </div>
  );
}
