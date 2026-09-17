'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { CELL_SIZE } from '@/lib/taro/constants';

/* Same four warehouses as /animation/3 - no simulation, just the shells. */
const SHOWCASES: { name: string; config: WarehouseConfiguration }[] = [
  {
    name: 'Single',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 },
      inventory: { skuCount: 430, demandDistribution: 10, productAffinity: 10, storageFootprint: 88 },
      placement: { slottingBias: 10, categoryClustering: 10 },
    },
  },
  {
    name: 'Double',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 2 },
      inventory: { skuCount: 420, demandDistribution: 70, productAffinity: 30, storageFootprint: 82 },
      placement: { slottingBias: 80, categoryClustering: 30 },
    },
  },
  {
    name: 'Clustered',
    config: {
      layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 },
      inventory: { skuCount: 435, demandDistribution: 40, productAffinity: 80, storageFootprint: 88 },
      placement: { slottingBias: 40, categoryClustering: 85 },
    },
  },
  {
    name: 'Grand',
    config: {
      layout: { gridHeight: 24, rackCount: 12, aisleWidth: 1, crossAisleCount: 3 },
      inventory: { skuCount: 530, demandDistribution: 55, productAffinity: 50, storageFootprint: 72 },
      placement: { slottingBias: 65, categoryClustering: 60 },
    },
  },
];

const ORDER_COUNT = 50;
const AVG_ORDER_SIZE = 3;

type Session = ReturnType<typeof generateWarehouseSession>;

export default function Animation6Page() {
  const [active, setActive] = useState(0);
  const [sessions, setSessions] = useState<(Session | null)[]>([null, null, null, null]);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);

  const go = (next: number) =>
    setActive((next + SHOWCASES.length) % SHOWCASES.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(active + 1);
      else if (e.key === 'ArrowLeft') go(active - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Stage size - drives the fit scale.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Generate the active warehouse lazily, once each.
  useEffect(() => {
    if (sessions[active]) return;
    const t = setTimeout(() => {
      const s = generateWarehouseSession(SHOWCASES[active].config, ORDER_COUNT, AVG_ORDER_SIZE);
      setSessions((prev) => {
        if (prev[active]) return prev;
        const next = [...prev];
        next[active] = s;
        return next;
      });
    }, 30);
    return () => clearTimeout(t);
  }, [active, sessions]);

  const session = sessions[active];

  const W = session?.warehouse.width ?? 0;
  const H = session?.warehouse.height ?? 0;
  const logicalW = W * CELL_SIZE;
  const logicalH = H * CELL_SIZE;
  // Same size as the main page, at 80% like /animation/3.
  const availW = Math.max(stage.w - 320 - 48, 1);
  const availH = Math.max(stage.h - 32 - 48, 1);
  const fitScale =
    logicalW > 0 && logicalH > 0 && stage.w > 0 && stage.h > 0
      ? Math.min(availW / logicalW, availH / logicalH, 1.5) * 0.8
      : 0.8;

  return (
    <div className="h-screen overflow-hidden bg-muted/20">
      <div ref={stageRef} className="relative flex h-full w-full items-center justify-center">
        {!session ? (
          <p className="animate-pulse text-sm text-text-secondary">Preparing warehouse…</p>
        ) : (
          <div
            className="flex flex-col shrink-0 border border-border rounded-md overflow-hidden pointer-events-none"
            style={{ transform: `scale(${fitScale})` }}
          >
            <div className="relative" style={{ width: logicalW, height: logicalH }}>
              <WarehouseSvgRenderer
                warehouseId={`a8-${active}`}
                warehouse={session.warehouse}
                onWarehouseChange={() => {}}
                selectedTool="select"
                activeRoute={null}
                animationProgressRef={progressRef}
                zVisualizationMode="all"
                animationReplayId={0}
                zoom={fitScale}
              />
            </div>
          </div>
        )}
      </div>

      {/* Never in prod: local dev always, Vercel preview only when explicitly set. */}
      <AgentationToolbar
        enabled={
          process.env.NODE_ENV === 'development' ||
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
        }
      />
    </div>
  );
}
