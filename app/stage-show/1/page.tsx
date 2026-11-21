'use client';

import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { SimulationPanel } from '@/components/taro/simulation-panel';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { toWarehouseInsight } from '@/lib/taro/experiment-recommendation';
import { useDemoSession, useReplayProgress, DEMO_WORKER_COUNT } from '@/components/gallery/session';
import { StageNav } from '../nav';

const noop = () => {};

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="shot-frame p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/** 1 — Bento: real canvas + live results + stats + AI nudge, one grid. */
export default function StageShow1() {
  const { base, warehouses } = useDemoSession();
  const progressRef = useReplayProgress(7000);

  const best = base.results?.strategies.find((s) => s.strategy === base.results!.bestStrategy) ?? null;
  const baseline = base.results?.strategies.find((s) => s.strategy === 'single') ?? null;
  const saving = baseline && best ? Math.round((1 - best.totalDistance / baseline.totalDistance) * 100) : null;

  const insights = useMemo(
    () =>
      warehouses
        .filter((w) => w.results)
        .map((w) => toWarehouseInsight(w.id, w.name, w.configuration, w.results!)),
    [warehouses],
  );

  if (!base.results || !best) {
    return (
      <div className="shot-page"><div className="shot-inner"><StageNav /><p>Simulation unavailable.</p></div></div>
    );
  }

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">01 · Bento</div>
          <h1 className="shot-title">The whole answer in one grid.</h1>
          <p className="shot-sub">
            {base.name} · {base.orders.length} orders · {DEMO_WORKER_COUNT} workers — canvas, results,
            stats and the AI nudge, all live from the same session.
          </p>
        </div>

        <div className="grid grid-cols-6 gap-3.5">
          {/* Hero: the real canvas with the winning route replaying */}
          <div className="shot-frame col-span-6 lg:col-span-4 h-[440px]">
            <span className="shot-tag">{base.name} · <b>{best.strategyName}</b> route</span>
            <WarehouseSvgRenderer
              warehouseId={base.id}
              warehouse={base.warehouse}
              onWarehouseChange={noop}
              selectedTool="select"
              activeRoute={best}
              animationProgressRef={progressRef}
              zVisualizationMode="all"
              animationReplayId={0}
              zoom={1}
            />
          </div>

          {/* Tall results: the real simulation panel */}
          <div className="shot-frame col-span-6 lg:col-span-2 h-[560px] lg:h-auto lg:row-span-2 flex flex-col overflow-hidden">
            <SimulationPanel
              embedded
              flowStep="simulation"
              orders={base.orders}
              onGenerateOrders={noop}
              orderCount={30}
              avgOrderSize={3}
              onOrderCountChange={noop}
              onAvgOrderSizeChange={noop}
              warehouse={base.warehouse}
              results={base.results}
              readiness={base.readiness}
              isSimulating={false}
              activeStrategy={base.results.bestStrategy}
              onStrategySelect={noop}
              animationProgress={0.65}
              workerCount={DEMO_WORKER_COUNT}
              onWorkerCountChange={noop}
              executionPlan={null}
              onSimulate={noop}
              onFlowStepChange={noop}
            />
          </div>

          {/* Stats from the real run */}
          <div className="col-span-3 lg:col-span-2">
            <Stat
              label="Travel distance"
              value={`${best.totalDistance.toLocaleString()} m`}
              sub={saving !== null ? `−${saving}% vs single-order picking` : best.strategyName}
            />
          </div>
          <div className="col-span-3 lg:col-span-2">
            <Stat
              label="Est. completion"
              value={`${best.estimatedTime} min`}
              sub={`${best.ordersCompleted} orders · ${best.workerUtilization}% worker util.`}
            />
          </div>

          {/* AI nudge, full width */}
          <div className="shot-frame col-span-6 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3 w-3" /> Recommended next experiment
            </div>
            <AiSuggestion insights={insights} isRunning={false} onGenerate={async () => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
