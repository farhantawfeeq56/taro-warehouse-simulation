// Scene 1 - The Problem (0–10s)
// A worker on a bare warehouse grid zigzags between scattered orders. The
// route and distance counter grow, then the film states the problem.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_IN_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { makeRoute, routeAt } from '../lib/routes';
import { WarehouseView } from '../components/WarehouseView';

const L = makeLayout(6, 12, 1, 0);
const SITES = pickSites(L, 7, 11);
const ORDERS = SITES.map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
const ROUTE = makeRoute(L.workerStart, SITES, true);
const CELL = Math.min(780 / L.width, 500 / L.height) * 0.94;

export const Scene1: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;

  const fade = envelope(t, 300, 14);
  // slow cinematic creep in on the grid
  const zoom = 0.965 + 0.035 * EASE_IN_OUT(clamp01(t / 260));

  // route draws 26..228, worker head follows
  const tRouteRaw = clamp01((t - 26) / 202);
  const tRoute = EASE_IN_OUT(tRouteRaw);
  const { pos, dist } = routeAt(ROUTE, tRouteRaw);

  // pin lights up when the route head reaches it
  const visited = Rustle(SITES, pos);

  const labelChip = clamp01((t - 16) / 18);
  const done = tRouteRaw >= 1;

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      {/* warehouse */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${zoom})` }}>
          <WarehouseView
            layout={L} boxW={L.width * CELL} boxH={L.height * CELL}
            orders={ORDERS.map((o, i) => ({ ...o, appear: visited[i] }))}
            routes={[{ route: ROUTE, color: done ? C.warning : C.accent, t: tRoute, head: true }]}
            pad={0.06}
          />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        </div>
      </div>

      {/* legend chip */}
      <div style={{
        position: 'absolute', left: 40, top: 36, display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: FONT, fontSize: 13, color: C.text2, opacity: labelChip,
      }}>
        <ChipDot c={C.rackInk} />
        <Dot c={C.accent} />
        <span style={{ letterSpacing: 0.3 }}>1 worker · 7 orders · 6 racks</span>
      </div>

      {/* distance readout */}
      <div style={{
        position: 'absolute', right: 42, bottom: 96, textAlign: 'right', opacity: done ? 1 : labelChip,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>
          Travel distance
        </div>
        <div style={{ fontFamily: FONT, fontSize: 44, fontWeight: 800, color: done ? C.warning : C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
          {Math.round(dist)}
          <span style={{ fontSize: 22, fontWeight: 600, color: C.muted, marginLeft: 6 }}>m</span>
        </div>
        {done && (
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.warning, fontWeight: 600, marginTop: 6 }}>
            back and forth · order by order
          </div>
        )}
      </div>

      {/* statements */}
      <StatementLocal k={clamp01((t - 234) / 22) * clamp01((300 - t) / 18)} top={228}>
        Warehouse picking is a movement problem.
      </StatementLocal>
      <StatementLocal k={clamp01((t - 262) / 22) * clamp01((300 - t) / 14)} top={316} sub>
        But which decisions actually make a warehouse more efficient?
      </StatementLocal>
    </AbsoluteFill>
  );
};

const Dot: React.FC<{ c: string }> = ({ c }) => (
  <span style={{ width: 11, height: 11, borderRadius: 6, background: c, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(17,17,17,0.15)', display: 'inline-block' }} />
);
const ChipDot: React.FC<{ c: string }> = ({ c }) => (
  <span style={{ width: 11, height: 11, borderRadius: 3, background: c, display: 'inline-block' }} />
);

const StatementLocal: React.FC<{ k: number; top: number; sub?: boolean; children: React.ReactNode }> = ({ k, top, sub, children }) => (
  <div style={{
    position: 'absolute', left: 0, right: 0, textAlign: 'center', top,
    opacity: k, transform: `translateY(${(1 - k) * 16}px)`, filter: `blur(${(1 - k) * 8}px)`, pointerEvents: 'none',
  }}>
    {sub ? (
      <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 500, color: C.text2 }}>{children}</div>
    ) : (
      <div style={{ fontFamily: FONT, fontSize: 58, fontWeight: 750, color: C.ink, lineHeight: 1.12 }}>{children}</div>
    )}
  </div>
);

/** which order sites the route has reached - returns 0/1 per site */
function Rustle(sites: { x: number; y: number }[], pos: { x: number; y: number }) {
  return sites.map((s) => {
    const d = Math.abs(s.x - pos.x) + Math.abs(s.y - pos.y);
    return d < 1.5 ? 1 : 0;
  });
}