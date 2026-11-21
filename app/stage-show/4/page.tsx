'use client';

import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { useDemoSession, useReplayProgress } from '@/components/gallery/session';
import { StageNav } from '../nav';

const noop = () => {};

/** 4 — Row of windows: every generated layout with its own winning route. */
export default function StageShow4() {
  const { warehouses } = useDemoSession();
  const progressRef = useReplayProgress(8000);

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">04 · Layouts</div>
          <h1 className="shot-title">Same orders. Different buildings.</h1>
          <p className="shot-sub">
            Three real generated warehouses — the middle one is cropped by the frame,
            the way a row of sessions reads on a page.
          </p>
        </div>

        <div className="grid gap-3.5 md:grid-cols-3">
          {warehouses.map((w) => {
            const best = w.results?.strategies.find((s) => s.strategy === w.results!.bestStrategy) ?? null;
            return (
              <div key={w.id} className="shot-frame flex h-[420px] flex-col">
                <div className="flex-1 overflow-hidden">
                  <WarehouseSvgRenderer
                    warehouseId={w.id}
                    warehouse={w.warehouse}
                    onWarehouseChange={noop}
                    selectedTool="select"
                    activeRoute={best}
                    animationProgressRef={progressRef}
                    zVisualizationMode="all"
                    animationReplayId={0}
                    zoom={1}
                  />
                </div>
                <div className="border-t border-border-default px-4 py-3">
                  <div className="text-sm font-semibold text-foreground">{w.name}</div>
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {best
                      ? `${best.strategyName} · ${best.totalDistance.toLocaleString()} m · ${best.estimatedTime} min`
                      : 'Simulation unavailable'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
