// Demand distribution generation for the Inventory Generation section.
//
// This module is intentionally pure and self-contained: given a SKU count
// and a "demand distribution" slider value (0 = Uniform, 100 = Pareto), it
// produces a deterministic, normalized demand score for every SKU.
//
// The slider smoothly interpolates between two extremes:
//
//   • Uniform  — every SKU receives (almost) the same demand score.
//   • Pareto   — a handful of SKUs receive very high scores while the
//                vast majority receive low scores.
//
// Other inventory-generation variables can build on top of the produced
// scores (e.g. placement heuristics that put high-demand SKUs near the
// dispatch point). This module does not depend on any UI or warehouse
// model, so it is trivially testable.

/** Max power-law exponent reached at the far-right (Pareto) end of the slider. */
export const ALPHA_MAX = 2;

/**
 * Map a 0..100 slider value to a power-law exponent `alpha`.
 *
 * alpha = 0           → perfectly uniform (all SKUs equal demand).
 * alpha = ALPHA_MAX   → strongly Pareto (few high, many low).
 *
 * Linear mapping keeps the transition smooth and predictable as the slider
 * moves. Exponents above ~2 produce an extremely sharp Pareto that is rarely
 * useful, so we clamp here.
 */
export function distributionToAlpha(distribution: number): number {
  const t = Math.min(1, Math.max(0, distribution / 100));
  return t * ALPHA_MAX;
}

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
/* Core generation                                                            */
/* -------------------------------------------------------------------------- */

export interface DemandGenerationConfig {
  /** Number of SKUs to score. */
  count: number;
  /**
   * Distribution slider value, 0 (Uniform) .. 100 (Pareto).
   * Values outside this range are clamped.
   */
  distribution: number;
  /**
   * Optional seed for reproducible assignment of scores to SKU positions.
   * High-demand scores are shuffled across the SKU id range so the "popular"
   * SKUs are not always the lowest-numbered ones. Defaults to a fixed seed.
   */
  seed?: number;
}

/**
 * Generate a demand score for every one of `count` SKUs.
 *
 * The returned array is index-aligned with the generated SKU list
 * (SKU_001 → index 0, SKU_002 → index 1, …) so callers can zip them
 * together without any further bookkeeping.
 *
 * Properties of the returned scores:
 *   • length === count
 *   • every score > 0
 *   • mean score === 1   (total demand is conserved as the slider moves —
 *                         the slider only redistributes demand, it never
 *                         inflates or deflates the overall pool)
 *   • at distribution = 0  → all scores equal 1 (uniform)
 *   • at distribution > 0  → scores follow a Zipf/power-law shape, shuffled
 *                            so high demand is spread across SKU ids.
 */
export function generateDemandScores(config: DemandGenerationConfig): number[] {
  const count = Math.max(0, Math.floor(config.count));
  if (count === 0) return [];

  const alpha = distributionToAlpha(config.distribution);
  const seed = config.seed ?? 42;

  // Raw power-law weights: w_i = 1 / (i+1)^alpha, i = 0..count-1.
  // At alpha = 0 every weight is 1 (uniform). As alpha grows the head SKUs
  // (small i) dominate — exactly the Pareto shape.
  const raw: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    raw[i] = 1 / Math.pow(i + 1, alpha);
  }

  // Normalize so the mean score is 1. This keeps the total demand pool
  // constant regardless of the distribution, so the slider purely controls
  // *how* demand is spread, not *how much* exists.
  const sum = raw.reduce((a, b) => a + b, 0);
  const factor = sum > 0 ? count / sum : 1;
  const normalized = raw.map((w) => w * factor);

  // Shuffle which SKU id receives which score so that, on the Pareto end,
  // the handful of high-demand SKUs are not always SKU_001/SK_002/… but are
  // distributed across the catalogue. The shuffle preserves the distribution
  // shape — only the assignment of scores to ids changes.
  return seededShuffle(normalized, seed);
}

/* -------------------------------------------------------------------------- */
/* Convenience                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Summarize a set of demand scores with the metrics used by the UI.
 *
 * `topShare` is the fraction of total demand held by the top `topFraction`
 * of SKUs (e.g. top 20%). It is a single, intuitive number that captures
 * how skewed the distribution is:
 *   • Uniform   → ~0.20
 *   • Pareto    → approaches 1.0
 */
export interface DemandSummary {
  min: number;
  max: number;
  mean: number;
  /** Fraction of total demand held by the top `topFraction` of SKUs (0..1). */
  topShare: number;
  /** The fraction used to compute `topShare` (e.g. 0.20 for the top 20%). */
  topFraction: number;
}

export function summarizeDemandScores(
  scores: number[],
  topFraction = 0.2
): DemandSummary {
  const n = scores.length;
  if (n === 0) {
    return { min: 0, max: 0, mean: 0, topShare: 0, topFraction };
  }
  const sorted = scores.slice().sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  const topCount = Math.max(1, Math.round(n * topFraction));
  const topTotal = sorted.slice(0, topCount).reduce((a, b) => a + b, 0);
  return {
    min: sorted[n - 1],
    max: sorted[0],
    mean: total / n,
    topShare: total > 0 ? topTotal / total : 0,
    topFraction: topFraction,
  };
}