// Taro-faithful warehouse layouts.
// Mirrors lib/taro/layout-generator.ts parallel + cross-aisle layout so the
// film's grids are the product's grids.

export type Pt = { x: number; y: number };

export interface Layout {
  width: number;   // cells
  height: number;  // cells
  shelves: Pt[];   // one entry per shelf cell (bay)
  lanes: number[]; // vertical aisle columns between racks
  crossRows: number[]; // empty horizontal rows (cross aisles + padding rows)
  workerStart: Pt;
  rackCount: number;
  gridHeight: number;
}

const OUTER = 2;

export function makeLayout(
  rackCount: number,
  gridHeight: number,
  aisleWidth = 1,
  crossAisleCount = 0,
): Layout {
  const rc = Math.max(1, Math.floor(rackCount));
  const gh = Math.max(1, Math.floor(gridHeight));
  const aw = Math.max(1, Math.floor(aisleWidth));
  const width = rc * 2 + (rc - 1) * aw + 2 * OUTER;
  const height = gh + 2 * OUTER;

  const shelves: Pt[] = [];
  const lanes: number[] = [];
  for (let r = 0; r < rc; r++) {
    const xBase = OUTER + r * (2 + aw);
    for (let o = 0; o < 2; o++) {
      const x = xBase + o;
      for (let ly = 0; ly < gh; ly++) shelves.push({ x, y: ly + OUTER });
    }
    if (r < rc - 1) {
      for (let o = 0; o < aw; o++) lanes.push(xBase + 2 + o);
    }
  }

  const crossRows = [OUTER - 1, gh + OUTER]; // padding rows top/bottom
  if (crossAisleCount > 0) {
    const segCount = crossAisleCount + 1;
    const segHeight = Math.floor(gh / segCount);
    for (let i = 1; i < segCount; i++) {
      const row = i * segHeight;
      if (row > 0 && row < gh) crossRows.push(row + OUTER);
    }
  }

  const workerStart: Pt = {
    x: OUTER + (rc > 1 ? 2 : 0),
    y: height - OUTER - 1,
  };

  return { width, height, shelves, lanes, crossRows, workerStart, rackCount: rc, gridHeight: gh };
}

/** fit a layout into a box, returns cell px + origin so grids stay centered */
export const fitCell = (l: Layout, boxW: number, boxH: number, ratio = 0.92) =>
  Math.min((boxW * ratio) / l.width, boxH * ratio / l.height);

export const cellCenter = (p: Pt, cx0: number, cy0: number, cell: number): { x: number; y: number } => ({
  x: cx0 + (p.x + 0.5) * cell,
  y: cy0 + (p.y + 0.5) * cell,
});

/** random-ish pickups: distinct shelf cells. seeded so renders are stable */
export function pickSites(layout: Layout, n: number, seed: number): Pt[] {
  const full = [...layout.shelves];
  const rnd = mulberry32(seed);
  for (let i = full.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [full[i], full[j]] = [full[j], full[i]];
  }
  const step = Math.max(1, Math.floor(full.length / n));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const s = full[(i * step + Math.floor(rnd() * step)) % full.length];
    out.push({ x: s.x, y: s.y });
  }
  return out;
}

/** deterministic PRNG */
export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** order pick sites per order so routes differ believably per strategy */
export function orderSequence(layout: Layout, n: number, seed: number): Pt[] {
  return pickSites(layout, n, seed);
}