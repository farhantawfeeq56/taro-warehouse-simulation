// Structured inventory placement generator
//
// This module is intentionally additive: it produces a deterministic
// (but seedable) set of StorageLocation entries for the shelf cells of
// a Warehouse. It does NOT mutate order generation, simulation logic,
// picking strategies, or worker behavior. It only enriches the cells
// of a warehouse that was already laid out by the layout generator.
//
// NOTE: The legacy slider-driven placement (Fast Mover Placement,
// Product Grouping, Inventory Spread, Hotspot Intensity) has been
// removed. This module now provides a simple uniform placeholder
// behaviour so the inventory placement pipeline stage continues to
// produce valid StorageLocations for downstream consumers.

import type { Cell, StorageLocation, Warehouse } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';

/**
 * Placeholder placement configuration.
 *
 * The legacy 0-100 sliders (fastMoverPlacement, productGrouping,
 * inventorySpread, hotspotIntensity) have been retired. Only the
 * optional seed remains so placement can be reproducible per-call.
 */
export interface InventoryPlacementConfig {
  /** Optional seed for reproducible generation */
  seed?: number;
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


/* -------------------------------------------------------------------------- */
/* Preview metadata (used by the live preview in the modal)                   */
/* -------------------------------------------------------------------------- */

export interface ShelfPlacementPreview {
  x: number;
  y: number;
  /** Placeholder — always 0 in the legacy-free placement. */
  fastMoverScore: number;
  /** Placeholder — uniform density (0..1) per active shelf. */
  density: number;
  /** Placeholder — always 0 (no grouping in the legacy-free placement). */
  groupIndex: number;
  /** Placeholder — always 0 (no demand model in the legacy-free placement). */
  demand: number;
  /** Placeholder — always 0 (no proximity model in the legacy-free placement). */
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
  density: number; // 0..1
  active: boolean;
  zLevels: number;
}

function planShelves(
  warehouse: Warehouse
): PlannedShelf[] {
  const shelves = listShelves(warehouse);
  if (shelves.length === 0) return [];

  // Placeholder behaviour: every shelf is active, with 1-3 z-levels
  // and a single shared density value. The exact mapping will be
  // replaced by the new placement system; for now we produce
  // uniformly populated shelves so downstream consumers (simulation,
  // order resolution, canvas rendering) continue to see valid
  // StorageLocations on every shelf cell.
  return shelves.map((shelf, i) => {
    // 1, 2, or 3 z-levels cycling through shelves (3 is the previous
    // default-mode mean and keeps the warehouse visually dense).
    const zCycle = (i % 3) + 1;
    return {
      index: i,
      x: shelf.x,
      y: shelf.y,
      cell: shelf.cell,
      density: 0.5,
      active: true,
      zLevels: zCycle,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Public preview                                                             */
/* -------------------------------------------------------------------------- */

export function computePlacementPreview(
  warehouse: Warehouse,
  _config: InventoryPlacementConfig
): InventoryPlacementPreview {
  const planned = planShelves(warehouse);
  return {
    shelves: planned.map((p) => ({
      x: p.x,
      y: p.y,
      fastMoverScore: 0,
      density: p.density,
      groupIndex: 0,
      demand: 0,
      proximity: 0,
      active: p.active,
      zLevels: p.zLevels,
    })),
    maxDemand: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Apply placement to a warehouse (used by Generate Warehouse)                */
/* -------------------------------------------------------------------------- */

export function applyInventoryPlacement(
  warehouse: Warehouse,
  _config: InventoryPlacementConfig
): Warehouse {
  const planned = planShelves(warehouse);

  // 1. Clear existing storage locations on every shelf cell.
  const newGrid: Cell[][] = warehouse.grid.map((row) =>
    row.map((cell) => ({ ...cell, locations: [] as StorageLocation[] }))
  );

  // 2. Build the new set of storage locations.
  let skuCounter = 1;

  for (const p of planned) {
    if (!p.active || p.zLevels === 0) continue;

    const locationId = getShelfLocationId(p.x, p.y);
    const cell = newGrid[p.y][p.x];

    // Build the storage locations for each z-level of this shelf.
    // Each z-level gets its own unique SKU, consistent with the
    // invariant that every SKU lives in exactly one StorageLocation.
    const cellLocations: StorageLocation[] = [];
    for (let z = 1; z <= p.zLevels; z++) {
      // Placeholder uniform quantity. The legacy fast-mover boost
      // has been removed.
      const quantity = 50;

      const sku = `SKU_${String(skuCounter).padStart(3, '0')}`;

      cellLocations.push({
        id: `${sku}@${p.x},${p.y},${z}`,
        locationId,
        x: p.x,
        y: p.y,
        z,
        sku,
        quantity,
      });

      skuCounter++;
    }

    cell.locations = cellLocations;
    cell.type = 'shelf';
  }

  const next: Warehouse = {
    ...warehouse,
    grid: newGrid,
    shelves: planned
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y })),
    locations: buildCoordinateLocations({ ...warehouse, grid: newGrid }),
  };
  return next;
}

export const DEFAULT_INVENTORY_PLACEMENT: InventoryPlacementConfig = {};
