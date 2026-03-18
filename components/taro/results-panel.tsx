'use client';

import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock, Route, Users, DollarSign, Activity, Play, Pause, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ResultsPanelProps {
  results: SimulationResults | null;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
}

export function ResultsPanel({ 
  results, 
  isSimulating, 
  activeStrategy,
  onStrategySelect 
}: ResultsPanelProps) {
  const [replayProgress, setReplayProgress] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    if (!isReplaying) return;

    let animationId: number;
    const startTime = performance.now();
    const speeds = [1, 5, 10];
    const currentSpeedIndex = 0;
    const speed = speeds[currentSpeedIndex];

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min((elapsed * speed) / 4, 1);
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

  // Calculate insights
  const bestResult = results!.strategies.find(s => s.strategy === results!.bestStrategy);
  const baselineResult = results!.strategies.find(s => s.strategy === 'single');
  const savingsDistance = baselineResult ? baselineResult.distance - (bestResult?.distance || 0) : 0;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
          <Badge variant="outline" className="text-xs">
            {results!.strategies.length} strategies
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Efficiency Score Card */}
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
            Using <span className="font-medium capitalize text-foreground">{results!.bestStrategy}</span> strategy
          </div>
        </div>

        {/* Key Insight */}
        {savingsDistance > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded p-3 space-y-1">
            <div className="flex items-start gap-2">
              <div className="mt-1">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                <span className="font-medium">{results!.bestStrategy.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</span> reduces walking distance by <span className="font-semibold">{savingsDistance}m</span> compared to single order picking.
              </div>
            </div>
          </div>
        )}

        {/* Strategy Cards */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Strategy Breakdown
          </div>
          {results!.strategies.map((strategy) => (
            <StrategyCard
              key={strategy.strategy}
              strategy={strategy}
              isBest={strategy.strategy === results!.bestStrategy}
              isActive={activeStrategy === strategy.strategy}
              onClick={() => onStrategySelect(strategy.strategy)}
            />
          ))}
        </div>

        {/* Route Replay Controls */}
        {activeStrategy && (
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
        )}

        {/* Detailed Table */}
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
                {results!.strategies.map((s) => (
                  <tr 
                    key={s.strategy}
                    className={cn(
                      'border-t border-border',
                      s.strategy === results!.bestStrategy && 'bg-green-50 dark:bg-green-950/20'
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
