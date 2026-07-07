import { describe, expect, it } from 'vitest';
import { generateParallelLayout } from '../layout-generator';
import {
  applyInventoryPlacement,
  computePlacementPreview,
  DEFAULT_INVENTORY_PLACEMENT,
} from '../inventory-placement';

describe('inventory-placement (placeholder behaviour)', () => {
  const warehouse = generateParallelLayout(8, 4, 2);

  it('applies placement and produces shelf locations for every shelf', () => {
    const out = applyInventoryPlacement(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    const totalShelves = out.grid
      .flat()
      .filter((cell) => cell.type === 'shelf').length;
    const activeCells = out.grid.flat().filter((cell) => cell.locations.length > 0);
    const activeShelves = activeCells.length;
    expect(activeShelves).toBeGreaterThan(0);
    expect(activeShelves).toBe(totalShelves);

    // Every active shelf should have at least one storage location.
    for (const cell of activeCells) {
      expect(cell.locations.length).toBeGreaterThan(0);
    }

    // Invariant: each SKU lives in exactly one bin across the whole warehouse.
    const seenSkus = new Set<string>();
    for (const cell of out.grid.flat()) {
      for (const bin of cell.locations) {
        expect(seenSkus.has(bin.sku)).toBe(false);
        seenSkus.add(bin.sku);
      }
    }
  });

  it('placeholder behaviour is the same regardless of explicit seed differences', () => {
    // The placeholder algorithm uses a fixed default seed internally;
    // varying the seed in the config should not produce a different
    // placement (every shelf is active, cycling 1-3 z-levels).
    const a = applyInventoryPlacement(warehouse, { seed: 1 });
    const b = applyInventoryPlacement(warehouse, { seed: 99999 });
    const countA = a.grid.flat().filter((c) => c.locations.length > 0).length;
    const countB = b.grid.flat().filter((c) => c.locations.length > 0).length;
    expect(countA).toBe(countB);
  });

  it('every active shelf has 1-3 z-levels', () => {
    const out = applyInventoryPlacement(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    for (const cell of out.grid.flat().filter((c) => c.locations.length > 0)) {
      expect(cell.locations.length).toBeGreaterThanOrEqual(1);
      expect(cell.locations.length).toBeLessThanOrEqual(3);
    }
  });

  it('preview reports placeholder values for retired fields', () => {
    const preview = computePlacementPreview(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    expect(preview.maxDemand).toBe(0);
    for (const s of preview.shelves) {
      expect(s.active).toBe(true);
      expect(s.fastMoverScore).toBe(0);
      expect(s.groupIndex).toBe(0);
      expect(s.demand).toBe(0);
      expect(s.proximity).toBe(0);
      expect(s.zLevels).toBeGreaterThanOrEqual(1);
      expect(s.zLevels).toBeLessThanOrEqual(3);
    }
  });

  it('placement leaves every shelf active in the preview', () => {
    const preview = computePlacementPreview(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    expect(preview.shelves.length).toBeGreaterThan(0);
    expect(preview.shelves.every((s) => s.active)).toBe(true);
  });
});
