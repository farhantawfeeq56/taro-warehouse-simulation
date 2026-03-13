'use client';

import type { SimulationResults, StrategyResult, StrategyType } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock, Route, Users, DollarSign, Activity } from 'lucide-react';

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
  if (!results && !isSimulating) {
    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Simulation Results</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground text-sm">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No simulation run yet.</p>
            <p className="text-xs mt-1">Click &quot;Simulate Strategies&quot; to analyze picking routes.</p>
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

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">Best Strategy</div>
            <div className="text-sm font-medium capitalize">{results!.bestStrategy}</div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-xs text-muted-foreground">Max Savings</div>
            <div className="text-sm font-medium text-green-600">
              {Math.max(...results!.strategies.map(s => s.efficiency))}%
            </div>
          </div>
        </div>

        {/* Strategy Cards */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Strategy Comparison
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

        {/* Detailed Table */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Metrics Table
          </div>
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 font-medium">Strategy</th>
                  <th className="text-right p-2 font-medium">Dist</th>
                  <th className="text-right p-2 font-medium">Time</th>
                  <th className="text-right p-2 font-medium">Eff</th>
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
                    <td className={cn(
                      'text-right p-2 font-mono',
                      s.efficiency > 0 && 'text-green-600'
                    )}>
                      {s.efficiency > 0 ? `+${s.efficiency}%` : 'base'}
                    </td>
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
        'w-full text-left border rounded p-3 transition-colors',
        isActive 
          ? 'border-primary bg-primary/5' 
          : 'border-border bg-card hover:border-muted-foreground/50',
        isBest && !isActive && 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: strategy.color }}
          />
          <span className="text-sm font-medium">{strategy.strategyName}</span>
        </div>
        {isBest && (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            Best
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Route className="h-3 w-3" />
          <span className="font-mono">{strategy.distance}m</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-mono">{strategy.estimatedTime}m</span>
        </div>
        <div className={cn(
          'flex items-center gap-1',
          strategy.efficiency > 0 ? 'text-green-600' : 'text-muted-foreground'
        )}>
          <TrendingUp className="h-3 w-3" />
          <span className="font-mono">
            {strategy.efficiency > 0 ? `+${strategy.efficiency}%` : 'base'}
          </span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>Util: {strategy.workerUtilization}%</span>
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          <span>${strategy.costPerOrder}/order</span>
        </div>
      </div>
    </button>
  );
}
