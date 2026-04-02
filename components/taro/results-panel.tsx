'use client';

import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Activity, Play, Pause, Download, Clipboard, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateTaskCSV, downloadCSV } from '@/lib/taro/csv';

interface ResultsPanelProps {
  results: SimulationResults | null;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
}

export function ResultsPanel({
  results,
  isSimulating,
  activeStrategy,
  onStrategySelect,
  animationProgress,
  workerCount,
}: ResultsPanelProps) {
  const [replayProgress, setReplayProgress] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync replayProgress with the animationProgress driven from the parent
  useEffect(() => {
    setReplayProgress(animationProgress);
  }, [animationProgress]);

  useEffect(() => {
    if (!isReplaying) return;

    let animationId: number;
    const startTime = performance.now();
    const speed = 1;
    const duration = 3000;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min((elapsed * speed) / duration, 1);
      setReplayProgress(progress);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        setIsReplaying(false);
      }
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isReplaying]);

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
            <p>Running simulation...</p>
          </div>
        </div>
      </div>
    );
  }

  // Guard against null results
  if (!results) {
    return null;
  }

  // At this point, results is guaranteed to be non-null
  const resultsData = results;

  // Sort strategies with strict hierarchy: baseline always at bottom, then efficiency desc, then distance asc, time asc, cost asc
  const sortedStrategies = [...resultsData.strategies].sort((a, b) => {
    // Always put baseline ('single') at the bottom
    if (a.strategy === 'single') return 1;
    if (b.strategy === 'single') return -1;
    // Primary: efficiency descending
    if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
    // Tie-breaker 1: distance ascending
    if (a.distance !== b.distance) return a.distance - b.distance;
    // Tie-breaker 2: time ascending
    if (a.estimatedTime !== b.estimatedTime) return a.estimatedTime - b.estimatedTime;
    // Tie-breaker 3: cost ascending
    return a.costPerOrder - b.costPerOrder;
  });

  const renderHeader = () => {
    return (
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
          <Badge variant="outline" className="text-xs">
            {resultsData.strategies.length} strategies
          </Badge>
        </div>
      </div>
    );
  };

  const renderStrategyList = () => {
    return (
      <div className="space-y-1.5">
        {sortedStrategies.map((strategy) => {
          const isSelected = activeStrategy === strategy.strategy;
          const isBest = strategy.strategy === resultsData.bestStrategy;
          const isBaseline = strategy.strategy === 'single';

          return (
            <button
              key={strategy.strategy}
              onClick={() => onStrategySelect(strategy.strategy)}
              className={cn(
                'w-full text-left border rounded p-2 transition-all',
                isSelected
  								? 'border-primary bg-primary/5 shadow-sm'
  								: 'border-border bg-card hover:border-muted-foreground/50',
                isBaseline && 'opacity-70'
              )}
            >
              {/* Line 1: Radio + Name + Efficiency + Best tag */}
              <div className="flex items-center gap-2">
                {/* Radio button */}
                <div className={cn(
                  'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                  isSelected
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40'
                )}>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>

                {/* Strategy name */}
                <span className={cn(
                  'text-sm truncate',
                  isBaseline ? 'text-muted-foreground font-medium' : 'font-semibold text-foreground'
                )}>
                  {strategy.strategyName}
                </span>

                {/* Efficiency % - prominent for non-baseline */}
                {!isBaseline && (
                  <span className="text-sm font-bold text-green-600 dark:text-green-400 shrink-0">
                    {strategy.efficiency}%
                  </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Best tag */}
                {isBest && !isBaseline && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 shrink-0">
                    Best
                  </Badge>
                )}
              </div>

              {/* Line 2: Compact metrics - distance • time • cost */}
              <div className="flex items-center gap-1.5 mt-0.5 ml-5 text-xs text-muted-foreground">
                <span className="font-mono">{strategy.distance}m</span>
                <span className="text-[10px] opacity-50">•</span>
                <span className="font-mono">{strategy.estimatedTime} min</span>
                <span className="text-[10px] opacity-50">•</span>
                <span className="font-mono">${strategy.costPerOrder}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderWorkerAllocation = () => {
    if (!activeStrategy) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Worker Allocation
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {workerCount} worker{workerCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-3">
          {(() => {
            const activeResult = resultsData.strategies.find(s => s.strategy === activeStrategy);
            if (!activeResult?.workerRoutes || activeResult.workerRoutes.length === 0) {
              return <div className="text-xs text-muted-foreground">No worker allocation</div>;
            }

            return activeResult.workerRoutes.map((worker) => {
              const progress = replayProgress;

              return (
                <div key={worker.workerId} className="space-y-1.5 pb-3 border-b border-border/50 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: worker.color }}
                    />
                    <span className="text-xs font-semibold text-foreground">
                      Worker {worker.workerId}
                    </span>
                    {worker.assignedPickCount === 0 && (
                      <span className="text-xs text-muted-foreground italic">(idle)</span>
                    )}
                  </div>
                  <div className="ml-3.5 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Assigned Picks:</span>
                      <span className="font-mono text-foreground">{worker.assignedPickCount} items</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Progress:</span>
                        <span className="font-mono text-foreground">{Math.round(progress * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border/50">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round(progress * 100)}%`,
                            backgroundColor: worker.color,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-muted-foreground">
                      <span className="text-xs">{worker.route.length} steps</span>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  };

  const renderExportTasks = () => {
    if (!activeStrategy) return null;

    const activeResult = resultsData.strategies.find(s => s.strategy === activeStrategy);
    const workerRoutes = activeResult?.workerRoutes;
    if (!workerRoutes || workerRoutes.length === 0) return null;

    const handleDownload = () => {
      const csv = generateTaskCSV(workerRoutes);
      downloadCSV(csv, `tasks-${activeStrategy}.csv`);
    };

    const handleCopy = () => {
      const csv = generateTaskCSV(workerRoutes);
      navigator.clipboard.writeText(csv).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };

    return (
      <div className="border border-border rounded-lg p-3 space-y-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Export Tasks
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Export the current worker task list as a CSV file to share with workers.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
          >
            <Download className="h-3 w-3" />
            Download CSV
          </button>
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border bg-muted/30 text-foreground text-xs rounded hover:bg-muted transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-600" />
                <span className="text-green-600">Copied</span>
              </>
            ) : (
              <>
                <Clipboard className="h-3 w-3" />
                Copy CSV
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderRouteReplay = () => {
    if (!activeStrategy) return null;

    return (
      <div className="border border-border rounded-lg p-3 space-y-3">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Route Replay
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsReplaying(!isReplaying)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
          >
            {isReplaying ? (
              <>
                <Pause className="h-3 w-3" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Play
              </>
            )}
          </button>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${replayProgress * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      {renderHeader()}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {renderStrategyList()}
        {renderWorkerAllocation()}
        {renderExportTasks()}
        {renderRouteReplay()}
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        Click a strategy to visualize its route on the canvas.
      </div>
    </div>
  );
}
