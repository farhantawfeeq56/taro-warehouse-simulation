// Inventory placement generator.
//
// This module is intentionally additive: it takes a Warehouse that was
// already laid out by the layout generator and decides *where* each SKU
// should live across the shelf bins. It does NOT mutate order generation,
// simulation logic, picking strategies, or worker behavior. It only
// writes `StorageLocation` entries onto shelf cells.
//
// The first placement variable is **Slotting Bias**, a 0..100 slider that
// answers: "How strongly should product demand influence storage location?"
//
//   • 0  (Random)        — SKUs are placed almost randomly (seeded).
//   • 100 (Demand-Based) — high-demand SKUs are placed closest to the
//                          dispatch point (workerStart).
//   • in between         — the two signals are blended smoothly.
//
// The algorithm is a single linear blend of two per-SKU ranks (see
// `planSlottingBias` below), which makes the slider transition perfectly
// continuous and keeps the implementation modular.
//
// Inventory is NEVER generated here. The caller supplies the exact `Item[]`
// produced by the Inventory Generation section (SKU Count + Demand
// Distribution + Product Affinity). Placement consumes those items as-is;
// only their *location* is decided. The inventory itself (which SKUs exist,
// their demand scores) is not modified.

import type { Cell, Item, StorageLocation, Warehouse } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';

/**
 * Inventory placement configuration.
 *
 * `items` is the generated inventory to place (one SKU per item, carrying
 * its `demandScore`). `slottingBias` is the 0..100 slider value. `seed`
 * makes the random end reproducible.
 */
export interface InventoryPlacementConfig {
  /** Generated inventory to place. Defaults to an empty list. */
  items?: Item[];
  /**
   * Slotting Bias slider value, 0 (Random) .. 100 (Demand-Based).
   * Values outside this range are clamped. Defaults to 0.
   */
  slottingBias?: number;
  /** Optional seed for reproducible generation. Defaults to a fixed seed. */
  seed?: number;
}

/**
 * Result of applying placement. The `warehouse` is the enriched warehouse;
 * `placement` describes where each SKU landed and — crucially — which SKUs
 * could not be placed when there are more SKUs than bins.
 */
export interface InventoryPlacementResult {
  warehouse: Warehouse;
  /** Number of shelf bins the warehouse has. */
  binCount: number;
  /** Number of SKUs actually placed (one per bin, never duplicated). */
  placedCount: number;
  /**
   * SKUs that could NOT be placed because the warehouse has fewer bins
   * than generated items. Inventory is never silently dropped: this list is
   * surfaced to the caller so it can react (warn the user, expand the
   * layout, etc.). Order matches the input `items` order for the overflow.
   */
  unplacedSkus: string[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function listShelves(warehouse: Warehouse): { x: number; y: number; cell: Cell }[] {
  const shelves: { x: number; y: number; cell: Cell }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf') {
        shelves.push({ x, y, cell });
      }
    }
  }
  return shelves;
}

/**
 * Deterministic PRNG (mulberry32) — same family as `lib/taro/demand.ts` so
 * placement randomness is reproducible per seed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dispatch point used for proximity scoring. Falls back to a corner of the
 * grid (bottom-left) when the warehouse has no explicit `workerStart`, so
 * placement is still well-defined for imported/edge-case warehouses.
 */
function dispatchPoint(warehouse: Warehouse): { x: number; y: number } {
  if (warehouse.workerStart) return warehouse.workerStart;
  return { x: 0, y: warehouse.height - 1 };
}

/** Manhattan distance from a bin to the dispatch point. */
function manhattanToDispatch(
  x: number,
  y: number,
  dispatch: { x: number; y: number }
): number {
  return Math.abs(x - dispatch.x) + Math.abs(y - dispatch.y);
}

/* -------------------------------------------------------------------------- */
/* Bin model                                                                  */
/* -------------------------------------------------------------------------- */

interface Bin {
  x: number;
  y: number;
  z: number;
  /** Manhattan distance to the dispatch point. */
  distance: number;
  /**
   * Proximity rank in [0,1]: 0 = closest bin to dispatch, 1 = farthest.
   * Lower z is preferred on a given shelf via a tie-breaker.
   */
  proximityRank: number;
}

/**
 * Enumerate every placeable bin across the warehouse shelves and assign each
 * a proximity rank. The number of z-levels per shelf follows the same
 * deterministic 1..3 cycling used previously (this is *capacity*, not
 * inventory — it is not modified by slotting bias).
 */
function enumerateBins(warehouse: Warehouse): Bin[] {
  const shelves = listShelves(warehouse);
  if (shelves.length === 0) return [];

  const dispatch = dispatchPoint(warehouse);

  const raw: { x: number; y: number; z: number; distance: number }[] = [];
  shelves.forEach((shelf, i) => {
    const zLevels = (i % 3) + 1; // 1, 2, or 3 — bin capacity, unchanged.
    for (let z = 1; z <= zLevels; z++) {
      raw.push({
        x: shelf.x,
        y: shelf.y,
        z,
        distance: manhattanToDispatch(shelf.x, shelf.y, dispatch),
      });
    }
  });

  // Sort nearest-first; tie-break by z (lower level closer to the picker).
  raw.sort((a, b) =>
    a.distance !== b.distance
      ? a.distance - b.distance
      : a.z - b.z
  );

  const n = raw.length;
  return raw.map((b, i) => ({
    ...b,
    proximityRank: n > 1 ? i / (n - 1) : 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Core planner: Rank-Blended Slotting                                        */
/* -------------------------------------------------------------------------- */

/**
 * Decide a placement order for the supplied items under the slotting-bias
 * model.
 *
 * Each SKU receives two ranks in [0,1]:
 *   • demandRank   — 0 = highest demand, 1 = lowest demand.
 *   • randomRank   — a seeded, reproducible uniform rank.
 *
 * The blended priority is `P = (1 - t) * randomRank + t * demandRank` where
 * `t = slottingBias / 100`. SKUs are returned sorted by `P` ascending, so
 * the first SKU in the result should occupy the nearest bin.
 *
 * At t = 0 the order is purely random (seeded); at t = 1 it is purely
 * demand-based (highest demand → first). The blend is linear, so the slider
 * transitions smoothly with no discontinuities.
 */
function planSlottingBias(items: Item[], slottingBias: number, seed: number): Item[] {
  if (items.length === 0) return [];
  const t = Math.min(1, Math.max(0, slottingBias / 100));

  // Demand rank: sort by demandScore desc (stable on input order for ties).
  const byDemand = items
    .map((item, idx) => ({ item, idx, score: item.demandScore ?? 0 }))
    .sort((a, b) =>
      a.score !== b.score ? b.score - a.score : a.idx - b.idx
    );
  const demandRankByIndex = new Map<string, number>();
  const m = byDemand.length;
  byDemand.forEach((entry, i) => {
    demandRankByIndex.set(entry.item.id, m > 1 ? i / (m - 1) : 0);
  });

  // Random rank: reproducible per-item uniform draw.
  const rng = mulberry32(seed);
  const randomRankByIndex = new Map<string, number>();
  for (const item of items) {
    randomRankByIndex.set(item.id, rng());
  }

  return items
    .map((item) => {
      const dr = demandRankByIndex.get(item.id) ?? 1;
      const rr = randomRankByIndex.get(item.id) ?? 0;
      return { item, priority: (1 - t) * rr + t * dr };
    })
    .sort((a, b) => a.priority - b.priority)
    .map((entry) => entry.item);
}

/* -------------------------------------------------------------------------- */
/* Preview metadata (used by the live preview in the modal)                   */
/* -------------------------------------------------------------------------- */

export interface ShelfPlacementPreview {
  x: number;
  y: number;
  /**
   * Highest demand score among the SKUs placed on this shelf (0 if empty).
   * Reflects slotting bias: at high bias, shelves near dispatch show the
   * largest values.
   */
  demand: number;
  /**
   * Normalized proximity to dispatch in [0,1]: 0 = closest shelf to
   * dispatch, 1 = farthest. Independent of bias — purely geometric.
   */
  proximity: number;
  /** true if the shelf holds at least one placed SKU. */
  active: boolean;
  /** Z-levels of capacity on this shelf (1..3). */
  zLevels: number;
}

export interface InventoryPlacementPreview {
  shelves: ShelfPlacementPreview[];
  /** Highest demand score across all placed SKUs. */
  maxDemand: number;
  /** Number of SKUs that could not be placed (more SKUs than bins). */
  unplacedCount: number;
  /** Total bin capacity of the warehouse. */
  binCount: number;
}

/* -------------------------------------------------------------------------- */
/* Internal: full plan (bins + sku order) shared by preview & apply           */
/* -------------------------------------------------------------------------- */

interface PlacementPlan {
  bins: Bin[];
  /** Items in placement order (length = min(bins.length, items.length)). */
  orderedItems: Item[];
  /** SKUs that did not fit (overflow). */
  unplacedSkus: string[];
}

function buildPlan(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): PlacementPlan {
  const items = config.items ?? [];
  const slottingBias = config.slottingBias ?? 0;
  const seed = config.seed ?? 42;

  const bins = enumerateBins(warehouse);
  const orderedAll = planSlottingBias(items, slottingBias, seed);

  const placeable = Math.min(bins.length, orderedAll.length);
  const orderedItems = orderedAll.slice(0, placeable);
  const unplacedSkus = orderedAll.slice(placeable).map((i) => i.id);

  return { bins, orderedItems, unplacedSkus };
}

/* -------------------------------------------------------------------------- */
/* Public preview                                                             */
/* -------------------------------------------------------------------------- */

export function computePlacementPreview(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): InventoryPlacementPreview {
  const { bins, orderedItems, unplacedSkus } = buildPlan(warehouse, config);
  const shelves = listShelves(warehouse);

  // Map each placed SKU to its bin.
  const skuByBinKey = new Map<string, Item>();
  for (let i = 0; i < orderedItems.length; i++) {
    const bin = bins[i];
    const item = orderedItems[i];
    skuByBinKey.set(`${bin.x},${bin.y}`, item);
  }

  // Per-shelf proximity (normalized across shelves only, for stable preview).
  const dispatch = dispatchPoint(warehouse);
  const shelfDistances = shelves.map((s) =>
    manhattanToDispatch(s.x, s.y, dispatch)
  );
  const maxShelfDist = shelfDistances.length
    ? Math.max(...shelfDistances)
    : 0;
  const minShelfDist = shelfDistances.length
    ? Math.min(...shelfDistances)
    : 0;
  const shelfSpan = Math.max(1, maxShelfDist - minShelfDist);

  // z-level capacity per shelf (matches enumerateBins cycling).
  const shelfZLevels = new Map<string, number>();
  shelves.forEach((s, i) => shelfZLevels.set(`${s.x},${s.y}`, (i % 3) + 1));

  const maxDemand = orderedItems.reduce(
    (max, item) => Math.max(max, item.demandScore ?? 0),
    0
  );

  const shelfPreviews: ShelfPlacementPreview[] = shelves.map((s) => {
    const key = `${s.x},${s.y}`;
    const item = skuByBinKey.get(key);
    const dist = manhattanToDispatch(s.x, s.y, dispatch);
    return {
      x: s.x,
      y: s.y,
      demand: item ? item.demandScore ?? 0 : 0,
      proximity: (dist - minShelfDist) / shelfSpan,
      active: Boolean(item),
      zLevels: shelfZLevels.get(key) ?? 1,
    };
  });

  return {
    shelves: shelfPreviews,
    maxDemand,
    unplacedCount: unplacedSkus.length,
    binCount: bins.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Apply placement to a warehouse (used by Generate Warehouse)                */
/* -------------------------------------------------------------------------- */

export function applyInventoryPlacement(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): Warehouse {
  return applyInventoryPlacementDetailed(warehouse, config).warehouse;
}

/**
 * Apply placement and return the detailed result, including any SKUs that
 * could not be placed because the warehouse has fewer bins than items.
 * Prefer this entry point from the UI so overflow is never silently lost.
 */
export function applyInventoryPlacementDetailed(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): InventoryPlacementResult {
  const { bins, orderedItems, unplacedSkus } = buildPlan(warehouse, config);

  // 1. Clear existing storage locations on every shelf cell.
  const newGrid: Cell[][] = warehouse.grid.map((row) =>
    row.map((cell) => ({ ...cell, locations: [] as StorageLocation[] }))
  );

  // 2. Write the placed SKUs into their assigned bins. Quantities and
  //    z-level capacities are unchanged from the placeholder model — only
  //    *which* SKU lives in *which* bin is influenced by slotting bias.
  for (let i = 0; i < orderedItems.length; i++) {
    const bin = bins[i];
    const item = orderedItems[i];
    const locationId = getShelfLocationId(bin.x, bin.y);
    const quantity = 50; // placeholder uniform stock; inventory not modified.

    const storage: StorageLocation = {
      id: `${item.id}@${bin.x},${bin.y},${bin.z}`,
      locationId,
      x: bin.x,
      y: bin.y,
      z: bin.z,
      sku: item.id,
      quantity,
    };

    newGrid[bin.y][bin.x].locations.push(storage);
    newGrid[bin.y][bin.x].type = 'shelf';
  }

  // Active shelves = shelves that received at least one SKU.
  const activeKeys = new Set<string>();
  for (let i = 0; i < orderedItems.length; i++) {
    activeKeys.add(`${bins[i].x},${bins[i].y}`);
  }

  const next: Warehouse = {
    ...warehouse,
    grid: newGrid,
    shelves: Array.from(activeKeys).map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    }),
    locations: buildCoordinateLocations({ ...warehouse, grid: newGrid }),
  };

  return {
    warehouse: next,
    binCount: bins.length,
    placedCount: orderedItems.length,
    unplacedSkus,
  };
}

export const DEFAULT_INVENTORY_PLACEMENT: InventoryPlacementConfig = {
  items: [],
  slottingBias: 0,
};
