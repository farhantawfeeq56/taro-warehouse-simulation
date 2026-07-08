import { describe, expect, it } from 'vitest';
import { generateParallelLayout } from '../layout-generator';
import {
  applyInventoryPlacement,
  applyInventoryPlacementDetailed,
  computePlacementPreview,
  DEFAULT_INVENTORY_PLACEMENT,
} from '../inventory-placement';
import type { Item, Warehouse } from '../types';

function makeItems(scores: number[]): Item[] {
  return scores.map((score, i) => ({
    id: `SKU_${String(i + 1).padStart(3, '0')}`,
    demandScore: score,
  }));
}

/** A warehouse with many bins so all SKUs always fit. */
function bigWarehouse(): Warehouse {
  // gridHeight 12, 10 racks, aisleWidth 2 → plenty of shelf cells.
  return generateParallelLayout(12, 10, 2);
}

describe('inventory-placement (slotting bias)', () => {
  it('places exactly the supplied items, one SKU per bin, no duplicates', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([0.1, 0.9, 0.5, 0.2, 0.7]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 50 });

    const allSkus: string[] = [];
    for (const cell of out.grid.flat()) {
      for (const bin of cell.locations) allSkus.push(bin.sku);
    }
    expect(allSkus).toHaveLength(items.length);
    expect(new Set(allSkus).size).toBe(items.length);
    for (const item of items) expect(allSkus).toContain(item.id);
  });

  it('leaves extra bins empty when there are more bins than SKUs', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([1, 2, 3]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 50 });
    // Exactly one StorageLocation per supplied SKU; remaining bins empty.
    const placedBins = out.grid.flat().reduce((n, c) => n + c.locations.length, 0);
    expect(placedBins).toBe(items.length);
  });

  it('at high bias, the highest-demand SKU lands closest to dispatch', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    const items = makeItems([0.01, 9.99, 0.02, 0.03, 0.04]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 100 });

    const topSkuCell = out.grid.flat().find((c) =>
      c.locations.some((l) => l.sku === 'SKU_002')
    )!;
    const otherCells = out.grid.flat().filter((c) =>
      c.locations.length > 0 && !c.locations.some((l) => l.sku === 'SKU_002')
    );

    const topDist =
      Math.abs(topSkuCell.x - dispatch.x) + Math.abs(topSkuCell.y - dispatch.y);
    for (const cell of otherCells) {
      const d = Math.abs(cell.x - dispatch.x) + Math.abs(cell.y - dispatch.y);
      expect(topDist).toBeLessThanOrEqual(d);
    }
  });

  it('high bias is monotonic: higher-demand SKUs are no farther than lower-demand ones', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    // Items with strictly decreasing demand in input order.
    const items = makeItems([5, 4, 3, 2, 1]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 100 });

    const distBySku = new Map<string, number>();
    for (const cell of out.grid.flat()) {
      for (const bin of cell.locations) {
        distBySku.set(
          bin.sku,
          Math.abs(cell.x - dispatch.x) + Math.abs(cell.y - dispatch.y)
        );
      }
    }
    // demand: SKU_001 (5) > SKU_002 (4) > ... > SKU_005 (1)
    // so distance should be non-decreasing along that order.
    let prev = -1;
    for (let i = 1; i <= 5; i++) {
      const d = distBySku.get(`SKU_${String(i).padStart(3, '0')}`)!;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('at zero bias, placement is random and not correlated with demand', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    // Strongly skewed demand; if placement were demand-based the top SKU
    // would be nearest. At t=0 (random) it should not systematically be.
    const items = makeItems([
      0.01, 0.01, 0.01, 0.01, 9.99, 0.01, 0.01, 0.01, 0.01, 0.01,
    ]);
    let topWasNearest = 0;
    // Try several seeds; a demand-based placement would always win, a random
    // one should win only some of the time.
    for (let seed = 1; seed <= 20; seed++) {
      const out = applyInventoryPlacement(warehouse, {
        items,
        slottingBias: 0,
        seed,
      });
      const cells = out.grid.flat().filter((c) => c.locations.length > 0);
      const dists = cells.map(
        (c) => Math.abs(c.x - dispatch.x) + Math.abs(c.y - dispatch.y)
      );
      const minDist = Math.min(...dists);
      const topCell = cells.find((c) =>
        c.locations.some((l) => l.sku === 'SKU_005')
      )!;
      const topDist =
        Math.abs(topCell.x - dispatch.x) + Math.abs(topCell.y - dispatch.y);
      if (topDist === minDist) topWasNearest++;
    }
    // If it were demand-based this would be 20. Random should be well below.
    expect(topWasNearest).toBeLessThan(20);
  });

  it('is deterministic for a fixed seed and bias', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([3, 1, 4, 1, 5, 9, 2, 6]);
    const a = applyInventoryPlacement(warehouse, { items, slottingBias: 40, seed: 7 });
    const b = applyInventoryPlacement(warehouse, { items, slottingBias: 40, seed: 7 });
    const skusA = a.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    const skusB = b.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    expect(skusA).toEqual(skusB);
  });

  it('different seeds produce different random placements at zero bias', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([1, 2, 3, 4, 5, 6, 7, 8]);
    const a = applyInventoryPlacement(warehouse, { items, slottingBias: 0, seed: 1 });
    const b = applyInventoryPlacement(warehouse, { items, slottingBias: 0, seed: 999 });
    const skusA = a.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y}:${l.sku}`))
      .sort()
      .join('|');
    const skusB = b.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y}:${l.sku}`))
      .sort()
      .join('|');
    expect(skusA).not.toEqual(skusB);
  });

  it('reports overflow SKUs explicitly when there are more items than bins', () => {
    // A tiny warehouse with very few shelf cells.
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    // z-levels cycle 1..3 per shelf; sum them to get the true bin count.
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;
    const items = makeItems(Array.from({ length: binCount + 10 }, (_, i) => i + 1));
    const result = applyInventoryPlacementDetailed(tiny, {
      items,
      slottingBias: 50,
    });
    expect(result.binCount).toBe(binCount);
    expect(result.placedCount).toBe(binCount);
    expect(result.placedCount).toBeLessThan(items.length);
    expect(result.unplacedSkus.length).toBe(items.length - result.placedCount);
    expect(result.unplacedSkus.length).toBe(10);
    // Placed SKUs must all be unique and present in the input.
    const placedSkus = result.warehouse.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => l.sku));
    expect(new Set(placedSkus).size).toBe(placedSkus.length);
    // No unplaced SKU appears in the grid.
    for (const sku of result.unplacedSkus) {
      expect(placedSkus).not.toContain(sku);
    }
  });

  it('preview reflects demand near dispatch at high bias', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([0.1, 0.1, 0.1, 9.5, 0.1, 0.1]);
    const preview = computePlacementPreview(warehouse, {
      items,
      slottingBias: 100,
    });
    expect(preview.maxDemand).toBeCloseTo(9.5, 5);
    expect(preview.binCount).toBeGreaterThan(items.length);
    expect(preview.unplacedCount).toBe(0);
    // At least one shelf is active.
    expect(preview.shelves.some((s) => s.active)).toBe(true);
  });

  it('preview reports overflow count when SKUs exceed bins', () => {
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;
    const items = makeItems(
      Array.from({ length: binCount + 5 }, (_, i) => i + 1)
    );
    const preview = computePlacementPreview(tiny, {
      items,
      slottingBias: 50,
    });
    expect(preview.binCount).toBe(binCount);
    expect(preview.unplacedCount).toBe(5);
  });

  it('default config places nothing and produces no SKUs', () => {
    const warehouse = bigWarehouse();
    const out = applyInventoryPlacement(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    const skus = out.grid.flat().flatMap((c) => c.locations.map((l) => l.sku));
    expect(skus).toHaveLength(0);
  });
});
