'use client';

import type { SimulationResults, StrategyResult, StrategyType, SimulationValidationContext } from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  Activity, 
  CheckCircle2, 
  Circle, 
  PackageSearch, 
  ClipboardList, 
  MapPinOff, 
  UserPlus, 
  PlayCircle, 
  BarChart3, 
  Loader2 
} from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty';

interface ResultsBlockState {
  simulationState?: 'NO_VALID_ITEMS';
  title: string;
  description: string;
}

interface SystemStatePanelProps {
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
  onSimulate?: () => void;
  onImportCsv?: () => void;
  onAddDemoOrders?: () => void;
  onSetWorkerStart?: () => void;
}

export function SystemStatePanel({
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
  onSimulate,
  onImportCsv,
  onAddDemoOrders,
  onSetWorkerStart,
}: SystemStatePanelProps) {
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

  // 1. Loading State
  if (isSimulating) {
    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            <h2 className="text-sm font-semibold text-foreground">System State</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <Empty className="border-0 p-0">
            <EmptyMedia variant="icon">
              <Loader2 className="h-6 w-6 animate-spin" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Simulating...</EmptyTitle>
              <EmptyDescription>
                Calculating optimal routes across all picking strategies.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  // 2. NOT READY State
  if (!readiness?.isReady && !results) {
    const firstUnmetCondition = readiness?.conditions.find(c => !c.isMet);
    
    let content = {
      icon: AlertTriangle,
      title: "Action Required",
      description: "Simulation requirements not met.",
      actionLabel: "",
      action: () => {},
    };

    if (firstUnmetCondition) {
      switch (firstUnmetCondition.id) {
        case 'items-exist':
          content = {
            icon: PackageSearch,
            title: "Inventory Required",
            description: "No shelves or items found in the warehouse layout.",
            actionLabel: "Import CSV",
            action: onImportCsv || (() => {}),
          };
          break;
        case 'valid-orders':
          content = {
            icon: ClipboardList,
            title: "No Active Orders",
            description: "At least one order with items is required to simulate.",
            actionLabel: "Add Demo Orders",
            action: onAddDemoOrders || (() => {}),
          };
          break;
        case 'pickable-items':
          content = {
            icon: MapPinOff,
            title: "Unplaced Items",
            description: "Some ordered items don't have a location in the warehouse.",
            actionLabel: "Highlight Missing Items",
            action: () => {
              if (validationContext && onViewUnresolvableItems) {
                const missingIds: string[] = [];
                validationContext.missingItemsByOrder.forEach(o => {
                  missingIds.push(...o.missingItemIds);
                });
                onViewUnresolvableItems(missingIds);
              }
            },
          };
          break;
        case 'worker-start':
          content = {
            icon: UserPlus,
            title: "Worker Start Missing",
            description: "A starting point for workers must be placed on the grid.",
            actionLabel: "Use Worker Tool",
            action: onSetWorkerStart || (() => {}),
          };
          break;
      }
    }

    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">System State</h2>
            <Badge variant="outline" className="ml-auto text-[10px] uppercase font-bold text-amber-600 border-amber-200 bg-amber-50">
              Not Ready
            </Badge>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <Empty className="border-0 p-0">
            <EmptyMedia variant="icon">
              <content.icon className="h-6 w-6 text-amber-600" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{content.title}</EmptyTitle>
              <EmptyDescription>
                {content.description}
              </EmptyDescription>
            </EmptyHeader>
            {content.actionLabel && (
              <EmptyContent>
                <Button onClick={content.action} variant="outline" className="w-full">
                  {content.actionLabel}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </div>
      </div>
    );
  }

  // 3. READY State (Ready but no results)
  if (readiness?.isReady && !results) {
    return (
      <div className="w-80 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">System State</h2>
            <Badge variant="outline" className="ml-auto text-[10px] uppercase font-bold text-emerald-600 border-emerald-200 bg-emerald-50">
              Ready
            </Badge>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <Empty className="border-0 p-0">
            <EmptyMedia variant="icon">
              <PlayCircle className="h-6 w-6 text-emerald-600" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Ready to Simulate</EmptyTitle>
              <EmptyDescription>
                All requirements met. Ready to calculate optimal picking routes.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={onSimulate} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Run Simulation
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }

  // 4. RESULT STATE
  if (!results) return null;

  const activeResult = activeStrategy
    ? results.strategies.find((strategy) => strategy.strategy === activeStrategy) ?? null
    : null;
  const baseline = results.strategies.find((strategy) => strategy.strategy === 'single') ?? null;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">System State</h2>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-blue-600 border-blue-200 bg-blue-50">
            Results
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
