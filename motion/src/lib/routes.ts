// Route construction + simulated metrics.
// Routes are drawn the way the app draws them: polylines through cell
// centers (L-shaped hops between stops). Metrics use Taro's own math
// (scale 2 m/cell, 60 m/min worker, 6 s/pick, $30/hr labor).

import type { Pt } from './layout';

export interface SimRoute {
  points: Pt[];      // full polyline (cell coords)
  distances: number[]; // cumulative distance in meters up to each point
}

/** L-shaped hop between two cells, alternating corner for visual variety */
function hop(a: Pt, b: Pt, cornerFlip: boolean): Pt[] {
  if (a.x === b.x && a.y === b.y) return [{ ...a }, { ...b }];
  const mid = cornerFlip ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  return [{ ...a }, mid, { ...b }];
}

const seq = (from: Pt, stops: Pt[], cornerFlip: boolean): Pt[] => {
  const out: Pt[] = [{ ...from }];
  let fl = cornerFlip;
  let cur = from;
  for (const s of stops) {
    const h = hop(cur, s, fl).slice(1);
    out.push(...h);
    cur = s;
    fl = !fl;
  }
  return out;
};

const CUMSUM = (pts: Pt[]) => {
  const d: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    d.push(d[i - 1] + (Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)) * 2);
  }
  return d;
};

export function makeRoute(from: Pt, stops: Pt[], cornerFlip = true): SimRoute {
  const points = seq(from, stops, cornerFlip);
  return { points, distances: CUMSUM(points) };
}

export const routeAt = (r: SimRoute, t: number, ease = (x: number) => x) => {
  const k = ease(Math.min(1, Math.max(0, t)));
  const idx = Math.floor(k * (r.points.length - 1));
  const pts = r.points.slice(0, idx + 1);
  const pos = pts[pts.length - 1] ?? r.points[0];
  return { pts, pos, dist: r.distances[idx] ?? 0 };
};

/** greedy nearest-neighbour reordering (batch/zone pickers cluster) */
export function greedyStops(from: Pt, stops: Pt[]): Pt[] {
  const out: Pt[] = [];
  let cur = from;
  const rest = stops.map((p) => ({ ...p }));
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => {
      const d = Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y);
      if (d < bd) { bd = d; bi = i; }
    });
    out.push(rest.splice(bi, 1)[0]);
    cur = out[out.length - 1];
  }
  return out;
}

// ─── metrics (Taro engine math, DEFAULT_WAREHOUSE_PROFILE) ───────────────
export interface SimMetrics {
  dist: number;   // m
  time: number;   // min
  cost: number;   // $ / order
  util: number;   // %
  orders: number;
  workers: number;
}

export function simulateMetrics(
  route: SimRoute,
  orders: number,
  activeWorkers: number,
  configuredWorkers: number,
  picksPerOrder = 5,
): SimMetrics {
  const dist = route.distances[route.distances.length - 1];
  const speed = 60; // m/min
  const pickTime = 6 / 60; // min per pick
  const walk = dist / speed;
  const pick = orders * picksPerOrder * pickTime;
  const time = walk + pick;
  const cost = ((time * (30 / 60)) * activeWorkers) / orders;
  // utilization: share of configured workers that actually picked (faithful
  // to lib/taro: activeWorkers / workerRoutes)
  const util = Math.min(100, (activeWorkers / Math.max(configuredWorkers, 1)) * 100);
  return { dist, time, cost, util, orders, workers: configuredWorkers };
}