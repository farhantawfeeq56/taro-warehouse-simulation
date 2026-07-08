// Product affinity group generation for the Inventory Generation section.
//
// This module is intentionally pure and self-contained: given a SKU count and
// a "product affinity" slider value (0 = Independent, 100 = Highly Related),
// it produces a deterministic affinity-group id for every SKU.
//
// --------------------------------------------------------------------------- //
// Model: latent product categories with an affinity-scaled group count.      //
// --------------------------------------------------------------------------- //
//
// Real customers do not buy the whole catalogue together. They shop *within*
// product categories (dairy, produce, baking, household, ...). We therefore
// assume the catalogue has an inherent set of latent categories whose number
// scales with the catalogue size, `C = floor(sqrt(N))` (clamped to [2, N]).
// These categories always exist; the affinity slider only controls how finely
// each category is split into affinity sub-groups.
//
//   • Independent    (0)   — every SKU is its own singleton group. SKUs are
//                            unrelated; there is no co-purchase structure.
//   • Highly Related (100) — each latent category becomes a single, large
//                            affinity group. There are several of these
//                            groups (never one giant group), modelling the
//                            fact that maximal affinity still respects
//                            category boundaries.
//
// The number of groups interpolates from N (at 0% affinity) down to C (at
// 100% affinity) using `K = C + (N - C) * (1 - t^2)`. The `(1 - t^2)` ramp is
// flat near t = 0, so the slider's low end keeps the catalogue "almost all
// independent" — small movements stay near all-singletons, and meaningful
// grouping only emerges towards the upper half of the slider.
//
// Group sizes are drawn from a symmetric Dirichlet whose concentration
// (evenness) grows with affinity: at low affinity sizes are uneven (a few
// small groups scattered among many singletons, like a handful of products
// that get bought together), and at high affinity sizes are balanced so that
// the C latent categories end up comparably large rather than one dominant
// group plus noise.
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
 * The number of latent product categories a catalogue of `count` SKUs has.
 *
 * Scales as `floor(sqrt(count))` so bigger catalogues carry more categories
 * (and therefore larger affinity groups at maximum affinity), but is clamped
 * to at least 2 (so "multiple large groups" is always guaranteed once there
 * is more than one SKU) and at most `count` (degenerate small catalogues).
 */
export function latentCategoryCount(count: number): number {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return n;
  return Math.min(Math.max(2, Math.floor(Math.sqrt(n))), n);
}

/**
 * Map a 0..100 affinity slider value to the effective number of affinity
 * groups for a catalogue of `count` SKUs.
 *
 *   • affinity = 0   → `count` groups (every SKU is a singleton)
 *   • affinity = 100 → `latentCategoryCount(count)` groups (one per latent
 *                      category; several large, comparably-sized groups)
 *
 * The interpolation `K = C + (N - C) * (1 - t^2)` is flat near t = 0, so the
 * low end of the slider stays "almost all independent": tiny affinity values
 * still round to all-singletons, and grouping only becomes common towards the
 * upper half of the slider. The result is clamped to `[1, N]` and always
 * integer-valued.
 */
export function affinityToGroupCount(count: number, affinity: number): number {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return 0;
  if (n === 1) return 1;

  const t = Math.min(1, Math.max(0, affinity / 100));
  const c = latentCategoryCount(n);
  // (1 - t^2) is flat near t = 0 (derivative 0 there), giving the gentle
  // "mostly independent" low end. At t = 1 it is exactly 0, so K == C.
  const raw = c + (n - c) * (1 - t * t);
  const k = Math.round(raw);
  return Math.min(Math.max(k, 1), n);
}

/**
 * Concentration (evenness) of the symmetric Dirichlet used to draw group
 * sizes, as a function of affinity `t` in [0, 1].
 *
 * A shape of 1 gives uneven sizes (a few large draws among many small ones),
 * which is realistic at low affinity: a scattering of small co-purchase
 * groups amid many singletons. A larger shape concentrates the draws around
 * the mean, so at high affinity the latent categories end up comparably
 * large rather than one dominant group plus noise. We use an integer shape
 * (sum of `shape` exponentials = Gamma(shape, 1)) so no general gamma sampler
 * is needed.
 *
 * `round(1 + 9 * t)` ranges from 1 (uneven) at t = 0 to 10 (balanced) at t = 1.
 */
function dirichletEvennessShape(t: number): number {
  return Math.max(1, Math.round(1 + 9 * t));
}

/* -------------------------------------------------------------------------- */
/* Group-size sampling                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Draw `K` normalised Dirichlet weights using a symmetric Dirichlet with the
 * given integer `shape` (implemented as `shape` exponentials per component,
 * i.e. a Gamma(shape, 1) per component). `1 - u` is used instead of `u` to
 * avoid `ln(0)` when the PRNG returns exactly 0.
 */
function sampleDirichletWeights(
  k: number,
  shape: number,
  rng: () => number
): number[] {
  const weights = new Array<number>(k);
  let total = 0;
  for (let i = 0; i < k; i++) {
    // Gamma(shape, 1) draw as `shape` exponentials: -sum(ln(1 - u)).
    // Using (1 - u) avoids ln(0) when the PRNG returns exactly 0.
    let logSum = 0;
    for (let j = 0; j < shape; j++) {
      logSum += Math.log(1 - rng());
    }
    const w = logSum === 0 ? Number.EPSILON : -logSum;
    weights[i] = w;
    total += w;
  }
  if (total <= 0) {
    // Degenerate draw: fall back to a flat composition.
    for (let i = 0; i < k; i++) weights[i] = 1 / k;
    return weights;
  }
  for (let i = 0; i < k; i++) weights[i] /= total;
  return weights;
}

/**
 * Apportion `total` whole items across `props.length` bins according to the
 * normalised `props`, guaranteeing every bin receives at least `minPer` items
 * and the results sum to exactly `total`.
 *
 * Uses the largest-remainder method:
 *   1. give every bin its minimum,
 *   2. floor the proportional share of the remainder,
 *   3. distribute the leftover units to the bins with the largest fractional
 *      remainders (ties broken by ascending index for determinism).
 *
 * This is deterministic, never produces an empty group, and is exact.
 */
function largestRemainderApportion(
  total: number,
  props: number[],
  minPer: number
): number[] {
  const k = props.length;
  if (k === 0) return [];

  const base = Math.max(0, minPer);
  const fixed = base * k;
  const remaining = Math.max(0, total - fixed);

  const scaled = props.map((p) => p * remaining);
  const floors = scaled.map((s) => Math.floor(s));
  let leftover = Math.round(remaining - floors.reduce((a, b) => a + b, 0));

  const sizes = floors.map((f) => base + f);

  if (leftover > 0) {
    // Indices ordered by descending fractional remainder, ties -> ascending idx.
    const order = sizes
      .map((_, i) => i)
      .sort((a, b) => {
        const fa = scaled[a] - floors[a];
        const fb = scaled[b] - floors[b];
        if (fb !== fa) return fb - fa;
        return a - b;
      });
    for (let i = 0; i < leftover; i++) sizes[order[i]]++;
  }

  return sizes;
}

/**
 * Draw `K` positive group sizes that sum to exactly `count`.
 *
 * `evenness` controls the Dirichlet concentration (see `dirichletEvennessShape`):
 * uneven at low affinity (scattered small groups) and balanced at high
 * affinity (comparably-large latent categories). `minPerGroup` is kept at 1
 * so no group is ever empty — every group id produced downstream is real.
 */
function sampleGroupSizes(
  count: number,
  k: number,
  evenness: number,
  rng: () => number
): number[] {
  if (k <= 0) return [];
  if (k === 1) return [count];
  const props = sampleDirichletWeights(k, evenness, rng);
  return largestRemainderApportion(count, props, 1);
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
 * Generate an affinity-group id for every one of `count` SKUs.
 *
 * The returned array is index-aligned with the generated SKU list
 * (SKU_001 → index 0, SKU_002 → index 1, …) so callers can zip them together
 * without any further bookkeeping, exactly like `generateDemandScores`.
 *
 * Properties of the returned ids:
 *   • length === count
 *   • every SKU gets exactly one positive integer group id (1-based)
 *   • group ids are contiguous: 1, 2, …, maxGroupId (no empty groups)
 *   • at affinity = 0   → every SKU is in its own singleton group (K === count)
 *   • at affinity = 100 → exactly `latentCategoryCount(count)` large groups,
 *                         each a latent product category (never one giant group)
 *   • as affinity rises  → the number of groups monotonically falls from
 *                         `count` down to the latent-category count, and group
 *                         sizes grow; grouping stays rare near 0% and
 *                         saturates near 100%
 *   • which SKU ids fall into which group is seeded/shuffled so groups are
 *     spread across the catalogue rather than always grouping SKU_001/SKU_002
 */
export function generateAffinityGroups(config: AffinityGenerationConfig): number[] {
  const n = Math.max(0, Math.floor(config.count));
  if (n === 0) return [];

  const seed = config.seed ?? 42;
  const t = Math.min(1, Math.max(0, config.affinity / 100));

  // 1. Affinity-scaled effective group count (N at 0%, latent-category count
  //    at 100%). Special-case 0 affinity so the result is exactly all
  //    singletons regardless of any rounding edge cases.
  const k = t === 0 ? n : affinityToGroupCount(n, config.affinity);
  if (k <= 0) return new Array<number>(n).fill(0).map((_, i) => i + 1);

  // 2. Draw deterministic group sizes summing to exactly n.
  const rng = mulberry32(seed);
  const sizes = sampleGroupSizes(n, k, dirichletEvennessShape(t), rng);
  // Defensive: apportionment is exact, but guard against pathological inputs.
  if (sizes.length !== k || sizes.reduce((a, b) => a + b, 0) !== n) {
    // Fall back to a flat partition so we never return a malformed grouping.
    const flat: number[] = [];
    let remaining = n;
    let g = 0;
    while (remaining > 0) {
      g++;
      const size = Math.min(Math.ceil(n / k), remaining);
      flat.push(size);
      remaining -= size;
    }
    return assignGroupIds(n, flat, seed);
  }

  return assignGroupIds(n, sizes, seed);
}

/**
 * Given a list of group sizes (summing to `count`), assign contiguous 1-based
 * group ids to a shuffled ordering of SKU indices so that group boundaries do
 * not align with numeric SKU ordering. This makes groups appear spread across
 * the catalogue (SKU_001's group-mates are random SKUs, not adjacent ids),
 * which is important for realistic order generation.
 */
function assignGroupIds(count: number, sizes: number[], seed: number): number[] {
  const groups = new Array<number>(count);
  const shuffledIndices = seededShuffle(
    Array.from({ length: count }, (_, i) => i),
    seed ^ 0x9e3779b9 // decorrelate from the sizing draws
  );
  let cursor = 0;
  for (let g = 0; g < sizes.length; g++) {
    const groupId = g + 1;
    for (let j = 0; j < sizes[g]; j++) {
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
 *   • Independent    → 0   (no SKU is related to another)
 *   • Highly Related → approaches 1 (almost every SKU has group-mates, but
 *                      spread across several large groups rather than one)
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