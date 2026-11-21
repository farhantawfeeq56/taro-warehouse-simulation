'use client';

import { useMemo } from 'react';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { toWarehouseInsight } from '@/lib/taro/experiment-recommendation';
import { useDemoSession, useReplayProgress } from '@/components/gallery/session';
import { StageNav } from '../nav';

const noop = () => {};

/** 5 — The AI suggestion beside the warehouse it reasons about. */
export default function StageShow5() {
  const { base, warehouses } = useDemoSession();
  const progressRef = useReplayProgress(7000);

  const best = base.results?.strategies.find((s) => s.strategy === base.results!.bestStrategy) ?? null;
  const insights = useMemo(
    () =>
      warehouses
        .filter((w) => w.results)
        .map((w) => toWarehouseInsight(w.id, w.name, w.configuration, w.results!)),
    [warehouses],
  );

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">05 · AI suggestion</div>
          <h1 className="shot-title">Don&apos;t just rank it. Fix it.</h1>
          <p className="shot-sub">
            The original experiment card reads the real session insights and proposes
            the next warehouse to generate.
          </p>
        </div>

        <div className="grid items-start gap-3.5 lg:grid-cols-[1fr_400px]">
          <div className="shot-frame h-[480px]">
            <span className="shot-tag">
              {base.name}{best ? <> · <b>{best.strategyName}</b> wins at {best.totalDistance.toLocaleString()} m</> : null}
            </span>
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
          <div className="shot-frame p-4">
            <AiSuggestion insights={insights} isRunning={false} onGenerate={async () => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
