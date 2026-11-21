'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Trophy } from 'lucide-react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { SimulationPanel } from '@/components/taro/simulation-panel';
import { ConfigTab } from '@/components/taro/config-tab';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { toWarehouseInsight, generateExperiment } from '@/lib/taro/experiment-recommendation';
import { validateItems } from '@/lib/taro/order-validation';
import { evaluateReadiness } from '@/lib/taro/readiness';
import { useReplayProgress } from '@/components/gallery/session';
import { StageNav } from '../nav';
import {
  BASE_CONFIG,
  DEMO_AVG_SIZE,
  DEMO_ORDERS,
  DEMO_WORKERS,
  VARIANT_DEMAND,
  VARIANT_WIDE,
  bestOf,
  runPipeline,
  type PipelineResult,
} from '../run';

const noop = () => {};

/** 6 — Everything on one page: config → canvas → results → compare → AI. */
export default function StageShow6() {
  const progressRef = useReplayProgress(7000);

  const data = useMemo(() => {
    const base = runPipeline(BASE_CONFIG, 'Flagship build');
    const wide = runPipeline(VARIANT_WIDE, 'Wide cross-aisles');
    const demand = runPipeline(VARIANT_DEMAND, 'Demand slotting');
    const all = [base, wide, demand];
    const readiness = evaluateReadiness(base.warehouse, base.orders, 'all', validateItems(base.orders, base.warehouse));
    const insights = all.filter((w) => w.results).map((w) => toWarehouseInsight(w.name, w.name, w.configuration, w.results!));
    const ranked = all
      .filter((w) => w.results && bestOf(w.results))
      .map((w) => ({ pipe: w, best: bestOf(w.results)! }))
      .sort((a, b) => a.best.totalDistance - b.best.totalDistance);
    return { base, all, readiness, insights, ranked };
  }, []);

  const [experiment, setExperiment] = useState<(PipelineResult & { axis: string }) | null>(null);

  const baseBest = bestOf(data.base.results);

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">06 · Everything, one page</div>
          <h1 className="shot-title">Configure it. Run it. Rank it. Fix it.</h1>
          <p className="shot-sub">
            The whole Taro loop on a single page — {DEMO_ORDERS} orders, {DEMO_WORKERS} workers,
            every number below from live runs against real generated warehouses.
          </p>
        </div>

        {/* Config + hero canvas */}
        <div className="grid items-start gap-3.5 lg:grid-cols-[320px_1fr]">
          <div className="shot-frame overflow-hidden">
            <ConfigTab configuration={data.base.configuration} onEdit={noop} />
          </div>
          <div className="shot-frame h-[480px]">
            <span className="shot-tag">
              {data.base.name}{baseBest ? <> · <b>{baseBest.strategyName}</b> route</> : null}
            </span>
            <WarehouseSvgRenderer
              warehouseId="stage-6-base"
              warehouse={data.base.warehouse}
              onWarehouseChange={noop}
              selectedTool="select"
              activeRoute={baseBest}
              animationProgressRef={progressRef}
              zVisualizationMode="all"
              animationReplayId={0}
              zoom={1}
            />
          </div>
        </div>

        {/* Results + readiness + compare */}
        <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[320px_1fr_1fr]">
          <div className="shot-frame flex h-[560px] flex-col overflow-hidden">
            <SimulationPanel
              embedded
              flowStep="simulation"
              orders={data.base.orders}
              onGenerateOrders={noop}
              orderCount={DEMO_ORDERS}
              avgOrderSize={DEMO_AVG_SIZE}
              onOrderCountChange={noop}
              onAvgOrderSizeChange={noop}
              warehouse={data.base.warehouse}
              results={data.base.results}
              readiness={data.readiness}
              isSimulating={false}
              activeStrategy={data.base.results?.bestStrategy ?? null}
              onStrategySelect={noop}
              animationProgress={0.65}
              workerCount={DEMO_WORKERS}
              onWorkerCountChange={noop}
              executionPlan={null}
              onSimulate={noop}
              onFlowStepChange={noop}
            />
          </div>

          <div className="shot-frame p-4">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Readiness</div>
            <div className="mb-3 text-xs text-muted-foreground tabular-nums">
              {data.readiness.completedSteps} / {data.readiness.totalSteps} checks green
            </div>
            <div className="space-y-2">
              {data.readiness.conditions.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5">
                  {c.isMet ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                  )}
                  <span className="text-xs font-medium text-foreground">{c.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border-default pt-3 text-xs tabular-nums text-muted-foreground">
              {data.base.orders.length} orders · {DEMO_WORKERS} workers · {data.base.configuration.layout.rackCount} racks
            </div>
          </div>

          <div className="shot-frame p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ranked by travel distance
            </div>
            <div className="space-y-2">
              {data.ranked.map(({ pipe, best }, i) => {
                const leader = data.ranked[0].best.totalDistance;
                const over = best.totalDistance - leader;
                return (
                  <div
                    key={pipe.name}
                    className="flex items-center gap-2.5 rounded-lg border border-border-default px-3 py-2.5"
                  >
                    <span
                      className={
                        i === 0
                          ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
                          : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground'
                      }
                    >
                      {i === 0 ? <Trophy className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">{pipe.name}</span>
                    <span className="ml-auto text-[13px] font-bold tabular-nums text-foreground">
                      {best.totalDistance.toLocaleString()} m
                    </span>
                    {over > 0 && (
                      <span className="text-[10px] font-medium tabular-nums text-destructive">
                        +{Math.round((over / leader) * 100)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* AI + experiment result */}
        <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[1fr_380px]">
          <div className="shot-frame p-4">
            <AiSuggestion
              insights={data.insights}
              isRunning={false}
              onGenerate={async (constraintsRaw, recommendation) => {
                const withConstraints = constraintsRaw
                  ? generateExperiment(data.insights, constraintsRaw)
                  : recommendation;
                setExperiment({
                  axis: withConstraints.axis,
                  ...runPipeline(withConstraints.configuration, `Experiment — ${withConstraints.axis}`),
                });
              }}
            />
          </div>
          <div className="shot-frame min-h-[280px] p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Experiment output
            </div>
            {experiment && experiment.results && bestOf(experiment.results) ? (
              <div>
                <div className="h-56 overflow-hidden rounded-lg border border-border-default">
                  <WarehouseSvgRenderer
                    warehouseId="stage-6-experiment"
                    warehouse={experiment.warehouse}
                    onWarehouseChange={noop}
                    selectedTool="select"
                    activeRoute={bestOf(experiment.results)}
                    animationProgressRef={progressRef}
                    zVisualizationMode="all"
                    animationReplayId={0}
                    zoom={1}
                  />
                </div>
                <div className="mt-3 text-sm font-semibold text-foreground">{experiment.name}</div>
                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {bestOf(experiment.results)!.strategyName} ·{' '}
                  {bestOf(experiment.results)!.totalDistance.toLocaleString()} m ·{' '}
                  {bestOf(experiment.results)!.estimatedTime} min
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Generate the experiment on the left — it lands here, simulated and ready
                to re-enter the comparison.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
