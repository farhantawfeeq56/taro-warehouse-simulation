'use client';

/**
 * Simulation panel — the single merged Orders + Simulation panel.
 *
 * Previously the left dock had two separate sections: "Orders" (a full list
 * of every generated order) and "Simulation" (readiness + strategy results).
 * They are now one panel:
 *
 *   • Orders header — shows how many orders are generated, with the
 *     Order Count and Average Order Size sliders live-adjustable inline.
 *   • Generate / Simulate controls.
 *   • Readiness checklist, strategy results, worker allocation and
 *     execution plan (the former SystemStatePanel).
 */

import type {
  Warehouse,
  Order,
  SimulationResults,
  StrategyResult,
  StrategyType,
  ZVisualizationMode,
  SimulationValidationContext,
  SimulationBlockState,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Activity,
  CheckCircle2,
  Circle,
  ClipboardList,
  MapPinOff,
  PlayCircle,
  BarChart3,
  Loader2,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@/components/ui/empty';

interface SimulationPanelProps {
  // Orders generation
  orders: Order[];
  onGenerateOrders: () => void;
  isGeneratingOrders?: boolean;
  orderCount: number;
  avgOrderSize: number;
  onOrderCountChange: (value: number) => void;
  onAvgOrderSizeChange: (value: number) => void;

  // Simulation
  results: SimulationResults | null;
  readiness?: SimulationReadiness;
  isSimulating: boolean;
  activeStrategy: StrategyType | null;
  onStrategySelect: (strategy: StrategyType) => void;
  animationProgress: number;
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
  executionPlan: StrategyResult | null;
  validationContext?: SimulationValidationContext | null;
  blockState?: SimulationBlockState | null;
  onViewUnresolvableItems?: (itemIds: string[]) => void;
  onSimulate?: () => void;
  onAddShelves?: () => void;
  onSetWorkerStart?: () => void;
  onZVisualizationChange?: (mode: ZVisualizationMode) => void;
  warehouse?: Warehouse;

  /** When true, renders without the outer width/border wrapper so it can be embedded in a tab. */
  embedded?: boolean;
}

export function SimulationPanel({
  orders,
  onGenerateOrders,
  isGeneratingOrders = false,
  orderCount,
  avgOrderSize,
  onOrderCountChange,
  onAvgOrderSizeChange,
  results,
  readiness,
  isSimulating,
  activeStrategy,
  onStrategySelect,
  animationProgress,
  workerCount,
  onWorkerCountChange,
  executionPlan,
  validationContext,
  blockState,
  onViewUnresolvableItems,
  onSimulate,
  onAddShelves,
  onSetWorkerStart,
  onZVisualizationChange,
  warehouse,
  embedded = false,
}: SimulationPanelProps) {
  const strategies = results?.strategies ?? [];
  const wrapperClass = embedded
    ? 'flex flex-col h-full'
    : 'w-80 border-l border-border bg-background flex flex-col';

  const sortedStrategies = [...strategies].sort((a, b) => {
    if (a.strategy === 'single') return 1;
    if (b.strategy === 'single') return -1;
    if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
    if (a.criticalPathDistance !== b.criticalPathDistance) return a.criticalPathDistance - b.criticalPathDistance;
    if (a.estimatedTime !== b.estimatedTime) return a.estimatedTime - b.estimatedTime;
    return a.costPerOrder - b.costPerOrder;
  });

  return (
    <div className={wrapperClass}>
      {/* ═══ Orders header — compact meta + hidden generation sliders ═══ */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-xs text-muted-foreground font-sans">
            {orders.length >= 1000
              ? `${(orders.length / 1000).toFixed(orders.length % 1000 === 0 ? 0 : 1)}k`
              : orders.length.toLocaleString()}{' '}
            orders generated
          </span>
        </div>

        {/* Generate / Simulate */}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateOrders}
            disabled={!warehouse || isGeneratingOrders}
            className="flex-1 h-8 text-xs"
            title="Generate random orders"
          >
            {isGeneratingOrders ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Shuffle className="h-3 w-3 mr-1" />
            )}
            {isGeneratingOrders ? 'Generating…' : 'Generate Orders'}
          </Button>
          <Button
            size="sm"
            onClick={onSimulate}
            disabled={!readiness?.isReady || isSimulating || orders.length === 0}
            className="flex-1 h-8 text-xs"
            title="Run simulation"
          >
            {isSimulating ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="h-3 w-3 mr-1" />
            )}
            {isSimulating ? 'Simulating…' : 'Simulate'}
          </Button>
          {/* Settings — order count / size sliders live here, hidden by default */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 text-xs px-0"
                title="Order generation settings"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4" align="end" side="bottom">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Order Generation Settings</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Order Count</label>
                    <span className="text-xs font-medium text-foreground font-sans">
                      {orderCount.toLocaleString()} orders
                    </span>
                  </div>
                  <Slider
                    value={[orderCount]}
                    onValueChange={([value]) => onOrderCountChange(value)}
                    min={100}
                    max={2000}
                    step={100}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>100</span>
                    <span>2,000</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Average Order Size</label>
                    <span className="text-xs font-medium text-foreground font-sans">{avgOrderSize} SKUs</span>
                  </div>
                  <Slider
                    value={[avgOrderSize]}
                    onValueChange={([value]) => onAvgOrderSizeChange(value)}
                    min={1}
                    max={20}
                    step={1}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Workers — moved here from the individual warehouse nodes */}
        <div className="space-y-1 pt-2 mt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Workers</label>
            <span className="text-xs font-medium text-foreground font-sans">{workerCount}</span>
          </div>
          <Slider
            value={[workerCount]}
            onValueChange={([value]) => onWorkerCountChange(value)}
            min={1}
            max={10}
            step={1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1</span>
            <span>10</span>
          </div>
        </div>
      </div>

      {/* ═══ Simulation body ═══ */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 1. Loading State */}
        {isSimulating && (
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
        )}

        {/* 2. BLOCKED State (e.g. Unreachable locations) */}
        {!isSimulating && blockState && (
          <div className="flex-1 flex items-center justify-center p-6">
            <Empty className="border-0 p-0">
              <EmptyMedia variant="icon">
                <MapPinOff className="h-6 w-6 text-destructive" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{blockState.title}</EmptyTitle>
                <EmptyDescription>
                  {blockState.description}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={onAddShelves} className="w-full" variant="outline">
                  Check Layout
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}

        {/* 3. NOT READY State */}
        {!isSimulating && !blockState && !readiness?.isReady && !results && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Progress Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted-foreground">Readiness Progress</span>
                <span className="text-foreground">{readiness?.completedSteps} / {readiness?.totalSteps}</span>
              </div>
              <Progress value={readiness ? (readiness.completedSteps / readiness.totalSteps) * 100 : 0} className="h-2" />
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
                Requirements Checklist
              </h4>
              <div className="space-y-2">
                {readiness?.conditions.map((condition) => (
                  <div key={condition.id} className="flex items-center gap-3">
                    {condition.isMet ? (
                      <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      condition.isMet ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {condition.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3b. READY State (Ready but no results) */}
        {!isSimulating && !blockState && readiness?.isReady && !results && (
          <div className="flex-1 flex items-center justify-center p-6">
            <Empty className="border-0 p-0">
              <EmptyMedia variant="icon">
                <PlayCircle className="h-6 w-6 text-positive" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Ready to Simulate</EmptyTitle>
                <EmptyDescription>
                  All requirements met. Press Simulate above.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {/* 4. RESULT STATE */}
        {!isSimulating && !blockState && results && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Results</h2>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-info border-info-soft bg-info-soft/60">
                Results
              </Badge>
            </div>

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
                        ? 'border-border-strong bg-accent-subtle shadow-sm'
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
                        <span className="text-sm font-bold text-positive dark:text-positive/80 shrink-0">{strategy.efficiency}%</span>
                      )}
                      <div className="flex-1" />
                      {isBest && !isBaseline && (
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-positive-soft text-positive">
                          Best
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 ml-5 text-xs text-muted-foreground">
                      <span className="font-sans">{strategy.totalDistance}m</span>
                      <span className="text-[10px] opacity-50">•</span>
                      <span className="font-sans">{strategy.estimatedTime} min</span>
                      <span className="text-[10px] opacity-50">•</span>
                      <span className="font-sans">${strategy.costPerOrder}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {(() => {
              const activeResult = activeStrategy
                ? results.strategies.find((strategy) => strategy.strategy === activeStrategy) ?? null
                : null;
              return activeResult?.workerRoutes && activeResult.workerRoutes.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Worker Allocation
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-sans text-muted-foreground">
                        Req: {workerCount} | Active: {activeResult.workerRoutes.filter(w => w.assignedPickCount > 0).length}
                      </span>
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
                      const isIdle = totalPicks === 0;

                      return (
                        <div key={worker.workerId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold">Worker {worker.workerId}</span>
                            <span className="font-sans text-muted-foreground">{completedPicks} / {totalPicks} picks</span>
                          </div>
                          {isIdle && (
                            <div className="text-[10px] text-muted-foreground/60 italic leading-tight">
                              {worker.zone}
                            </div>
                          )}
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
              ) : null;
            })()}

            {executionPlan && (
              <div className="space-y-3 border border-positive/40 bg-positive-soft/60 dark:bg-positive-soft/30 dark:border-positive/40 rounded-lg p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-positive">
                  Execution Plan Output
                </div>

                <div className="space-y-2">
                  {executionPlan.workerRoutes.map((worker) => (
                    <div key={worker.workerId} className="border border-border rounded-md bg-background p-2">
                      <div className="text-xs font-semibold mb-1">Worker {worker.workerId}</div>
                      <ol className="space-y-1 text-xs">
                        {worker.tasks.map((task) => (
                          <li key={`${worker.workerId}-${task.step}`} className="font-sans">
                            {task.step}. {task.zone ? `${task.zone} → ` : ''}{task.location} ({task.sku})
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>

                <div className="text-xs space-y-1">
                  <div className="font-semibold">Route Order</div>
                  {executionPlan.workerRoutes.map((worker) => (
                    <div key={`route-${worker.workerId}`} className="font-sans text-muted-foreground">
                      Worker {worker.workerId}: Start → {worker.tasks.map((task) => task.location).join(' → ') || 'No picks'}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="border border-border rounded-md p-2 bg-background">
                    <div className="text-muted-foreground">Distance</div>
                    <div className="font-bold font-sans">{executionPlan.totalDistance}m</div>
                  </div>
                  <div className="border border-border rounded-md p-2 bg-background">
                    <div className="text-muted-foreground">Time</div>
                    <div className="font-bold font-sans">{executionPlan.estimatedTime} min</div>
                  </div>
                  <div className="border border-border rounded-md p-2 bg-background">
                    <div className="text-muted-foreground">Efficiency</div>
                    <div className="font-bold font-sans">{executionPlan.efficiency}%</div>
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
                      {(() => {
                        const baseline = results.strategies.find((s) => s.strategy === 'single') ?? null;
                        return baseline ? Math.max(0, baseline.totalDistance - executionPlan.totalDistance) : 0;
                      })()}m and time by{' '}
                      {(() => {
                        const baseline = results.strategies.find((s) => s.strategy === 'single') ?? null;
                        return baseline ? Math.max(0, baseline.estimatedTime - executionPlan.estimatedTime) : 0;
                      })()} minutes.
                    </li>
                    <li>
                      Compared with other simulated strategies, this selected plan achieved the top efficiency score at {executionPlan.efficiency}%.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            <Button
              onClick={onSimulate}
              className="w-full h-8 text-xs"
              variant="outline"
            >
              <RotateCcw className="h-3 w-3 mr-1.5" />
              Simulate Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
