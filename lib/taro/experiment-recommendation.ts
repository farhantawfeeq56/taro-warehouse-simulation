/**
 * Experiment recommendation - a deterministic, mock "AI" that studies the
 * existing warehouses + their simulation results and proposes the single most
 * promising configuration to test next.
 *
 * IMPORTANT: this is NOT backed by an LLM. There is no API call, no model.
 * The "intelligence" is a transparent set of heuristics over the numbers we
 * already have:
 *
 *   1. Rank every warehouse by its best (highest-efficiency) strategy.
 *   2. Take the winner's configuration as the seed.
 *   3. Read the winner's weakest metric in the comparison to pick ONE axis
 *      to mutate (distance / time / utilization / throughput).
 *   4. Apply a small, safe mutation along that axis, clamped to user
 *      constraints (parsed from free text) and to the generator's own
 *      parameter ranges.
 *   5. Package the result as a human-readable recommendation + rationale
 *      that is EXPLICITLY framed as an experiment, never a certainty.
 *
 * The output configuration is a fully valid `WarehouseConfiguration`, so the
 * existing `generateWarehouseSession` pipeline produces the experiment
 * warehouse - no new generation machinery.
 */

import type { SimulationResults, WarehouseProfile, LaborProfile } from './types';
import type { WarehouseConfiguration } from './warehouse-configuration';

// ── Public types ──────────────────────────────────────────────────────────

/** What a comparison run tells us about a single warehouse. */
export interface WarehouseInsight {
  id: string;
  name: string;
  configuration: WarehouseConfiguration | null;
  /** Best (highest-efficiency) strategy result across all strategies. */
  bestEfficiency: number;
  /** Estimated time (minutes) of the best strategy. */
  bestEstimatedTime: number;
  /** Total distance (m) of the best strategy. */
  bestTotalDistance: number;
  /** Cost per order ($) of the best strategy. */
  bestCostPerOrder: number;
  /** Total distance across ALL strategies, averaged - a robust proxy for layout quality. */
  averageDistance: number;
  /** Estimated time across ALL strategies, averaged. */
  averageTime: number;
}

/** A constraint parsed from the user's free-text input. */
export type ConstraintType =
  | 'rackCount'
  | 'gridHeight'
  | 'aisleWidth'
  | 'crossAisleCount'
  | 'skuCount'
  | 'budget'
  | 'custom';

export interface Constraint {
  type: ConstraintType;
  /** The raw text the user wrote for this constraint. */
  raw: string;
  /** Numeric bound where applicable (rack count, grid height, SKUs, $ cost). */
  value?: number;
  /** 'max' | 'min' | 'exact' for ranged constraints. */
  relation?: 'max' | 'min' | 'exact';
}

/** The single axis the recommender decided to mutate. */
export type ExperimentAxis =
  | 'capacity'
  | 'density'
  | 'inventory-fit'
  | 'placement'
  | 'throughput';

export interface ExperimentRecommendation {
  /** One-line summary, e.g. "Test 15 racks at height 24 with zone-friendly aisles." */
  recommendation: string;
  /** One short sentence - the headline rationale (no em dash). */
  shortSummary: string;
  /** Prose explanation of why this was chosen. */
  rationale: string;
  /** The exact configuration to generate for the experiment. */
  configuration: WarehouseConfiguration;
  /** The axis we mutated (drives the UI badge). */
  axis: ExperimentAxis;
  /** Human-readable deltas vs the seed warehouse (for the "what changed" list). */
  changes: Array<{ label: string; before: string; after: string }>;
  /**
   * Always-present experiment disclaimer. This is a suggestion to TEST,
   * never a guarantee.
   */
  experimentNote: string;
  /** Which warehouse the recommendation is seeded from. */
  seedWarehouseName: string;
  /** Whether the user's constraints prevented any real change. */
  constrainedToNoChange: boolean;
  /**
   * Structured "why" + "what changed / constraints" - so the UI can render
   * the why and the change list as separate blocks instead of one blob.
   */
  why: string;
  details: {
    /** Human-readable change list, e.g. "Racks: 12 → 14". */
    changes: string[];
    /** Raw constraint fragments the user entered (or none). */
    constraints: string[];
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Generator parameter ranges - mirrors the layout-config overlay sliders. */
export const CONFIG_LIMITS = {
  gridHeight: { min: 10, max: 60 },
  rackCount: { min: 4, max: 40 },
  aisleWidth: { min: 1, max: 3 },
  crossAisleCount: { min: 0, max: 4 },
  skuCount: { min: 100, max: 2000 },
} as const;

const EXPERIMENT_NOTE =
  'This is an experiment, not a guarantee. The recommendation is a hypothesis ' +
  'based on the warehouses you already tested - run the comparison after adding ' +
  'it to see whether it actually improves. The best way to find out is to test.';

// ── Insight extraction ────────────────────────────────────────────────────

/**
 * Reduce a `SimulationResults` + configuration into a flat `WarehouseInsight`.
 * Absent configuration (legacy warehouses) yields null config - the seed
 * selection skips them.
 */
export function toWarehouseInsight(
  id: string,
  name: string,
  configuration: WarehouseConfiguration | null,
  results: SimulationResults,
): WarehouseInsight {
  const strategies = results.strategies;
  const best = [...strategies].sort((a, b) => b.efficiency - a.efficiency)[0];

  const avg = (pick: (s: (typeof strategies)[number]) => number) =>
    strategies.length > 0
      ? strategies.reduce((sum, s) => sum + pick(s), 0) / strategies.length
      : 0;

  return {
    id,
    name,
    configuration,
    bestEfficiency: best?.efficiency ?? 0,
    bestEstimatedTime: best?.estimatedTime ?? 0,
    bestTotalDistance: best?.totalDistance ?? 0,
    bestCostPerOrder: best?.costPerOrder ?? 0,
    averageDistance: avg((s) => s.totalDistance),
    averageTime: avg((s) => s.estimatedTime),
  };
}

/**
 * Pick the warehouse to learn from: the one with the highest best-strategy
 * efficiency that ALSO has a configuration (legacy warehouses without one
 * can't seed a new experiment). Falls back to any warehouse with a config.
 */
export function pickSeedWarehouse(insights: WarehouseInsight[]): WarehouseInsight | null {
  const withConfig = insights.filter((i) => i.configuration);
  if (withConfig.length === 0) return null;
  return [...withConfig].sort(
    (a, b) => b.bestEfficiency - a.bestEfficiency || b.averageDistance - a.averageDistance,
  )[0];
}

// ── Constraint parsing ────────────────────────────────────────────────────

/**
 * Parse a free-text constraint string into structured constraints.
 * Supports a handful of natural-ish patterns (English only):
 *
 *   "max 12 racks" / "no more than 12 racks" / "rack count <= 12"
 *   "height at least 20" / "grid height >= 20"
 *   "aisle width 2"
 *   "cross aisles 2"
 *   "at most 800 skus" / "sku count max 800"
 *   "budget 5000" / "cost under $3000"
 *
 * Anything unrecognized becomes a `custom` constraint (carried through for
 * display; the heuristic can't machine-apply it, and says so in the rationale).
 * Empty input returns `[]` - "no constraints".
 */
export function parseConstraints(rawText: string): Constraint[] {
  const text = (rawText ?? '').trim();
  if (!text) return [];

  const constraints: Constraint[] = [];
  // Split on sentence-ish delimiters so "max 12 racks, height 20" works.
  const segments = text
    .split(/[;\n,.]| and | plus /i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const lower = segment.toLowerCase();

    // Relation: look for "max/maximum/at most/no more than/<=/<" (max),
    // "min/minimum/at least/no less than/>=" (min), "exactly/= " (exact).
    let relation: 'max' | 'min' | 'exact' = 'max';
    if (/min|at least|no less|>=|>/i.test(lower) && !/no more|max/i.test(lower)) {
      relation = 'min';
    } else if (/exact(ly)?|=|^=\s|equal/i.test(lower)) {
      relation = 'exact';
    }

    // Number: first number in the segment (including $ amounts and decimals).
    const numberMatch = lower.match(/[$]?\s*(\d+(?:\.\d+)?)/);
    const value = numberMatch ? parseFloat(numberMatch[1]) : undefined;

    if (value === undefined) {
      constraints.push({ type: 'custom', raw: segment });
      continue;
    }

    if (/rack/i.test(lower)) {
      constraints.push({ type: 'rackCount', raw: segment, value: Math.round(value), relation });
    } else if (/height|grid.?height|rows/i.test(lower)) {
      constraints.push({ type: 'gridHeight', raw: segment, value: Math.round(value), relation });
    } else if (/aisle/i.test(lower)) {
      constraints.push({ type: 'aisleWidth', raw: segment, value: Math.round(value), relation });
    } else if (/cross.?aisle|aisles/i.test(lower)) {
      constraints.push({ type: 'crossAisleCount', raw: segment, value: Math.round(value), relation });
    } else if (/sku|catalog|inventory|item/i.test(lower)) {
      constraints.push({ type: 'skuCount', raw: segment, value: Math.round(value), relation });
    } else if (/budget|cost|spend|price|\$/i.test(lower)) {
      constraints.push({ type: 'budget', raw: segment, value, relation });
    } else {
      constraints.push({ type: 'custom', raw: segment });
    }
  }

  return constraints;
}

// ── Constraint application ────────────────────────────────────────────────

/** Clamp a proposed value to a single constraint, if the type matches. */
function applyConstraintToValue(
  constraint: Constraint,
  type: ConstraintType,
  proposed: number,
  limits: { min: number; max: number },
): number {
  if (constraint.type !== type || constraint.value === undefined) return proposed;
  const { value, relation } = constraint;
  switch (relation) {
    case 'min':
      return Math.max(proposed, value);
    case 'exact':
      return value;
    case 'max':
    default:
      return Math.min(proposed, value);
  }
}

/**
 * Apply all matching constraints to a candidate value and clamp to the
 * generator's own range. Returns the constrained value.
 */
export function clampToConstraints(
  constraints: Constraint[],
  type: ConstraintType,
  proposed: number,
  limits: { min: number; max: number },
): number {
  let value = proposed;
  for (const c of constraints) {
    value = applyConstraintToValue(c, type, value, limits);
  }
  return Math.max(limits.min, Math.min(limits.max, Math.round(value)));
}

/**
 * Budget constraint - measured in simulated cost-per-order ($). The
 * heuristic caps the SKU count (the main driver of pick volume and thus cost)
 * when the user gave a budget that the seed's cost exceeds.
 */
function applyBudgetConstraint(
  constraints: Constraint[],
  seedCostPerOrder: number,
  seedConfig: WarehouseConfiguration,
): WarehouseConfiguration {
  const budget = constraints.find((c) => c.type === 'budget');
  if (!budget || budget.value === undefined || budget.relation === 'min') {
    return seedConfig;
  }
  if (seedCostPerOrder <= budget.value) {
    return seedConfig; // already within budget - no change needed
  }
  // Reduce SKU count as a proxy for lowering cost pressure.
  const scale = Math.min(1, budget.value / seedCostPerOrder);
  const reducedSkus = Math.max(
    CONFIG_LIMITS.skuCount.min,
    Math.round(seedConfig.inventory.skuCount * scale),
  );
  return {
    ...seedConfig,
    inventory: { ...seedConfig.inventory, skuCount: reducedSkus },
  };
}

// ── Axis selection ────────────────────────────────────────────────────────

/**
 * Decide which single axis to mutate. The seed warehouse's own numbers tell
 * us where it struggles relative to a "healthy" baseline:
 *
 *   - Very high distance (>> time-proportional) → the layout is too spread
 *     out → add cross aisles / racks (throughput).
 *   - High time but OK distance → workers spend time on pick+travel mix →
 *     improve placement (clustering hot SKUs near dispatch).
 *   - Low utilization → too many workers for the work → shrink skuCount to
 *     the demand's natural size (inventory-fit).
 *   - Otherwise → add capacity (racks) as the default growth axis.
 */
export function chooseAxis(seed: WarehouseInsight): ExperimentAxis {
  // Distance per time gives an idea of travel-heaviness (m per minute).
  const mPerMin = seed.bestEstimatedTime > 0 ? seed.bestTotalDistance / seed.bestEstimatedTime : 0;
  const distanceHeavy = mPerMin > 60; // > 1 m/s of pure travel
  const timeHeavy = seed.bestEstimatedTime > 0 && seed.bestEstimatedTime > seed.averageTime * 1.1;
  const utilizationLow = seed.bestEfficiency < 50;

  if (utilizationLow) return 'inventory-fit';
  if (distanceHeavy) return 'throughput';
  if (timeHeavy) return 'placement';
  return 'capacity';
}

// ── The recommendation ────────────────────────────────────────────────────

/**
 * Generate the experiment recommendation from existing warehouses' insights
 * and the user's free-text constraints.
 *
 * Pure function - safe to unit test.
 */
export function generateExperiment(
  insights: WarehouseInsight[],
  constraintsRaw: string,
): ExperimentRecommendation {
  const constraints = parseConstraints(constraintsRaw);
  const seed = pickSeedWarehouse(insights);

  if (!seed || !seed.configuration) {
    return {
      recommendation: 'Not enough data to recommend an experiment yet.',
      shortSummary: 'Not enough data to recommend an experiment yet.',
      rationale:
        'We need at least one warehouse with a saved configuration and a finished ' +
        'comparison run before we can study what works. Run the comparison first.',
      why: 'We need at least one warehouse with a saved configuration and a finished comparison run before we can study what works.',
      details: { changes: [], constraints: [] },
      configuration: seed?.configuration ?? ({} as WarehouseConfiguration),
      axis: 'capacity',
      changes: [],
      experimentNote: EXPERIMENT_NOTE,
      seedWarehouseName: seed?.name ?? '-',
      constrainedToNoChange: true,
    };
  }

  const seedConfig = seed.configuration;
  const axis = chooseAxis(seed);

  // Start from the seed, then apply budget (if any) as a first pass.
  const base = applyBudgetConstraint(constraints, seed.bestCostPerOrder, seedConfig);
  let config: WarehouseConfiguration = base;
  const changes: Array<{ label: string; before: string; after: string }> = [];

  const c = (type: ConstraintType, proposed: number, limits: { min: number; max: number }) =>
    clampToConstraints(constraints, type, proposed, limits);

  // How much the constraint layer shrank us (e.g. budget) - carry it forward.
  const budgetShrank = base.inventory.skuCount !== seedConfig.inventory.skuCount;

  switch (axis) {
    case 'capacity': {
      const before = seedConfig.layout.rackCount;
      const after = c('rackCount', before + 2, CONFIG_LIMITS.rackCount);
      if (after !== before) {
        changes.push({ label: 'Racks', before: `${before}`, after: `${after}` });
      }
      config = { ...config, layout: { ...config.layout, rackCount: after } };
      break;
    }

    case 'throughput': {
      const before = seedConfig.layout.crossAisleCount;
      const after = c('crossAisleCount', before + 1, CONFIG_LIMITS.crossAisleCount);
      if (after !== before) {
        changes.push({ label: 'Cross aisles', before: `${before}`, after: `${after}` });
      }
      config = { ...config, layout: { ...config.layout, crossAisleCount: after } };
      break;
    }

    case 'density': {
      const before = seedConfig.layout.rackCount;
      const after = c('rackCount', before + 4, CONFIG_LIMITS.rackCount);
      if (after !== before) {
        changes.push({ label: 'Racks', before: `${before}`, after: `${after}` });
      }
      config = { ...config, layout: { ...config.layout, rackCount: after } };
      break;
    }

    case 'inventory-fit': {
      const before = seedConfig.inventory.skuCount;
      const after = c('skuCount', Math.round(before * 0.85), CONFIG_LIMITS.skuCount);
      if (after !== before) {
        changes.push({ label: 'SKU count', before: `${before}`, after: `${after}` });
      }
      config = { ...config, inventory: { ...config.inventory, skuCount: after } };
      break;
    }

    case 'placement': {
      const before = seedConfig.placement.categoryClustering;
      const after = Math.min(100, Math.max(0, Math.round(before + 30)));
      if (after !== before) {
        changes.push({ label: 'Category clustering', before: `${before}`, after: `${after}` });
      }
      config = {
        ...config,
        placement: { ...config.placement, categoryClustering: after },
      };
      break;
    }
  }

  // Honest fallback: if constraints (or limits) meant no field could change,
  // say so instead of pretending we recommended something.
  const constrainedToNoChange = changes.length === 0 && !budgetShrank;
  if (constrainedToNoChange) {
    return {
      recommendation: `Test the same configuration as "${seed.name}" again, or relax a constraint.`,
      shortSummary: `Retest "${seed.name}" with fresh orders.`,
      rationale:
        'Your constraints prevent every change the data suggested, so the most ' +
        'honest experiment right now is a re-test of the current best warehouse ' +
        'with fresh orders. Relax a constraint to unlock layout changes.',
      why: 'Your constraints prevent every change the data suggested.',
      details: {
        changes: [],
        constraints: constraints.map((c) => c.raw),
      },
      configuration: config,
      axis,
      changes,
      experimentNote: EXPERIMENT_NOTE,
      seedWarehouseName: seed.name,
      constrainedToNoChange: true,
    };
  }

  // Human-readable recommendation + rationale.
  const axisCopy: Record<ExperimentAxis, { summary: (n: string) => string; why: string }> = {
    capacity: {
      summary: (n) =>
        `Add ${n} racks to the layout of "${seed.name}". More storage, same footprint width pressure.`,
      why: 'The winning warehouse still has the best efficiency, but more capacity usually helps it handle the same order flow with less congestion.',
    },
    throughput: {
      summary: (n) =>
        `Add ${n} racks to "${seed.name}". Denser storage shortens travel paths for pickers.`,
      why: 'Travel time dominates. The best warehouse spends most of its time walking, so more racks in the same footprint mean pickers cover less ground per order.',
    },
    density: {
      summary: (n) =>
        `Add ${n} racks to "${seed.name}". Pack more storage into the same area.`,
      why: 'The best warehouse is distance-heavy. Denser racks mean shorter average walks between picks.',
    },
    'inventory-fit': {
      summary: (n) =>
        `Trim "${seed.name}"'s SKU count to match demand. Fewer, higher-demand SKUs.`,
      why: 'Efficiency is low even on the best warehouse, which usually means too much inventory sprawl for the order flow. A tighter catalogue keeps the hot items closer together.',
    },
    placement: {
      summary: (n) =>
        `Raise category clustering on "${seed.name}". Put frequently-ordered SKUs together.`,
      why: 'Time is high relative to distance. Pickers stop often, so clustering related SKUs near the dispatch point turns long trips into short hops.',
    },
  };

  const copy = axisCopy[axis];
  const deltas = changes.map((d) => `${d.label}: ${d.before} → ${d.after}`);
  const rawConstraintList = constraints.map((c) => c.raw);

  return {
    recommendation: copy.summary(seed.name),
    shortSummary: copy.summary(seed.name),
    rationale:
      `${copy.why} Constraints applied: ${rawConstraintList.length > 0 ? rawConstraintList.join('; ') : 'none (free experiment)'}. ` +
      `Changed: ${deltas.join(', ')}. ${EXPERIMENT_NOTE}`,
    why: copy.why,
    details: {
      changes: deltas,
      constraints: rawConstraintList,
    },
    configuration: config,
    axis,
    changes,
    experimentNote: EXPERIMENT_NOTE,
    seedWarehouseName: seed.name,
    constrainedToNoChange: false,
  };
}

// ── Validation ────────────────────────────────────────────────────────────

/** Quick sanity check used by the unit test - the recommendation must be a
 *  valid configuration that the generator can consume. */
export function isValidRecommendation(
  rec: ExperimentRecommendation,
  hasConfigSeed: boolean,
): boolean {
  if (!rec.configuration) return false;
  const { layout, inventory, placement } = rec.configuration;
  const layoutOk =
    Number.isFinite(layout.rackCount) &&
    Number.isFinite(layout.gridHeight) &&
    Number.isFinite(layout.aisleWidth) &&
    Number.isFinite(layout.crossAisleCount);
  const inventoryOk =
    Number.isFinite(inventory.skuCount) &&
    Number.isFinite(inventory.demandDistribution) &&
    Number.isFinite(inventory.productAffinity) &&
    Number.isFinite(inventory.storageFootprint);
  const placementOk =
    Number.isFinite(placement.slottingBias) &&
    Number.isFinite(placement.categoryClustering);
  if (!layoutOk || !inventoryOk || !placementOk) return false;
  if (!hasConfigSeed) return true; // the no-data case: config may be empty
  // With a real seed, the config must be non-empty and within limits.
  return (
    layout.rackCount >= CONFIG_LIMITS.rackCount.min &&
    layout.rackCount <= CONFIG_LIMITS.rackCount.max &&
    layout.gridHeight >= CONFIG_LIMITS.gridHeight.min &&
    layout.gridHeight <= CONFIG_LIMITS.gridHeight.max
  );
}
