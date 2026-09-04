// Scene 5 — Simulate Picking Strategies (40–52s)
// Same warehouse, same workload — three strategies run back to back and a
// metrics table fills in as each finishes.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { makeRoute, greedyStops, routeAt, simulateMetrics } from '../lib/routes';
import { WarehouseView, zoneBands } from '../components/WarehouseView';
import { TaroFrame, DockGroup, Btn } from '../components/TaroFrame';
import { StrategyPill, Num } from '../components/Widgets';
import { STRATEGY_COLORS } from '../tokens';
import type { SimMetrics } from '../lib/routes';

const L = makeLayout(12, 18, 1, 3);
const SITES = pickSites(L, 30, 37);
const START = L.workerStart;
const WORKER1 = { x: START.x, y: START.y };
const ZONES = zoneBands(L, 4);
const zoneWorker = (z: (typeof ZONES)[number]) => ({ x: START.x + 1, y: z.y + z.h / 2 });

// routes per strategy over the same 30 orders
const R_SINGLE = makeRoute(START, SITES, true);                       // arrival order
const R_BATCH = makeRoute(START, greedyStops(START, SITES), true);    // clustered batches
const ZONE_PLAN = ZONES.map((z) => {
  const inZone = SITES.filter((s) => s.y >= z.y && s.y < z.y + z.h);
  const from = zoneWorker(z);
  return { r: makeRoute(from, greedyStops(from, inZone), true), from, n: inZone.length };
});

const M_SINGLE = simulateMetrics(R_SINGLE, 30, 1, 4);
const M_BATCH = simulateMetrics(R_BATCH, 30, 1, 4);
const ZONE_DIST = ZONE_PLAN.reduce((a, z) => a + z.r.distances[z.r.distances.length - 1], 0);
const ZONE_TIME = Math.max(...ZONE_PLAN.map((z) => z.r.distances[z.r.distances.length - 1] / 60 + (z.n * 5 * 6) / 60));
const M_ZONE: SimMetrics = {
  dist: ZONE_DIST, time: ZONE_TIME,
  cost: (ZONE_TIME * 0.5 * 4) / 30, util: 100, orders: 30, workers: 4,
};

const CELL = Math.min(600 / L.width, 440 / L.height) * 0.94;

const phase = (t: number) => (t < 116 ? 0 : t < 216 ? 1 : 2);
const phaseT = (t: number, i: number) => {
  const a = [26, 128, 228][i];
  const b = [100, 198, 294][i];
  return clamp01((t - a) / (b - a));
};

export const Scene5: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 360, 12);
  const p = phase(t);

  const routes = [{
    route: R_SINGLE, color: STRATEGY_COLORS.single, t: phaseT(t, 0),
  }, {
    route: R_BATCH, color: STRATEGY_COLORS.batch, t: phaseT(t, 1),
  }];
  const zoneT = phaseT(t, 2);
  const zoneRoutes = ZONE_PLAN.map((z) => ({ route: z.r, color: STRATEGY_COLORS.zone, t: zoneT, head: true }));

  const activeRoutes = p === 2 ? zoneRoutes : [{
    ...(p === 1 ? routes[1] : routes[0]), head: true, width: 0.15,
  }];

  // pins: dim once picked by the active route head
  const picked = (i: number): number => {
    if (p === 2) return 1;
    const r = p === 1 ? routes[1] : routes[0];
    if (r.t <= 0) return 1;
    const s = SITES[i];
    const { pos } = routeAt(r.route, r.t);
    const dTo = Math.abs(s.x - pos.x) + Math.abs(s.y - pos.y);
    return dTo < 2 ? 0.18 : 1;
  };

  const singleDone = phaseT(t, 0) >= 1;
  const batchDone = phaseT(t, 1) >= 1;
  const zoneDone = phaseT(t, 2) >= 1;

  const rows: { name: string; c: string; m: SimMetrics; t: number; start: number }[] = [
    { name: 'Single order', c: STRATEGY_COLORS.single, m: M_SINGLE, t: singleDone ? 1 : 0, start: 108 },
    { name: 'Batch picking', c: STRATEGY_COLORS.batch, m: M_BATCH, t: batchDone ? 1 : 0, start: 210 },
    { name: 'Zone picking', c: STRATEGY_COLORS.zone, m: M_ZONE, t: zoneDone ? 1 : 0, start: 300 },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ marginTop: -8 }}>
          <TaroFrame
            width={1160}
            center={
              <>
                <WarehouseView
                  layout={L} boxW={L.width * CELL} boxH={L.height * CELL}
                  orders={SITES.map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5], appear: picked(i) }))}
                  workers={p === 2
                    ? ZONES.map((z, i) => ({ ...zoneWorker(z), color: [STRATEGY_COLORS.zone, C.warning, C.info, C.positive][i] ?? '#4C5C2D', appear: EASE_OUT(clamp01((t - 228) / 10)) }))
                    : [{ ...WORKER1, color: STRATEGY_COLORS[p === 0 ? 'single' : 'batch'], appear: 1 }]}
                  routes={activeRoutes}
                  zones={p === 2 ? ZONES.map((z) => ({ ...z, opacity: 0.85 })) : undefined}
                  skuDensity={4}
                  pad={0.045}
                />
                {/* metrics table */}
                <div style={{
                  position: 'absolute', right: 8, top: 10, width: 316,
                  borderRadius: 10, border: `1px solid ${C.borderSubtle}`, background: 'rgba(255,255,255,0.94)',
                  boxShadow: '0 8px 24px -12px rgba(17,17,17,0.2)', padding: '10px 12px',
                  fontFamily: FONT,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted, fontWeight: 700, marginBottom: 8, paddingLeft: 78 }}>
                    <span style={{ width: 54 }}>Travel</span>
                    <span style={{ width: 48 }}>Time</span>
                    <span style={{ width: 54 }}>Cost / o</span>
                    <span style={{ width: 40, textAlign: 'right' }}>Util</span>
                  </div>
                  {rows.map((r) => (
                    <MRRow key={r.name} {...r} t={t} />
                  ))}
                </div>
              </>
            }
            left={
              <>
                <DockGroup title="Picking Strategy">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <StrategyPill label="Single Order Picking" color={STRATEGY_COLORS.single} active={p === 0} t={t > 12 ? 1 : 0.5} />
                    <StrategyPill label="Batch Picking" color={STRATEGY_COLORS.batch} active={p === 1} t={clamp01((t - 100) / 12)} />
                    <StrategyPill label="Zone Picking" color={STRATEGY_COLORS.zone} active={p === 2} t={clamp01((t - 200) / 12)} />
                  </div>
                </DockGroup>
                <DockGroup title="Run">
                  <Btn label={p === 2 && zoneDone ? 'Done ✓' : p === 2 ? 'Running…' : p === 1 ? 'Running…' : singleDone ? 'Finished' : 'Running…'} icon="▶" />
                  <div style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, marginTop: 6 }}>
                    Same warehouse · 30 orders · same conditions
                  </div>
                </DockGroup>
              </>
            }
            right={
              <DockGroup title="Warehouse Configuration" tone="accent">
                <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, margin: '2px 0' }}>Geometry</div>
                <RowKV k="Grid height" v="18" />
                <RowKV k="Racks" v="12" />
                <RowKV k="Cross aisles" v="3" />
                <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, margin: '6px 0' }}>Workload</div>
                <RowKV k="Orders" v="30" />
                <RowKV k="Avg SKUs / order" v="6" />
                <RowKV k="Workers" v="4" />
              </DockGroup>
            }
          />
        </div>
      </div>

      {/* strategy labels under canvas */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 84, display: 'flex', justifyContent: 'center', gap: 12,
        pointerEvents: 'none',
      }}>
        {['Single Order Picking', 'Batch Picking', 'Zone Picking'].map((n, i) => (
          <span key={n} style={{
            fontFamily: FONT, fontSize: 16, fontWeight: 700, color: C.ink,
            background: C.surface, border: `1px solid ${C.borderDefault}`, borderRadius: 999, padding: '7px 16px',
            opacity: clamp01((t - (14 + i * 100)) / 10), transform: `translateY(${(1 - clamp01((t - (14 + i * 100)) / 10)) * 10}px)`,
          }}>
            {n}
            <span style={{ marginLeft: 8, width: 8, height: 8, borderRadius: 4, background: STRATEGY_COLORS[i === 0 ? 'single' : i === 1 ? 'batch' : 'zone'], display: 'inline-block' }} />
          </span>
        ))}
      </div>

      {/* statement */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center', pointerEvents: 'none',
        opacity: clamp01((t - 300) / 26) * clamp01((360 - t) / 14),
        transform: `translateY(${(1 - clamp01((t - 300) / 26)) * 18}px)`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 750, color: C.ink, lineHeight: 1.12 }}>
          Test different picking strategies.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const RowKV: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${C.borderSubtle}`, color: C.text2 }}>
    <span>{k}</span>
    <span style={{ fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
  </div>
);

const MRRow: React.FC<{ name: string; c: string; m: SimMetrics; t: number; start: number }> = ({ name, c, m, t, start }) => {
  const k = clamp01((t - start) / 16);
  const dur = 26;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 0', borderTop: `1px solid ${C.borderSubtle}`, opacity: k, transform: `translateY(${(1 - k) * 8}px)` }}>
      <span style={{ width: 74, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.text2 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
        {name}
      </span>
      <span style={{ width: 54, fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        <Num t={t} delay={start + 4} dur={dur} value={m.dist} format={(n) => `${Math.round(n)} m`} size={13} />
      </span>
      <span style={{ width: 48, fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        <Num t={t} delay={start + 6} dur={dur} value={m.time} format={(n) => `${n.toFixed(1)} m`} size={13} />
      </span>
      <span style={{ width: 54, fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        <Num t={t} delay={start + 8} dur={dur} value={m.cost} format={(n) => `$${n.toFixed(2)}`} size={13} />
      </span>
      <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        <Num t={t} delay={start + 10} dur={dur} value={m.util} format={(n) => `${Math.round(n)}%`} size={13} />
      </span>
    </div>
  );
};