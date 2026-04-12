'use client';

import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';

interface ResultsPanelProps {
  results: SimulationResults | null;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
  executionPlan: StrategyResult | null;
}

export function ResultsPanel({
  results,
  isSimulating,
  activeStrategy,
  onStrategySelect,
  animationProgress,
  workerCount,
  executionPlan,
}: ResultsPanelProps) {
  const strategies = results?.strategies ?? [];

  const sortedStrategies = useMemo(() => {
    return [...strategies].sort((a, b) => {
      if (a.strategy === 'single') return 1;
      if (b.strategy === 'single') return -1;
      if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
      if (a.criticalPathDistance !== b.criticalPathDistance) return a.criticalPathDistance - b.criticalPathDistance;
      if (a.estimatedTime !== b.estimatedTime) return a.estimatedTime - b.estimatedTime;
      return a.costPerOrder - b.costPerOrder;
    });
  }, [strategies]);

  if (!results && !isSimulating) {
    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground text-sm">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">To run a simulation:</p>
            <ol className="text-xs mt-3 space-y-1 text-left inline-block">
              <li>1. Place shelves and items</li>
              <li>2. Add orders</li>
              <li>3. Place worker start</li>
              <li>4. Click &apos;Simulate Strategies&apos;</li>
            </ol>
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

  const workerPickMilestones = useMemo(() => {
    if (!activeResult?.workerRoutes) return [];

    return activeResult.workerRoutes.map((worker) => {
      const milestones: { index: number; pickCount: number }[] = [];
      let lastRouteIndex = 0;

      for (const pick of worker.picks) {
        for (let i = lastRouteIndex; i < worker.route.length; i++) {
          const point = worker.route[i];
          if (point.x === pick.x && point.y === pick.y) {
            milestones.push({ index: i, pickCount: pick.pickCount || 1 });
            lastRouteIndex = i + 1;
            break;
          }
        }
      }
      return milestones;
    });
  }, [activeResult]);

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
                    <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 shrink-0">
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
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Worker Allocation</div>
              <span className="text-xs font-mono text-muted-foreground">{workerCount} configured</span>
            </div>
            <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2">
              {activeResult.workerRoutes.map((worker, idx) => {
                const milestones = workerPickMilestones[idx] || [];
                const visiblePoints = Math.max(1, Math.floor(worker.route.length * animationProgress));
                
                // Count how many picks are completed based on current route position
                // A pick is completed when its route index is less than visiblePoints
                const completedPicks = milestones.reduce((sum, m) => {
                  return m.index < visiblePoints ? sum + m.pickCount : sum;
                }, 0);
                
                const totalPicks = worker.assignedPickCount;
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
