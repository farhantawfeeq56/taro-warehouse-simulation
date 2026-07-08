// Product affinity group generation for the Inventory Generation section.
//
// This module is intentionally pure and self-contained: given a SKU count and
// a "product affinity" slider value (0 = Independent, 100 = Highly Related),
// it produces a deterministic affinity-group id for every SKU.
//
// The slider smoothly interpolates between two extremes:
//
//   • Independent    — almost every SKU is its own singleton group. Products
//                      are unrelated and unlikely to be bought together.
//   • Highly Related — SKUs cluster into larger and more frequent groups.
//                      Members of the same group are related and tend to be
//                      ordered together by customers.
//
// Affinity groups are the third Inventory Generation variable (after SKU
// Count and Demand Distribution). Future stages — especially Order
// Generation — consume the produced `affinityGroup` ids to bias which SKUs
// appear together in customer orders.
//
// This module does not depend on any UI or warehouse model, so it is
// trivially testable.

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

/** Fisher–Yates shuffle driven by a seeded PRNG so results are reproducible. */
function seededShuffle<T>(values: T[], seed: number): T[] {
  const out = values.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Slider mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Map a 0..100 slider value to a "continue probability" `p` in [0, 1).
 *
 * Group sizes are drawn from a geometric-ish distribution: starting from a
 * SKU, each subsequent SKU is added to the same group with probability `p`,
 * or starts a new group with probability `1 - p`. The expected group size is
 * therefore `1 / (1 - p)`:
 *
 *   • p = 0   → expected group size 1   (every SKU is independent)
 *   • p → 1   → expected group size → ∞ (very large, infrequent groups)
 *
 * `p` is kept strictly below 1 (via a small epsilon) so the generation loop
 * always terminates and individual group sizes stay bounded by `count`.
 *
 * A square mapping `p = t^2` is used so the slider's low end emphasises the
 * "mostly independent" regime: small slider movements keep groups tiny, and
 * the large-group behaviour only emerges towards the right end of the slider.
 * This matches the intuition that "Independent" should be the common case and
 * "Highly Related" the deliberate, extreme one.
 */
export function affinityToContinueProbability(affinity: number): number {
  const t = Math.min(1, Math.max(0, affinity / 100));
  // Square mapping for a gentler ramp on the independent side.
  const mapped = t * t;
  // Clamp strictly below 1 to keep the expected group size finite.
  const EPS = 1e-6;
  return Math.min(mapped, 1 - EPS);
}

/* -------------------------------------------------------------------------- */
/* Core generation                                                            */
/* -------------------------------------------------------------------------- */

export interface AffinityGenerationConfig {
  /** Number of SKUs to assign to affinity groups. */
  count: number;
  /**
   * Affinity slider value, 0 (Independent) .. 100 (Highly Related).
   * Values outside this range are clamped.
   */
  affinity: number;
  /**
   * Optional seed for reproducible group sizing and SKU-to-group assignment.
   * Defaults to a fixed seed so the same slider config always yields the same
   * grouping (useful for snapshot tests and deterministic order generation).
   */
  seed?: number;
}

/**
 * Draw a single affinity-group size from the continue-probability model.
 *
 * The group starts at size 1; each extra SKU joins the same group with
 * probability `continueProb` until it stops or `maxSize` is reached.
 * `maxSize` bounds the draw to the remaining number of SKUs, so the total
 * always partitions the catalogue exactly.
 */
function sampleGroupSize(
  continueProb: number,
  rng: () => number,
  maxSize: number
): number {
  if (maxSize <= 1) return maxSize;
  let size = 1;
  while (size < maxSize && rng() < continueProb) {
    size++;
  }
  return size;
}

/**
 * Generate an affinity-group id for every one of `count` SKUs.
 *
 * The returned array is index-aligned with the generated SKU list
 * (SKU_001 → index 0, SKU_002 → index 1, …) so callers can zip them together
 * without any further bookkeeping, exactly like `generateDemandScores`.
 *
 * Properties of the returned ids:
 *   • length === count
 *   • every SKU gets exactly one positive integer group id (1-based)
 *   • group ids are contiguous: 1, 2, …, maxGroupId
 *   • at affinity = 0   → every SKU is in its own group (maxGroupId === count)
 *   • at affinity > 0   → some groups contain multiple SKUs, and group sizes
 *                         grow as the slider moves towards Highly Related
 *   • which SKU ids fall into which group is seeded/shuffled so groups are
 *     spread across the catalogue rather than always grouping SKU_001/SKU_002
 */
export function generateAffinityGroups(config: AffinityGenerationConfig): number[] {
  const n = Math.max(0, Math.floor(config.count));
  if (n === 0) return [];

  const continueProb = affinityToContinueProbability(config.affinity);
  const seed = config.seed ?? 42;
  const rng = mulberry32(seed);

  // 1. Draw group sizes until we have partitioned all n SKUs.
  //    The geometric model naturally keeps groups small at low affinity and
  //    produces a few large groups at high affinity.
  const sizes: number[] = [];
  let assigned = 0;
  while (assigned < n) {
    const remaining = n - assigned;
    const size = sampleGroupSize(continueProb, rng, remaining);
    sizes.push(size);
    assigned += size;
  }

  // 2. Shuffle the SKU index order so the group boundaries do not align with
  //    numeric SKU ordering. This makes the groups appear spread across the
  //    catalogue (SKU_001's neighbours in a group are random SKUs, not
  //    adjacent ids), which is important for realistic order generation.
  const shuffledIndices = seededShuffle(
    Array.from({ length: n }, (_, i) => i),
    seed ^ 0x9e3779b9 // decorrelate from the sizing draws
  );

  // 3. Assign a contiguous 1-based group id to each block of shuffled indices.
  const groups = new Array<number>(n);
  let cursor = 0;
  for (let g = 0; g < sizes.length; g++) {
    const groupId = g + 1;
    for (let k = 0; k < sizes[g]; k++) {
      groups[shuffledIndices[cursor++]] = groupId;
    }
  }

  return groups;
}

/* -------------------------------------------------------------------------- */
/* Convenience                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Summarise a set of affinity-group ids with the metrics used by the UI.
 *
 * `groupedShare` is the fraction of SKUs that belong to a non-singleton
 * group (size > 1):
 *   • Independent   → 0   (no SKU is related to another)
 *   • Highly Related → approaches 1 (almost every SKU has group-mates)
 */
export interface AffinitySummary {
  /** Total number of distinct affinity groups. */
  groupCount: number;
  /** Number of groups that contain exactly one SKU (independent SKUs). */
  singletonCount: number;
  /** Number of groups that contain more than one SKU. */
  nonSingletonCount: number;
  /** Size of the largest affinity group. */
  largestGroupSize: number;
  /** Mean number of SKUs per group (count / groupCount). */
  meanGroupSize: number;
  /** Fraction of SKUs in a non-singleton group (0..1). */
  groupedShare: number;
}

export function summarizeAffinityGroups(groups: number[]): AffinitySummary {
  const n = groups.length;
  if (n === 0) {
    return {
      groupCount: 0,
      singletonCount: 0,
      nonSingletonCount: 0,
      largestGroupSize: 0,
      meanGroupSize: 0,
      groupedShare: 0,
    };
  }

  const counts = new Map<number, number>();
  for (const g of groups) {
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  let singletonCount = 0;
  let nonSingletonCount = 0;
  let largestGroupSize = 0;
  let groupedSkus = 0;
  for (const size of counts.values()) {
    if (size === 1) {
      singletonCount++;
    } else {
      nonSingletonCount++;
      groupedSkus += size;
    }
    if (size > largestGroupSize) largestGroupSize = size;
  }

  const groupCount = counts.size;
  return {
    groupCount,
    singletonCount,
    nonSingletonCount,
    largestGroupSize,
    meanGroupSize: groupCount > 0 ? n / groupCount : 0,
    groupedShare: n > 0 ? groupedSkus / n : 0,
  };
}