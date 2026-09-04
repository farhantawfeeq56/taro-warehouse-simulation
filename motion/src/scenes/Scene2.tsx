// Scene 2 — The Decision Problem (10–20s)
// Same warehouse, one variable at a time: Layout, Inventory, Workload,
// Workers. Then the strategy teaser — the same orders handled three ways —
// and the payoff line.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { makeRoute, greedyStops, type SimRoute } from '../lib/routes';
import { WarehouseView, zoneBands, type Zone } from '../components/WarehouseView';
import { Chip } from '../components/Widgets';
import { STRATEGY_COLORS, WORKER_COLORS } from '../tokens';

// phase-1 layout: same as scene 1 (racks 6) — continuity
const L1 = makeLayout(6, 12, 1, 0);
// phase-2 layout: +3 racks, +2 cross aisles
const L2 = makeLayout(9, 12, 1, 2);

const SITES7 = pickSites(L1, 7, 11);            // scene-1 orders keep their identity
const SITES14 = pickSites(L2, 14, 23);          // superset on the new layout
const ORDER7 = SITES14.slice(0, 7);
const ORDER14 = SITES14;
const PIN_COLORS = (i: number) => C.chart[i % 5];

const START = L2.workerStart;
const W2 = { x: Math.min(START.x + 4, L2.width - 3), y: START.y };
const W3 = { x: Math.min(START.x + 8, L2.width - 3), y: START.y };
const WORKER_POS = [START, W2, W3];

// strategy routes over the SAME 14 orders
const R_SINGLE = makeRoute(START, ORDER14, true);                    // arrival order → zigzag
const R_BATCH = makeRoute(START, greedyStops(START, ORDER14), true); // clustered
const ZONES = zoneBands(L2, 3);
const zoneWorker = (z: Zone) => ({ x: START.x + 1, y: z.y + z.h / 2 });

const R_ZONES = ZONES.map((z, zi) => {
  const inZone = ORDER14.filter((s) => s.y >= z.y && s.y < z.y + z.h);
  const from = zoneWorker(z);
  return makeRoute(from, greedyStops(from, inZone), true);
});

const CELL = Math.min(780 / L2.width, 500 / L2.height) * 0.94;

export const Scene2: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 300, 14);

  // phase windows (frames, local)
  const pLayout = t >= 24 && t < 96;
  const pInv = t >= 96 && t < 148;
  const pWorkload = t >= 152 && t < 204;
  const pWorkers = t >= 208 && t < 246;
  const pTease = t >= 246 && t < 300;

  // crossfade old layout → new layout
  const dLayout = EASE_IN_OUT(clamp01((t - 44) / 20));
  const showL1 = clamp01((20 - (t - 44)) / 20);
  const showL2 = t < 96 ? dLayout : 1;

  // inventory density 2 → 3 dots
  const density = t < 96 ? 2 : 2 + EASE_OUT(clamp01((t - 110) / 14));

  // workload pin spawn, staggered
  const pinAppear = (i: number) => {
    const k = EASE_OUT(clamp01((t - (164 + i * 5)) / 12));
    return pWorkload ? k : 1;
  };

  // workers 1 → 3 (+ all three visible for the zone tease)
  const wAppear = (i: number) => EASE_OUT(clamp01((t - (218 + i * 7)) / 10));
  const nVisibleWorkers = pWorkers || pTease ? 3 : 1;

  const TEASE: { c: string; label: string; routes: { r: SimRoute; from: { x: number; y: number } }[] }[] = [
    { c: STRATEGY_COLORS.single, label: 'Single order', routes: [{ r: R_SINGLE, from: START }] },
    { c: STRATEGY_COLORS.batch, label: 'Batch picking', routes: [{ r: R_BATCH, from: START }] },
    {
      c: STRATEGY_COLORS.zone, label: 'Zone picking',
      routes: ZONES.map((z, i) => ({ r: R_ZONES[i], from: zoneWorker(z) })),
    },
  ];

  const orders = (pWorkload ? ORDER14 : ORDER7).map((s, i) => ({
    x: s.x, y: s.y, color: PIN_COLORS(i), appear: pWorkload ? pinAppear(i) : 1,
  }));

  const workers = WORKER_POS.slice(0, nVisibleWorkers).map((w, i) => ({
    x: w.x, y: w.y, color: WORKER_COLORS[i],
    appear: pWorkers ? wAppear(i) : pTease ? 1 : i === 0 ? 1 : 0,
  })).filter((w) => w.appear > 0.01);

  // strategy flick: one route burst per strategy
  const flickStart = [244, 252, 260];
  const teaseRoutes: { route: SimRoute; color: string; t: number; head: boolean; opacity: number }[] = [];
  if (pTease) {
    TEASE.forEach((s, i) => {
      const k = clamp01((t - flickStart[i]) / 20);
      if (k <= 0) return;
      s.routes.forEach((r) => teaseRoutes.push({ route: r.r, color: s.c, t: k, head: true, opacity: 0.92 }));
    });
  }

  const showZones = pTease && t >= flickStart[2];

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* crossfade the two layouts */}
        {t < 96 && (
          <div style={{ position: 'absolute', opacity: showL1, transform: 'scale(0.985)' }}>
            <WarehouseView layout={L1} boxW={L1.width * CELL * 0.97} boxH={L1.height * CELL * 0.97} orders={SITES7.map((s, i) => ({ x: s.x, y: s.y, color: PIN_COLORS(i) }))} skuDensity={2} pad={0.05} />
          </div>
        )}
        <WarehouseView
          layout={L2} boxW={L2.width * CELL} boxH={L2.height * CELL}
          opacity={showL2}
          orders={orders}
          workers={workers}
          routes={teaseRoutes}
          zones={showZones ? ZONES.map((z, i) => ({ ...z, opacity: 0.85 })) : undefined}
          skuDensity={Math.round(density)}
          pad={0.05}
          startMarker
        />
      </div>

      {/* phase chips */}
      <div style={{ position: 'absolute', left: 46, top: 34, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Chip label="Layout" active={pLayout} t={chipT(t, 30, 88)} tone="accent" />
        <Chip label="Inventory" active={pInv} t={chipT(t, 102, 144)} />
        <Chip label="Workload" active={pWorkload} t={chipT(t, 158, 200)} tone="info" />
        <Chip label="Workers" active={pWorkers} t={chipT(t, 214, 242)} tone="warning" />
      </div>

      {/* strategy tease legend */}
      {pTease && (
        <div style={{ position: 'absolute', right: 44, top: 40, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {TEASE.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: clamp01((t - flickStart[i]) / 8) }}>
              <span style={{ width: 12, height: 3, borderRadius: 2, background: s.c }} />
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.text2 }}>{s.label}</span>
              <span style={{ fontFamily: FONT, fontSize: 12, color: C.muted }}>same orders</span>
            </div>
          ))}
        </div>
      )}

      {/* payoff */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 64, textAlign: 'center',
        opacity: clamp01((t - 268) / 24) * clamp01((300 - t) / 16),
        transform: `translateY(${(1 - clamp01((t - 268) / 24)) * 18}px)`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 750, color: C.ink, lineHeight: 1.12, padding: '0 40px' }}>
          Different decisions can produce very different outcomes.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const chipT = (t: number, a: number, b: number) =>
  clamp01((t - a) / 10) * (1 - clamp01((t - b) / 10));