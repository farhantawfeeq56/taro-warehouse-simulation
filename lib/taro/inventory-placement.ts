// Structured inventory placement generator
//
// This module is intentionally additive: it produces a deterministic
// (but seedable) set of StorageLocation entries for the shelf cells of
// a Warehouse. It does NOT mutate order generation, simulation logic,
// picking strategies, or worker behavior. It only enriches the cells
// of a warehouse that was already laid out by the layout generator.

import type { Cell, StorageLocation, Warehouse, WarehouseLocation, Item } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';

export interface InventoryPlacementConfig {
  /** 0-100: 0 = spread out, 100 = concentrated near dispatch/start */
  fastMoverPlacement: number;
  /** 0-100: 0 = scattered related items, 100 = strongly grouped */
  productGrouping: number;
  /** 0-100: 0 = compact (fewer areas used), 100 = fully distributed */
  inventorySpread: number;
  /** 0-100: 0 = even demand across items, 100 = few items dominate */
  hotspotIntensity: number;
  /** Number of unique products in the catalog (50-1000) */
  productCount: number;
  /** Optional seed for reproducible generation */
  seed?: number;
}

export type Velocity = 'High' | 'Medium' | 'Low';

export interface Product {
  sku: string;
  family: string;
  velocity: Velocity;
  quantity: number;
}

/** Normalised 0..1 placement value derived from a 0..100 slider. */
export interface NormalisedPlacement {
  fastMoverPlacement: number;
  productGrouping: number;
  inventorySpread: number;
  hotspotIntensity: number;
}

export function normalisePlacement(config: InventoryPlacementConfig): NormalisedPlacement {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v / 100));
  return {
    fastMoverPlacement: clamp01(config.fastMoverPlacement),
    productGrouping: clamp01(config.productGrouping),
    inventorySpread: clamp01(config.inventorySpread),
    hotspotIntensity: clamp01(config.hotspotIntensity),
  };
}

/* -------------------------------------------------------------------------- */
/* Small deterministic PRNG so the live preview is stable per-config.          */
/* -------------------------------------------------------------------------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

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

function defaultSeedForConfig(config: InventoryPlacementConfig): number {
  const f = (n: number) => Math.round(n);
  return (
    hashString(
      `inv:${f(config.fastMoverPlacement)}|${f(config.productGrouping)}|${f(config.inventorySpread)}|${f(config.hotspotIntensity)}|${config.productCount}`
    )
  );
}

/**
 * Generates a stable catalog of N products.
 * The catalog depends only on the productCount to ensure stability
 * when other placement sliders are moved.
 */
export function generateCatalog(productCount: number): Product[] {
  // Use a fixed seed based on productCount so the catalog is stable
  const rand = mulberry32(hashString(`catalog-${productCount}`));
  
  const catalog: Product[] = [];
  
  // Velocity distribution: 10% High, 30% Medium, 60% Low
  const highCount = Math.max(1, Math.floor(productCount * 0.1));
  const mediumCount = Math.max(1, Math.floor(productCount * 0.3));
  const lowCount = Math.max(1, productCount - highCount - mediumCount);
  
  const velocities: { v: Velocity; count: number; qtyRange: [number, number] }[] = [
    { v: 'High', count: highCount, qtyRange: [500, 1000] },
    { v: 'Medium', count: mediumCount, qtyRange: [100, 300] },
    { v: 'Low', count: lowCount, qtyRange: [20, 100] },
  ];
  
  let globalSkuIndex = 1;
  
  for (const group of velocities) {
    for (let i = 0; i < group.count; i++) {
      const familyLetter = String.fromCharCode(65 + (Math.floor(rand() * 26)));
      const sku = `SKU-${familyLetter}${String(globalSkuIndex).padStart(4, '0')}`;
      const quantity = group.qtyRange[0] + Math.floor(rand() * (group.qtyRange[1] - group.qtyRange[0] + 1));
      
      catalog.push({
        sku,
        family: familyLetter,
        velocity: group.v,
        quantity,
      });
      globalSkuIndex++;
    }
  }
  
  return catalog;
}

/* -------------------------------------------------------------------------- */
/* Preview metadata (used by the live preview in the modal)                   */
/* -------------------------------------------------------------------------- */

export interface ShelfPlacementPreview {
  x: number;
  y: number;
  /** 0..1 — how "fast mover" this shelf is (1 = top hotspot near dispatch) */
  fastMoverScore: number;
  /** 0..1 — how dense the inventory at this shelf is */
  density: number;
  /** Group index — shelves that share an index belong to the same product group */
  groupIndex: number;
  /** Estimated demand weight for this shelf (0..1) */
  demand: number;
  /** 0..1 — closeness to dispatch (0 = far, 1 = near) */
  proximity: number;
  /** true if the shelf is selected as part of the inventory (vs. left empty) */
  active: boolean;
  /** Z-levels to render for this shelf (1..4) */
  zLevels: number;
}

export interface InventoryPlacementPreview {
  shelves: ShelfPlacementPreview[];
  maxDemand: number;
}

/* -------------------------------------------------------------------------- */
/* Core planner                                                               */
/* -------------------------------------------------------------------------- */

interface PlannedShelf {
  index: number;
  x: number;
  y: number;
  cell: Cell;
  proximity: number; // 0..1 — closeness to dispatch
  proximityBias: number; // 0..1 — proximity + spatial noise, used for demand
  groupIndex: number;
  density: number; // 0..1
  demand: number; // 0..1
  fastMoverScore: number; // 0..1
  active: boolean;
  zLevels: number;
}

function planShelves(
  warehouse: Warehouse,
  placement: NormalisedPlacement,
  rand: () => number
): PlannedShelf[] {
  const shelves = listShelves(warehouse);
  if (shelves.length === 0) return [];

  const worker = warehouse.workerStart ?? { x: 0, y: warehouse.height - 1 };

  // 1. Distance to dispatch for each shelf.
  let maxDist = 0;
  const distances = shelves.map(({ x, y }) => {
    const d = manhattan(x, y, worker.x, worker.y);
    maxDist = Math.max(maxDist, d);
    return d;
  });

  // 2. Decide which shelves are "active" (carry inventory) and their density
  //    based on the Inventory Spread slider.
  //
  //    spread = 0  -> only ~25% of shelves, all very dense.
  //    spread = 1  -> ~100% of shelves, less dense.
  const activeFraction = 0.25 + 0.75 * placement.inventorySpread;
  const baseDensity = 0.35 + 0.55 * placement.inventorySpread;
  const targetActive = Math.max(1, Math.round(shelves.length * activeFraction));

  // Pre-shuffle the shelf list so "which shelves are active" is not just
  // top-left-to-bottom-right.
  const order = shelves.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const activeSet = new Set(order.slice(0, targetActive));

  // 3. Determine product group clustering.
  //
  //    grouping = 0  -> 1 large group (essentially all shelves belong to one
  //                     product family, but the groups are large and overlap).
  //    grouping = 1  -> many small, tight clusters.
  const groupCount = Math.max(
    1,
    Math.round(1 + placement.productGrouping * Math.max(1, Math.floor(shelves.length / 4)))
  );

  // We assign each *active* shelf to a group. To make groups feel clustered
  // we seed groups in space and grow them outward.
  const groupSeeds: { x: number; y: number; groupIndex: number }[] = [];
  const groupIndices = Array.from({ length: groupCount }, (_, i) => i);
  // Shuffle group indices to randomise assignment
  for (let i = groupIndices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = groupIndices[i];
    groupIndices[i] = groupIndices[j];
    groupIndices[j] = tmp;
  }

  for (let i = 0; i < groupCount; i++) {
    const seed = shelves[Math.floor(rand() * shelves.length)];
    groupSeeds.push({ x: seed.x, y: seed.y, groupIndex: groupIndices[i] });
  }

  function nearestGroup(x: number, y: number): number {
    let best = groupSeeds[0];
    let bestDist = Infinity;
    for (const g of groupSeeds) {
      const d = manhattan(x, y, g.x, g.y);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best.groupIndex;
  }

  // 4. Build per-shelf plan.
  //    Combine proximity-to-dispatch with hotspot intensity to assign demand.
  //    We use a power-law weight: high hotspot intensity makes a small number
  //    of shelves dominate demand; low intensity makes demand nearly even.
  const planned: PlannedShelf[] = shelves.map((shelf, i) => {
    const dist = distances[i];
    const proximity = maxDist === 0 ? 1 : 1 - dist / maxDist; // 1 = nearest, 0 = farthest

    // Base per-shelf "occupancy" weight, used for both density and demand.
    // When fastMover is high we bias the weight toward shelves that are
    // close to dispatch. When fastMover is low we mix in more spatial noise
    // so the result feels spread out.
    const spatialNoise = rand();
    const proximityBias = placement.fastMoverPlacement * proximity + (1 - placement.fastMoverPlacement) * spatialNoise;

    // Density (how many z-levels to fill) — combines inventory spread with a
    // small random jitter so shelves look organic.
    const jitter = (rand() - 0.5) * 0.2;
    const density = Math.min(1, Math.max(0, baseDensity + jitter));

    // Group assignment.
    const groupIndex = activeSet.has(i) ? nearestGroup(shelf.x, shelf.y) : 0;

    return {
      index: i,
      x: shelf.x,
      y: shelf.y,
      cell: shelf.cell,
      proximity,
      proximityBias,
      groupIndex,
      density,
      demand: 0, // computed below
      fastMoverScore: 0, // computed below
      active: activeSet.has(i),
      zLevels: 0, // computed below
    };
  });

  // 5. Compute demand via a softmax-like distribution across active shelves.
  //    The temperature is controlled by hotspot intensity.
  const activeShelves = planned.filter((p) => p.active);
  if (activeShelves.length > 0) {
    // Map proximityBias to a "score" with a temperature:
    //   hotspotIntensity=0 -> temperature is high -> near-uniform demand
    //   hotspotIntensity=1 -> temperature is low -> a few shelves dominate
    const temperature = 0.05 + (1 - placement.hotspotIntensity) * 1.0; // 0.05..1.05
    const scores = activeShelves.map((p) => {
      // Slight bias toward proximity when fastMoverPlacement is high
      const biasedScore = 0.6 * p.proximityBias + 0.4 * p.proximity;
      return Math.exp(biasedScore / Math.max(0.0001, temperature));
    });
    const total = scores.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < activeShelves.length; i++) {
      activeShelves[i].demand = scores[i] / total;
    }
  }

  // 6. Compute fast-mover score (0..1) — the top-demand shelf near dispatch.
  //    fastMoverScore = how strongly this shelf is both "in demand" AND "near dispatch".
  for (const p of planned) {
    if (!p.active) {
      p.fastMoverScore = 0;
      continue;
    }
    // Normalise demand within the set of active shelves
    // (we'll do a second pass below to get a true 0..1)
    p.fastMoverScore = p.demand * (0.4 + 0.6 * p.proximity);
  }

  // 7. Compute z-levels per active shelf.
  //    1 = low density, 4 = very dense.
  //    density below 0.25 -> 1 level, 0.5 -> 2 levels, 0.75 -> 3, 1 -> 4.
  for (const p of planned) {
    if (!p.active) {
      p.zLevels = 0;
      continue;
    }
    const scaled = p.density * 4 + 0.5; // 0.5..4.5
    p.zLevels = Math.max(1, Math.min(4, Math.floor(scaled)));
  }

  return planned;
}

/* -------------------------------------------------------------------------- */
/* Public preview                                                             */
/* -------------------------------------------------------------------------- */

export function computePlacementPreview(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): InventoryPlacementPreview {
  const placement = normalisePlacement(config);
  const rand = mulberry32(config.seed ?? defaultSeedForConfig(config));
  const planned = planShelves(warehouse, placement, rand);
  const maxDemand = planned.reduce((m, p) => Math.max(m, p.demand), 0) || 1;
  return {
    shelves: planned.map((p) => ({
      x: p.x,
      y: p.y,
      fastMoverScore: p.fastMoverScore / Math.max(maxDemand, 0.0001),
      density: p.density,
      groupIndex: p.groupIndex,
      demand: p.demand,
      proximity: p.proximity,
      active: p.active,
      zLevels: p.zLevels,
    })),
    maxDemand,
  };
}

/* -------------------------------------------------------------------------- */
/* Apply placement to a warehouse (used by Generate Warehouse)                */
/* -------------------------------------------------------------------------- */

export function applyInventoryPlacement(
  warehouse: Warehouse,
  config: InventoryPlacementConfig
): Warehouse {
  const placement = normalisePlacement(config);
  const rand = mulberry32(config.seed ?? defaultSeedForConfig(config));
  const planned = planShelves(warehouse, placement, rand);

  // 1. Generate the stable catalog.
  const catalog = generateCatalog(config.productCount);

  // 2. Sort catalog by velocity (High -> Medium -> Low) then Family.
  const velocityScore: Record<Velocity, number> = { 'High': 0, 'Medium': 1, 'Low': 2 };
  const sortedCatalog = [...catalog].sort((a, b) => 
    velocityScore[a.velocity] - velocityScore[b.velocity] || 
    a.family.localeCompare(b.family) ||
    a.sku.localeCompare(b.sku)
  );

  // 3. Clear existing storage locations on every shelf cell.
  const newGrid: Cell[][] = warehouse.grid.map((row) =>
    row.map((cell) => ({ ...cell, locations: [] as StorageLocation[] }))
  );

  // 4. Collect all available (x, y, z) slots.
  interface Slot {
    x: number;
    y: number;
    z: number;
    fastMoverScore: number;
    groupIndex: number;
  }
  const slots: Slot[] = [];
  for (const p of planned) {
    if (!p.active || p.zLevels === 0) continue;
    for (let z = 1; z <= p.zLevels; z++) {
      slots.push({
        x: p.x,
        y: p.y,
        z,
        fastMoverScore: p.fastMoverScore,
        groupIndex: p.groupIndex
      });
    }
  }

  // 5. Sort slots by fastMoverScore descending.
  // We use groupIndex as secondary sort to help keep families together.
  slots.sort((a, b) => b.fastMoverScore - a.fastMoverScore || a.groupIndex - b.groupIndex);

  // 6. Map products to slots.
  const skuToSlots = new Map<string, Slot[]>();

  if (sortedCatalog.length <= slots.length) {
    // Each product gets at least one slot.
    for (let i = 0; i < slots.length; i++) {
      const product = sortedCatalog[i % sortedCatalog.length];
      const s = skuToSlots.get(product.sku) || [];
      s.push(slots[i]);
      skuToSlots.set(product.sku, s);
    }
  } else {
    // More products than slots. Some slots get multiple products.
    for (let i = 0; i < sortedCatalog.length; i++) {
      const product = sortedCatalog[i];
      const slot = slots[i % slots.length];
      const s = skuToSlots.get(product.sku) || [];
      s.push(slot);
      skuToSlots.set(product.sku, s);
    }
  }

  // 7. Build the new set of storage locations.
  for (const product of sortedCatalog) {
    const assignedSlots = skuToSlots.get(product.sku) || [];
    if (assignedSlots.length === 0) continue;

    // Distribute quantity among slots.
    const qtyPerSlot = Math.floor(product.quantity / assignedSlots.length);
    const remainder = product.quantity % assignedSlots.length;

    assignedSlots.forEach((slot, i) => {
      const cell = newGrid[slot.y][slot.x];
      const quantity = i === 0 ? qtyPerSlot + remainder : qtyPerSlot;
      
      if (quantity > 0) {
        cell.locations.push({
          id: `${product.sku}@${slot.x},${slot.y},${slot.z}`,
          locationId: getShelfLocationId(slot.x, slot.y),
          x: slot.x,
          y: slot.y,
          z: slot.z,
          sku: product.sku,
          quantity,
        });
      }
    });
  }

  // 8. Build the items array.
  // We create an Item entry for each shelf location that has products.
  const items: Item[] = [];
  let itemCounter = 1;
  const seenLocationIds = new Set<string>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = newGrid[y][x];
      if (cell.locations.length > 0) {
        const locationId = getShelfLocationId(x, y);
        if (!seenLocationIds.has(locationId)) {
          items.push({
            id: `ITEM_${String(itemCounter).padStart(4, '0')}`,
            locationId,
          });
          itemCounter++;
          seenLocationIds.add(locationId);
        }
      }
    }
  }

  const next: Warehouse = {
    ...warehouse,
    grid: newGrid,
    shelves: planned
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y })),
    locations: [], // will be filled by buildCoordinateLocations
    items,
  };

  // Refresh the locations index from the grid.
  next.locations = buildCoordinateLocations(next);
  return next;
}

export const DEFAULT_INVENTORY_PLACEMENT: InventoryPlacementConfig = {
  fastMoverPlacement: 50,
  productGrouping: 50,
  inventorySpread: 50,
  hotspotIntensity: 50,
  productCount: 100,
};
