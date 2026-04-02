'use client';

import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock, Route, Users, DollarSign, Activity, Play, Pause, Zap, Download, Clipboard, Check, ChevronDown, ChevronUp } from 'lucide-react';
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
  uiVariant,
}: ResultsPanelProps) {
  const [replayProgress, setReplayProgress] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOtherStrategies, setShowOtherStrategies] = useState(false);

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

  // Calculate insights
  const bestResult = resultsData.strategies.find(s => s.strategy === resultsData.bestStrategy);
  const baselineResult = resultsData.strategies.find(s => s.strategy === 'single');
  const savingsDistance = baselineResult ? baselineResult.distance - (bestResult?.distance || 0) : 0;

  // Render functions for different UI variants
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

  const renderSummary = () => {
    return (
      <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-2">
        <div className="text-xs text-muted-foreground font-medium">EFFICIENCY GAIN</div>
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold text-green-600">
            {bestResult?.efficiency || 0}%
          </div>
          <div className="text-sm text-muted-foreground">
            vs Single Order
          </div>
        </div>
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          Using <span className="font-medium capitalize text-foreground">{resultsData.bestStrategy}</span> strategy
        </div>
      </div>
    );
  };

  const renderInsight = () => {
    if (savingsDistance <= 0) return null;
    return (
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded p-3 space-y-1">
        <div className="flex items-start gap-2">
          <div className="mt-1">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            <span className="font-medium">{resultsData.bestStrategy.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</span> reduces walking distance by <span className="font-semibold">{savingsDistance}m</span> compared to single order picking.
          </div>
        </div>
      </div>
    );
  };

  const renderStrategyCards = () => {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Strategy Breakdown
        </div>
        {resultsData.strategies.map((strategy) => (
          <StrategyCard
            key={strategy.strategy}
            strategy={strategy}
            isBest={strategy.strategy === resultsData.bestStrategy}
            isActive={activeStrategy === strategy.strategy}
            onClick={() => onStrategySelect(strategy.strategy)}
          />
        ))}
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

  const renderMetricsTable = (selectable: boolean = false) => {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Detailed Metrics
        </div>
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-2 font-medium">Strategy</th>
                <th className="text-right p-2 font-medium">Distance</th>
                <th className="text-right p-2 font-medium">Time</th>
                <th className="text-right p-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {resultsData.strategies.map((s) => (
                <tr
                  key={s.strategy}
                  onClick={() => selectable && onStrategySelect(s.strategy)}
                  className={cn(
                    'border-t border-border transition-colors',
                        s.strategy === resultsData.bestStrategy && 'bg-green-50 dark:bg-green-950/20',
                        selectable && 'cursor-pointer hover:bg-muted/40'
                  )}
                >
                  <td className="p-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.strategyName}
                  </td>
                  <td className="text-right p-2 font-mono">{s.distance}m</td>
                  <td className="text-right p-2 font-mono">{s.estimatedTime}m</td>
                  <td className="text-right p-2 font-mono">${s.costPerOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderRankedListItem = (strategy: StrategyResult, rank: number) => {
    return (
      <button
        key={strategy.strategy}
        onClick={() => onStrategySelect(strategy.strategy)}
        className={cn(
          'w-full text-left border rounded-lg p-3 transition-all',
          activeStrategy === strategy.strategy
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border bg-card hover:border-muted-foreground/50 hover:shadow-sm',
          strategy.strategy === resultsData.bestStrategy && !activeStrategy && 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full shrink-0',
            rank === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-muted text-muted-foreground'
          )}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{strategy.strategyName}</span>
              {strategy.strategy === resultsData.bestStrategy && (
                <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 shrink-0">
                  Best
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{strategy.distance}m</span>
              <span className="font-mono">{strategy.estimatedTime}m</span>
              <span className="font-mono">${strategy.costPerOrder}</span>
            </div>
          </div>
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: strategy.color }}
          />
        </div>
      </button>
    );
  };

  const renderRankedList = () => {
    const sortedStrategies = [...resultsData.strategies].sort((a, b) => a.distance - b.distance);
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Ranked by Distance
        </div>
        <div className="space-y-2">
          {sortedStrategies.map((strategy, index) => renderRankedListItem(strategy, index + 1))}
        </div>
      </div>
    );
  };

  const renderAutoSelect = () => {
    const otherStrategies = resultsData.strategies.filter(s => s.strategy !== resultsData.bestStrategy);

    return (
      <div className="space-y-4">
        {/* Best strategy prominently displayed */}
        <div className="border-2 border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-950/30 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-bold text-green-700 dark:text-green-300">Recommended Strategy</span>
          </div>
          {bestResult && (
            <StrategyCard
              strategy={bestResult}
              isBest={true}
              isActive={activeStrategy === resultsData.bestStrategy}
              onClick={() => onStrategySelect(resultsData.bestStrategy)}
            />
          )}
        </div>

        {/* Collapsible other strategies */}
        <div className="space-y-2">
          <button
            onClick={() => setShowOtherStrategies(!showOtherStrategies)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground font-medium uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Other Strategies ({otherStrategies.length})</span>
            {showOtherStrategies ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showOtherStrategies && (
            <div className="space-y-2 ml-2 border-l-2 border-border pl-3">
              {otherStrategies.map((strategy) => (
                <StrategyCard
                  key={strategy.strategy}
                  strategy={strategy}
                  isBest={false}
                  isActive={activeStrategy === strategy.strategy}
                  onClick={() => onStrategySelect(strategy.strategy)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSplitView = () => {
    return (
      <div className="space-y-3">
        {/* Selection List */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Select Strategy
          </div>
          <div className="space-y-1">
            {resultsData.strategies.map((strategy) => (
              <button
                key={strategy.strategy}
                onClick={() => onStrategySelect(strategy.strategy)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded border text-left text-xs transition-all',
                  activeStrategy === strategy.strategy
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-muted-foreground/50',
                  strategy.strategy === resultsData.bestStrategy && !activeStrategy && 'border-green-200 dark:border-green-900'
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: strategy.color }}
                />
                <span className="font-medium">{strategy.strategyName}</span>
                {strategy.strategy === resultsData.bestStrategy && (
                  <Badge className="ml-auto text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    Best
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Active Strategy Details */}
        {activeStrategy && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Active Strategy Details
            </div>
            {(() => {
              const activeResult = resultsData.strategies.find(s => s.strategy === activeStrategy);
              if (!activeResult) return null;

              return (
                <div className="border border-border rounded-lg bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: activeResult.color }}
                    />
                    <span className="text-sm font-semibold">{activeResult.strategyName}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">Distance</div>
                      <div className="font-mono font-semibold">{activeResult.distance}m</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">Time</div>
                      <div className="font-mono font-semibold">{activeResult.estimatedTime}m</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">Efficiency</div>
                      <div className={cn(
                        'font-mono font-semibold',
                        activeResult.efficiency > 0 ? 'text-green-600 dark:text-green-400' : ''
                      )}>
                        {activeResult.efficiency > 0 ? `+${activeResult.efficiency}%` : 'baseline'}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">Cost/Order</div>
                      <div className="font-mono font-semibold">${activeResult.costPerOrder}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">Worker Util</div>
                      <div className="font-mono font-semibold">{activeResult.workerUtilization}%</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // Render content based on UI variant
  const renderContent = () => {
    switch (uiVariant) {
      case 'hybrid':
        return (
          <div className="space-y-4">
            {renderSummary()}
            {renderInsight()}
            {renderStrategyCards()}
            {renderWorkerAllocation()}
            {renderExportTasks()}
            {renderRouteReplay()}
            {renderMetricsTable()}
          </div>
        );

      case 'selectableTable':
        return (
          <div className="space-y-4">
            {renderSummary()}
            {renderMetricsTable(true)}
            {renderWorkerAllocation()}
            {renderExportTasks()}
            {renderRouteReplay()}
          </div>
        );

      case 'rankedList':
        return (
          <div className="space-y-4">
            {renderSummary()}
            {renderInsight()}
            {renderRankedList()}
            {renderWorkerAllocation()}
            {renderExportTasks()}
            {renderRouteReplay()}
          </div>
        );

      case 'autoSelect':
        return (
          <div className="space-y-4">
            {renderAutoSelect()}
            {renderWorkerAllocation()}
            {renderExportTasks()}
            {renderRouteReplay()}
          </div>
        );

      case 'splitView':
        return (
          <div className="space-y-4">
            {renderSummary()}
            {renderInsight()}
            {renderSplitView()}
            {renderWorkerAllocation()}
            {renderExportTasks()}
            {renderRouteReplay()}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      {renderHeader()}
      <div className="flex-1 overflow-y-auto p-3">
        {renderContent()}
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        Click a strategy to visualize its route on the canvas.
      </div>
    </div>
  );
}

function StrategyCard({ 
  strategy, 
  isBest, 
  isActive,
  onClick 
}: { 
  strategy: StrategyResult; 
  isBest: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left border rounded-lg p-3 transition-all space-y-2',
        isActive 
          ? 'border-primary bg-primary/5 shadow-sm' 
          : 'border-border bg-card hover:border-muted-foreground/50 hover:shadow-sm',
        isBest && !isActive && 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span 
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: strategy.color }}
          />
          <span className="text-sm font-semibold">{strategy.strategyName}</span>
        </div>
        {isBest && (
          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
            Best
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Walking Distance</div>
          <div className="font-mono font-semibold text-sm">{strategy.distance}m</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Est. Time</div>
          <div className="font-mono font-semibold text-sm">{strategy.estimatedTime}m</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Efficiency</div>
          <div className={cn(
            'font-mono font-semibold text-sm',
            strategy.efficiency > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          )}>
            {strategy.efficiency > 0 ? `+${strategy.efficiency}%` : 'baseline'}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Cost/Order</div>
          <div className="font-mono font-semibold text-sm">${strategy.costPerOrder}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>Util: {strategy.workerUtilization}%</span>
        </div>
      </div>
    </button>
  );
}
