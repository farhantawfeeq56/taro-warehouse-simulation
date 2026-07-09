// Storage footprint generation for the Inventory Generation section.
//
// This module is intentionally pure and self-contained: given a SKU count
// and a "storage footprint" slider value (0 = Compact, 100 = Bulky), it
// produces a deterministic, positive integer `storageFootprint` for every
// SKU — the number of storage locations that SKU requires.
//
// The slider smoothly interpolates between two extremes:
//
//   • Compact — almost every SKU occupies exactly one storage location.
//   • Bulky   — many SKUs occupy several (contiguous) storage locations,
//               while a compact core of single-bin SKUs always remains
//               (real warehouses always retain some small fast-movers).
//
// `storageFootprint` is an INTRINSIC property of the inventory, generated
// alongside `demandScore`, `affinityGroup`, and `category`. It does NOT
// perform any placement itself — Inventory Placement consumes it to decide
// HOW MANY bins each SKU occupies (and where, jointly with Slotting Bias /
// Category Clustering). Generation never makes a spatial decision.
//
// This module does not depend on any UI or warehouse model, so it is
// trivially testable.

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Hard cap on a single SKU's footprint. Keeps `Σ F_i` from exploding a
 * small warehouse; placement degrades gracefully via the existing
 * `unplacedSkus` path when the total demand exceeds bin capacity.
 */
export const FOOTPRINT_FMAX = 6;

/**
 * Minimum "compactness reachability" probability at the far-right (Bulky)
 * end of the slider. This is the value of `p` at t = 1, so even at maximum
 * bulkiness a meaningful fraction of SKUs stay single-bin — modelling the
 * compact fast-mover core that real warehouses always retain.
 */
export const FOOTPRINT_PMIN = 0.4;

/* -------------------------------------------------------------------------- */
/* Deterministic PRNG (mulberry32)                                            */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Slider mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Map a 0..100 footprint slider value to the geometric success probability
 * `p` used by the capped-geometric generator.
 *
 *   • footprint = 0   (Compact) → p = 1   → P(F=1) = 1 (every SKU single-bin)
 *   • footprint = 100 (Bulky)   → p = PMIN → heavy tail; many multi-bin SKUs
 *
 * The mapping `p(t) = PMIN + (1 - PMIN) * (1 - t)` is linear in `t`, so the
 * slider transitions smoothly with no discontinuities (mirroring the linear
 * `alpha` mapping used by `demand.ts`). `t` is clamped to [0, 1].
 */
export function footprintToP(footprint: number): number {
  const t = Math.min(1, Math.max(0, footprint / 100));
  return FOOTPRINT_PMIN + (1 - FOOTPRINT_PMIN) * (1 - t);
}

/* -------------------------------------------------------------------------- */
/* Core generation                                                            */
/* -------------------------------------------------------------------------- */

export interface FootprintGenerationConfig {
  /** Number of SKUs to assign a footprint to. */
  count: number;
  /**
   * Footprint slider value, 0 (Compact) .. 100 (Bulky).
   * Values outside this range are clamped.
   */
  footprint: number;
  /**
   * Optional seed for reproducible per-SKU draws. Defaults to a fixed seed
   * distinct from the demand, affinity, and category engines so the four
   * inventory-generation assignments are decorrelated even when all use
   * their defaults.
   */
  seed?: number;
}

/**
 * Generate a `storageFootprint` value for every one of `count` SKUs.
 *
 * The returned array is index-aligned with the generated SKU list
 * (SKU_001 → index 0, SKU_002 → index 1, …) so callers can zip it together
 * without any further bookkeeping, exactly like `generateDemandScores`,
 * `generateAffinityGroups`, and `generateCategoryIds`.
 *
 * Each footprint is drawn from a **capped geometric** distribution over
 * `{1, 2, …, FMAX}`:
 *
 *     weight(k) = p * (1 - p)^(k-1)        for k = 1 .. FMAX-1
 *     weight(FMAX) = (1 - p)^(FMAX-1)      (tail mass collapsed onto the cap)
 *     weights are renormalized over the cap so they sum to exactly 1.
 *
 * Properties of the returned values:
 *   • length === count
 *   • every footprint is an integer in [1, FMAX]
 *   • at footprint = 0   → every footprint is exactly 1 (all single-bin)
 *   • at footprint = 100 → heavy tail; mean ≈ 1/PMIN ≈ 2.5, max = FMAX
 *   • the slider moves the mean footprint smoothly between 1 and ~2.5
 */
export function generateFootprints(config: FootprintGenerationConfig): number[] {
  const count = Math.max(0, Math.floor(config.count));
  if (count === 0) return [];

  const p = footprintToP(config.footprint);
  const seed = config.seed ?? 0xf007; // distinct from demand/affinity/category.
  const rng = mulberry32(seed);

  // Precompute the capped-geometric pmf over {1 .. FMAX}.
  const pmf = new Array<number>(FOOTPRINT_FMAX);
  let total = 0;
  for (let k = 1; k <= FOOTPRINT_FMAX; k++) {
    let w: number;
    if (k < FOOTPRINT_FMAX) {
      w = p * Math.pow(1 - p, k - 1);
    } else {
      // Collapse all remaining tail mass onto the cap so the pmf sums to 1.
      w = Math.pow(1 - p, FOOTPRINT_FMAX - 1);
    }
    pmf[k - 1] = w;
    total += w;
  }
  // Renormalize (guards against floating-point drift; total is ~1 already).
  if (total <= 0) {
    // Degenerate: fall back to all-single-bin.
    return new Array<number>(count).fill(1);
  }
  for (let k = 0; k < FOOTPRINT_FMAX; k++) pmf[k] /= total;

  // Build a cumulative distribution for inverse-CDF sampling.
  const cdf = new Array<number>(FOOTPRINT_FMAX);
  let acc = 0;
  for (let k = 0; k < FOOTPRINT_FMAX; k++) {
    acc += pmf[k];
    cdf[k] = acc;
  }
  // Ensure the final bucket reaches exactly 1 (no overflow bucket).
  cdf[FOOTPRINT_FMAX - 1] = 1;

  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const u = rng();
    // Find the first bucket whose cumulative probability exceeds u.
    let k = 1;
    for (; k <= FOOTPRINT_FMAX; k++) {
      if (u <= cdf[k - 1]) break;
    }
    // Clamp defensively (u in [0,1), cdf[FMAX-1] === 1, so k <= FMAX).
    if (k > FOOTPRINT_FMAX) k = FOOTPRINT_FMAX;
    out[i] = k;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Items enrichment helper (used by the layout-config overlay pipeline)       */
/* -------------------------------------------------------------------------- */

import type { Item } from './types';

/**
 * Enrich plain items with a `storageFootprint` value from the footprint
 * engine. Like the other inventory-generation enrichments, every SKU
 * receives exactly one value. Missing/zero footprints are normalized to 1
 * downstream by placement, but the generator always emits ≥ 1.
 *
 * `footprint` is the 0..100 slider value (0 = Compact, 100 = Bulky).
 */
export function assignFootprints(
  items: Item[],
  footprint: number,
  seed?: number
): Item[] {
  if (items.length === 0) return items;
  const footprints = generateFootprints({
    count: items.length,
    footprint,
    seed,
  });
  return items.map((item, i) => ({ ...item, storageFootprint: footprints[i] }));
}

/* -------------------------------------------------------------------------- */
/* Convenience summary (used by the UI)                                       */
/* -------------------------------------------------------------------------- */

export interface FootprintSummary {
  /** Number of SKUs that occupy exactly one storage location. */
  singleBinCount: number;
  /** Number of SKUs that occupy more than one storage location. */
  multiBinCount: number;
  /** Largest footprint assigned to any SKU. */
  largestFootprint: number;
  /** Mean footprint across all SKUs. */
  meanFootprint: number;
  /** Total number of storage locations the inventory requires: `Σ F_i`. */
  totalBins: number;
}

/**
 * Summarise a set of footprints with the metrics used by the UI.
 *
 * `totalBins` is the key overflow metric: it is what Inventory Placement
 * compares against the warehouse's bin capacity to decide how many SKUs
 * can be placed. `multiBinCount` / `meanFootprint` communicate how "bulky"
 * the catalogue is.
 */
export function summarizeFootprints(footprints: number[]): FootprintSummary {
  const n = footprints.length;
  if (n === 0) {
    return {
      singleBinCount: 0,
      multiBinCount: 0,
      largestFootprint: 0,
      meanFootprint: 0,
      totalBins: 0,
    };
  }
  let singleBinCount = 0;
  let multiBinCount = 0;
  let largestFootprint = 0;
  let totalBins = 0;
  for (const f of footprints) {
    const fp = Math.max(1, Math.floor(f));
    if (fp === 1) singleBinCount++;
    else multiBinCount++;
    if (fp > largestFootprint) largestFootprint = fp;
    totalBins += fp;
  }
  return {
    singleBinCount,
    multiBinCount,
    largestFootprint,
    meanFootprint: totalBins / n,
    totalBins,
  };
}
