// Inventory placement generator.
//
// This module is intentionally additive: it takes a Warehouse that was
// already laid out by the layout generator and decides *where* each SKU
// should live across the shelf bins. It does NOT mutate order generation,
// simulation logic, picking strategies, or worker behavior. It only
// writes `StorageLocation` entries onto shelf cells.
//
// There are two Inventory Placement variables, and they answer two
// structurally different questions:
//
//   1. Slotting Bias (0..100) — an ORDERING question:
//        "How strongly should product demand influence storage location?"
//        • 0  (Random)        — SKUs are placed almost randomly (seeded).
//        • 100 (Demand-Based) — high-demand SKUs are placed closest to the
//                               dispatch point (workerStart).
//        • in between         — the two signals are blended smoothly.
//
//   2. Category Clustering (0..100) — a SPATIAL PARTITIONING question:
//        "How strongly should products of the same category be stored
//         together (in contiguous zones)?"
//        • 0   (Scattered)   — categories are mixed throughout the warehouse
//                             (this is exactly the pure Slotting Bias plan).
//        • 100 (Clustered)   — each category occupies a single contiguous
//                             zone; Slotting Bias decides WHERE those zones
//                             and the SKUs within them sit.
//        • in between         — a smooth transition between the two complete
//                             placements (see below).
//
// The two variables are NOT applied as two sequential steps. Category
// Clustering is modelled as a complete, valid placement plan of its own
// (the "clustered layout") and Slotting Bias produces another complete plan
// (the "scatter layout"). The slider *interpolates between those two complete
// plans* into a single final ordering, which is then mapped onto the bins.
// Because both endpoints are real, independent placements (an ordering
// task for slotting vs. a partitioning task for clustering), the slider does
// not collapse clustering into "just another ranking" — clustering only
// exists as a thing because it produces contiguous category zones in its own
// plan, something a per-SKU rank can never express.
//
// Inventory is NEVER generated here. The caller supplies the exact `Item[]`
// produced by the Inventory Generation section (SKU Count + Demand
// Distribution + Product Affinity, plus the auto-generated `category`
// supporting field). Placement consumes those items as-is; only their
// *location* is decided. The inventory itself (which SKUs exist, their demand
// scores, their categories) is not modified.

import type { Cell, Item, StorageLocation, Warehouse } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';
import { FOOTPRINT_FMAX } from './footprint';

/**
 * Inventory placement configuration.
 *
 * `items` is the generated inventory to place (one SKU per item, carrying
 * its `demandScore` and `category`). `slottingBias` and the
 * `categoryClustering` slider both range 0..100. `seed` makes the random end
 * reproducible.
 */
export interface InventoryPlacementConfig {
  /** Generated inventory to place. Defaults to an empty list. */
  items?: Item[];
  /**
   * Slotting Bias slider value, 0 (Random) .. 100 (Demand-Based).
   * Values outside this range are clamped. Defaults to 0.
   */
  slottingBias?: number;
  /**
   * Category Clustering slider value, 0 (Scattered) .. 100 (Clustered).
   * Values outside this range are clamped. Defaults to 0. At 0 the result is
   * identical to the pure Slotting Bias plan (no zone structure). At 100 each
   * category occupies a single contiguous zone, with Slotting Bias deciding
   * the zone order (by mean demand) and the SKU order within each zone.
   * Defaults to 0.
   */
  categoryClustering?: number;
  /** Optional seed for reproducible generation. Defaults to a fixed seed. */
  seed?: number;
}

/**
 * Result of applying placement. The `warehouse` is the enriched warehouse;
 * `placement` describes where each SKU landed and — crucially — which SKUs
 * could not be placed when the total required bins exceed available capacity.
 */
export interface InventoryPlacementResult {
  warehouse: Warehouse;
  /** Number of shelf bins the warehouse has. */
  binCount: number;
  /** Number of SKUs actually placed. */
  placedCount: number;
  /**
   * Number of storage locations actually occupied. Equals `Σ storageFootprint`
   * over the placed SKUs. With no footprint set this equals `placedCount`.
   */
  placedBinCount: number;
  /**
   * SKUs that could NOT be placed because the warehouse has insufficient
   * contiguous capacity for the ordered SKU list. Placement is ORDER-
   * PRESERVING: bins are allocated in placement order, each SKU consuming
   * `storageFootprint` contiguous bins; the moment a SKU cannot fit in the
   * remaining capacity, that SKU AND every subsequent SKU are marked
   * unplaced (no leapfrogging). Inventory is never silently dropped: this
   * list is surfaced to the caller so it can react (warn the user, expand
   * the layout, etc.). Order matches the placement order for the overflow.
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
/* Core planner: Category-Zone Clustered Placement                            */
/* -------------------------------------------------------------------------- */

/**
 * Decide a placement order for the supplied items under the category-zone
 * (clustered) model. This is a COMPLETE, valid placement plan expressed as an
 * ordering of SKUs: because bins are filled in a fixed physical sequence
 * (`enumerateBins`), consecutive entries in this ordering occupy consecutive
 * bins — i.e. a contiguous zone. Same-category SKUs are kept in a single
 * contiguous run, so at `categoryClustering = 100` each category occupies one
 * compact zone (a contiguous band of the dispatch-proximity sequence).
 *
 * Slotting Bias governs two ORDERING decisions on top of that partition:
 *   • WHICH zone is near dispatch — categories are ordered by mean demand
 *     (highest-mean-demand category first → nearest dispatch). At slotting 0
 *     the category order is a seeded random permutation instead.
 *   • WHICH SKU sits at the front of a zone — within a category, SKUs are
 *     ordered by demand (highest-demand first → front of the zone). At
 *     slotting 0 the within-zone order is seeded random instead.
 *
 * Both of those are pure ranking decisions (the thing Slotting Bias is), so
 * clustering never has to invent a spatial "score" — the spatial structure
 * comes solely from the zone partition, and Slotting Bias only reorders within
 * and across the already-contiguous zones.
 *
 * Note: this plan only reads `item.category`. It does not touch `affinityGroup`
 * (independent concept). When fewer than two distinct categories exist, the
 * clustered plan is identical to the scatter plan, so clustering becomes a
 * no-op and the result equals the pure Slotting Bias placement for any slider
 * value (graceful fallback for warehouses whose inventory lacks `category`).
 */
function planCategoryClustering(
  items: Item[],
  slottingBias: number,
  seed: number
): Item[] {
  if (items.length === 0) return items;

  // Identify distinct categories. SKUs with a missing `category` are each
  // treated as their own singleton pseudo-category, so they cannot spuriously
  // form zones.
  const pseudoBase = -1; // negative pseudo-ids never collide with real ones.
  let pseudoNext = pseudoBase;
  const catOf = new Map<string, number>();
  let realCategories = new Set<number>();
  for (const item of items) {
    if (item.category != null && item.category > 0) {
      catOf.set(item.id, item.category);
      realCategories.add(item.category);
    } else {
      catOf.set(item.id, --pseudoNext); // unique singleton pseudo-category
    }
  }

  // Graceful fallback: nothing real to cluster → behave as the scatter plan.
  if (realCategories.size < 2) {
    return planSlottingBias(items, slottingBias, seed);
  }

  const t = Math.min(1, Math.max(0, slottingBias / 100));

  // --- Category order (which zone is nearest dispatch) -------------------- //
  // Each category gets a demand rank (0 = highest mean demand) and a seeded
  // random rank; the blended priority orders the zones. Identical machinery
  // to the per-SKU ranks in `planSlottingBias`, just aggregated to the
  // category level.
  const catItems = new Map<number, Item[]>();
  for (const item of items) {
    const c = catOf.get(item.id)!;
    const arr = catItems.get(c);
    if (arr) arr.push(item);
    else catItems.set(c, [item]);
  }
  const cats = Array.from(catItems.keys());

  const catMeanDemand = new Map<number, number>();
  for (const c of cats) {
    const arr = catItems.get(c)!;
    const mean = arr.reduce((s, it) => s + (it.demandScore ?? 0), 0) / arr.length;
    catMeanDemand.set(c, mean);
  }
  const catsByDemand = cats
    .map((c, idx) => ({ c, idx, mean: catMeanDemand.get(c)! }))
    .sort((a, b) => (a.mean !== b.mean ? b.mean - a.mean : a.idx - b.idx));
  const cDemandRank = new Map<number, number>();
  const k = catsByDemand.length;
  catsByDemand.forEach((entry, i) => {
    cDemandRank.set(entry.c, k > 1 ? i / (k - 1) : 0);
  });

  const catRng = mulberry32(seed ^ 0x9e3779b1); // decorrelate from SKU ranks.
  const cRandomRank = new Map<number, number>();
  for (const c of cats) cRandomRank.set(c, catRng());

  const catPriority = new Map<number, number>();
  for (const c of cats) {
    const dr = cDemandRank.get(c)!;
    const rr = cRandomRank.get(c)!;
    catPriority.set(c, (1 - t) * rr + t * dr);
  }
  // Sort categories so the lowest priority comes first (= nearest dispatch).
  const catsOrdered = cats
    .slice()
    .sort((a, b) => catPriority.get(a)! - catPriority.get(b)!);

  // --- Within-category order (which SKU fronts its zone) ------------------ //
  // Demand rank keyed per SKU, ranked WITHIN its own category, plus the same
  // seeded per-SKU random rank family used by the scatter plan (but drawn
  // from a stream seeded independently of the scatter draw so the two plans
  // are decorrelated — the interpolation only needs the endpoints, not shared
  // randomness).
  const rng = mulberry32(seed ^ 0x1521d3f5);
  const itemRandomRank = new Map<string, number>();
  for (const item of items) itemRandomRank.set(item.id, rng());

  const order: Item[] = [];
  for (const c of catsOrdered) {
    const arr = catItems.get(c)!;
    const m = arr.length;
    const byDemand = arr
      .map((item, idx) => ({ item, idx, score: item.demandScore ?? 0 }))
      .sort((a, b) => (a.score !== b.score ? b.score - a.score : a.idx - b.idx));
    const demandRank = new Map<string, number>();
    byDemand.forEach((entry, i) => {
      demandRank.set(entry.item.id, m > 1 ? i / (m - 1) : 0);
    });

    const within = arr
      .map((item) => {
        const dr = demandRank.get(item.id) ?? 1;
        const rr = itemRandomRank.get(item.id) ?? 0;
        return { item, priority: (1 - t) * rr + t * dr };
      })
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.item);
    order.push(...within);
  }

  return order;
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
  /**
   * Number of bins on this shelf that are occupied (0..zLevels). When a SKU
   * has a `storageFootprint` > 1 it may fill multiple bins on the same shelf.
   */
  occupiedBins: number;
  /**
   * Category id placed on this shelf (undefined when the shelf has no SKU or
   * when its SKU carries no category). Identical across a contiguous zone at
   * high clustering, mixed at low clustering.
   */
  category?: number;
}

export interface InventoryPlacementPreview {
  shelves: ShelfPlacementPreview[];
  /** Highest demand score across all placed SKUs. */
  maxDemand: number;
  /** Number of SKUs that could not be placed (insufficient contiguous capacity). */
  unplacedCount: number;
  /** Total bin capacity of the warehouse. */
  binCount: number;
  /** Number of distinct categories among the placed SKUs (0 if none). */
  categoryCount: number;
  /** Number of storage locations the inventory requires: `Σ storageFootprint`. */
  totalBinsWanted: number;
  /** Number of storage locations actually occupied by the placed SKUs. */
  placedBinCount: number;
}

/* -------------------------------------------------------------------------- */
/* Internal: full plan (bins + sku order) shared by preview & apply           */
/* -------------------------------------------------------------------------- */

interface PlacementPlan {
  bins: Bin[];
  /** Items in placement order that were placed (each consumed its full footprint). */
  orderedItems: Item[];
  /**
   * Per placed SKU, the bins it occupies (index-aligned with `orderedItems`).
   * Length === orderedItems.length; each entry is a contiguous slice of `bins`
   * in dispatch-proximity order. The first bin of each slice is the SKU's
   * PRIMARY (nearest-to-dispatch) bin.
   */
  itemBins: Bin[][];
  /** SKUs that did not fit (overflow). */
  unplacedSkus: string[];
}

function buildPlan(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): PlacementPlan {
  const items = config.items ?? [];
  const slottingBias = config.slottingBias ?? 0;
  const categoryClustering = config.categoryClustering ?? 0;
  const seed = config.seed ?? 42;

  const bins = enumerateBins(warehouse);

  // Two complete, valid placement plans, each expressed as an ordering of
  // every SKU. Because bins are filled in a fixed physical sequence
  // (`enumerateBins`), "ordering position" === "which bin": position 0 is the
  // first bin in the sequence, etc. Both plans therefore assign every SKU a
  // concrete tour position along the SAME bin sequence, which is what lets us
  // interpolate between them.
  const scatterOrder = planSlottingBias(items, slottingBias, seed);
  const clusteredOrder = planCategoryClustering(items, slottingBias, seed);

  // Interpolate between the two plans. Each SKU's final tour position is a
  // convex combination of its position in the scatter plan and its position
  // in the clustered plan:
  //     p(sku) = (1 - t) * pScatter(sku) + t * pCluster(sku)
  // Sorting every SKU by this interpolated position yields a single final
  // ordering — a new, valid placement in the same family, smoothly
  // transitioning between the two endpoints.
  //   • t = 0 ⇒ p = pScatter ⇒ the final ordering IS the scatter plan exactly.
  //   • t = 1 ⇒ p = pCluster ⇒ the final ordering IS the clustered plan exactly.
  // The secondary tie-break by pCluster guarantees an exact match at t = 1,
  // and the input-index tie-break keeps everything deterministic.
  const t = Math.min(1, Math.max(0, categoryClustering / 100));
  let orderedAll: Item[];
  if (t === 0) {
    // Pure scatter: identical to the pre-clustering behaviour (preserves the
    // exact Slotting Bias placement for backward compatibility).
    orderedAll = scatterOrder;
  } else if (t === 1) {
    // Pure clustered: each category occupies a single contiguous zone.
    orderedAll = clusteredOrder;
  } else {
    const pScatter = new Map<string, number>();
    scatterOrder.forEach((item, i) => pScatter.set(item.id, i));
    const pCluster = new Map<string, number>();
    clusteredOrder.forEach((item, i) => pCluster.set(item.id, i));

    orderedAll = items
      .map((item, inputIndex) => {
        const ps = pScatter.get(item.id) ?? 0;
        const pc = pCluster.get(item.id) ?? 0;
        return { item, key: (1 - t) * ps + t * pc, pc, inputIndex };
      })
      .sort(
        (a, b) =>
          a.key !== b.key
            ? a.key - b.key
            : a.pc !== b.pc
              ? a.pc - b.pc
              : a.inputIndex - b.inputIndex
      )
      .map((entry) => entry.item);
  }

  // --- Footprint-aware, ORDER-PRESERVING bin allocation ------------------- //
  // Bins are enumerated in dispatch-proximity order (`enumerateBins`), so
  // consecutive bins in `bins` are physically adjacent — the compactness
  // order. We walk the ordered SKU list and hand each SKU the next
  // `storageFootprint` contiguous bins. The FIRST bin a SKU claims is its
  // PRIMARY (nearest-to-dispatch of its group) — downstream resolution,
  // simulation, and UI labels treat it as the canonical pick location.
  //
  // Overflow is ORDER-PRESERVING: the moment a SKU cannot fit in the
  // remaining capacity, that SKU AND every subsequent SKU are marked
  // unplaced. Smaller SKUs never leapfrog larger ones; the meaning of the
  // placement order is preserved and the result is fully deterministic.
  //   • With `storageFootprint` absent/1, this walk is byte-identical to the
  //     pre-footprint slice, so all legacy behaviour is preserved.
  const orderedItems: Item[] = [];
  const itemBins: Bin[][] = [];
  const unplacedSkus: string[] = [];
  let cursor = 0;
  let overflowed = false;
  for (const item of orderedAll) {
    const f = clampFootprint(item.storageFootprint);
    if (overflowed || cursor + f > bins.length) {
      // Stop placing: once one SKU cannot fit, no further SKU is placed.
      overflowed = true;
      unplacedSkus.push(item.id);
      continue;
    }
    orderedItems.push(item);
    itemBins.push(bins.slice(cursor, cursor + f));
    cursor += f;
  }

  return { bins, orderedItems, itemBins, unplacedSkus };
}

/**
 * Clamp a raw footprint value to a safe positive integer in [1, FOOTPRINT_FMAX].
 * Missing/zero/negative footprints default to 1 (the legacy one-bin-per-SKU
 * behaviour). The cap matches the generator's `FOOTPRINT_FMAX` so placement
 * never trusts an out-of-range value.
 */
function clampFootprint(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(FOOTPRINT_FMAX, Math.max(1, Math.floor(raw)));
}

/* -------------------------------------------------------------------------- */
/* Public preview                                                             */
/* -------------------------------------------------------------------------- */

export function computePlacementPreview(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): InventoryPlacementPreview {
  const { bins, orderedItems, itemBins, unplacedSkus } = buildPlan(warehouse, config);
  const shelves = listShelves(warehouse);

  // Count how many bins each shelf occupies. A SKU with footprint > 1 may
  // fill several bins, potentially on the same shelf.
  const occupiedBinsByShelf = new Map<string, number>();
  let placedBinCount = 0;
  for (const group of itemBins) {
    for (const bin of group) {
      const key = `${bin.x},${bin.y}`;
      occupiedBinsByShelf.set(key, (occupiedBinsByShelf.get(key) ?? 0) + 1);
      placedBinCount++;
    }
  }

  // The SKU occupying each shelf (for demand/category preview). Use the
  // primary bin's item so a multi-bin SKU reports its own demand/category.
  const skuByBinKey = new Map<string, Item>();
  for (let i = 0; i < orderedItems.length; i++) {
    const primaryBin = itemBins[i][0];
    skuByBinKey.set(`${primaryBin.x},${primaryBin.y}`, orderedItems[i]);
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

  // Distinct categories among the placed SKUs (real ids only, > 0).
  const placedCategoryIds = new Set<number>();
  for (const item of orderedItems) {
    if (item.category != null && item.category > 0) {
      placedCategoryIds.add(item.category);
    }
  }

  // Total bins the inventory WANTS: `Σ storageFootprint` over the FULL
  // generated inventory (placed + unplaced). This is the metric the overflow
  // readout compares against `binCount`.
  let totalBinsWanted = 0;
  for (const item of config.items ?? []) {
    totalBinsWanted += clampFootprint(item.storageFootprint);
  }

  const shelfPreviews: ShelfPlacementPreview[] = shelves.map((s) => {
    const key = `${s.x},${s.y}`;
    const item = skuByBinKey.get(key);
    const dist = manhattanToDispatch(s.x, s.y, dispatch);
    const category =
      item && item.category != null && item.category > 0
        ? item.category
        : undefined;
    return {
      x: s.x,
      y: s.y,
      demand: item ? item.demandScore ?? 0 : 0,
      proximity: (dist - minShelfDist) / shelfSpan,
      active: Boolean(item),
      zLevels: shelfZLevels.get(key) ?? 1,
      occupiedBins: occupiedBinsByShelf.get(key) ?? 0,
      category,
    };
  });

  return {
    shelves: shelfPreviews,
    maxDemand,
    unplacedCount: unplacedSkus.length,
    binCount: bins.length,
    categoryCount: placedCategoryIds.size,
    totalBinsWanted,
    placedBinCount,
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
 * could not be placed because the total required bins exceed available
 * capacity. Prefer this entry point from the UI so overflow is never
 * silently lost.
 */
export function applyInventoryPlacementDetailed(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): InventoryPlacementResult {
  const { bins, orderedItems, itemBins, unplacedSkus } = buildPlan(warehouse, config);

  // 1. Clear existing storage locations on every shelf cell.
  const newGrid: Cell[][] = warehouse.grid.map((row) =>
    row.map((cell) => ({ ...cell, locations: [] as StorageLocation[] }))
  );

  // 2. Write the placed SKUs into their assigned bins. Each SKU consumes its
  //    `storageFootprint` contiguous bins (itemBins[i]); the FIRST bin of
  //    each group is marked `primary: true` so downstream resolution,
  //    simulation, and UI labels treat it as the canonical pick location.
  //    Quantities and z-level capacities are unchanged from the placeholder
  //    model — only *which* SKU lives in *which* bin(s) is influenced by
  //    slotting bias / clustering / footprint.
  let placedBinCount = 0;
  for (let i = 0; i < orderedItems.length; i++) {
    const item = orderedItems[i];
    const group = itemBins[i];
    for (let g = 0; g < group.length; g++) {
      const bin = group[g];
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
        primary: g === 0, // first bin of the group is the pick location
      };

      newGrid[bin.y][bin.x].locations.push(storage);
      newGrid[bin.y][bin.x].type = 'shelf';
      placedBinCount++;
    }
  }

  // Active shelves = shelves that received at least one SKU.
  const activeKeys = new Set<string>();
  for (const group of itemBins) {
    for (const bin of group) activeKeys.add(`${bin.x},${bin.y}`);
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
    placedBinCount,
    unplacedSkus,
  };
}

export const DEFAULT_INVENTORY_PLACEMENT: InventoryPlacementConfig = {
  items: [],
  slottingBias: 0,
  categoryClustering: 0,
};
