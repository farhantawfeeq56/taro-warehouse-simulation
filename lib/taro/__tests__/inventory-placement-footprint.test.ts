import { describe, expect, it } from 'vitest';
import { generateParallelLayout } from '../layout-generator';
import {
  applyInventoryPlacement,
  applyInventoryPlacementDetailed,
  computePlacementPreview,
} from '../inventory-placement';
import { assertWarehouseInvariants } from '../inventory';
import type { Item, Warehouse } from '../types';

function makeItems(footprints: number[], scores?: number[]): Item[] {
  return footprints.map((f, i) => ({
    id: `SKU_${String(i + 1).padStart(3, '0')}`,
    demandScore: scores?.[i] ?? 1,
    storageFootprint: f,
  }));
}

/** A warehouse with many bins so all SKUs usually fit. */
function bigWarehouse(): Warehouse {
  return generateParallelLayout(12, 10, 2);
}

/** Count the bins a SKU occupies in the placed warehouse. */
function binsForSku(warehouse: Warehouse, skuId: string) {
  const bins: { x: number; y: number; z: number; primary?: boolean }[] = [];
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (bin.sku === skuId) bins.push({ x: bin.x, y: bin.y, z: bin.z, primary: bin.primary });
      }
    }
  }
  return bins;
}

describe('inventory-placement (storage footprint)', () => {
  it('allocates exactly storageFootprint bins per SKU', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([1, 3, 2, 1, 4]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 0 });

    for (const item of items) {
      const bins = binsForSku(out, item.id);
      expect(bins).toHaveLength(item.storageFootprint ?? 1);
    }
  });

  it('marks exactly one primary bin per multi-bin SKU (the nearest to dispatch)', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    const items = makeItems([3, 2, 4]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 0 });

    for (const item of items) {
      const bins = binsForSku(out, item.id);
      const primaries = bins.filter((b) => b.primary);
      expect(primaries).toHaveLength(1);
      // The primary must be the nearest-to-dispatch bin of the group.
      const primaryDist = Math.abs(primaries[0].x - dispatch.x) + Math.abs(primaries[0].y - dispatch.y);
      for (const bin of bins) {
        const d = Math.abs(bin.x - dispatch.x) + Math.abs(bin.y - dispatch.y);
        expect(primaryDist).toBeLessThanOrEqual(d);
      }
    }
  });

  it('single-bin SKUs are marked primary', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([1, 1, 1]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 0 });
    for (const item of items) {
      const bins = binsForSku(out, item.id);
      expect(bins).toHaveLength(1);
      expect(bins[0].primary).toBe(true);
    }
  });

  it('a SKU footprint defaults to 1 when absent (legacy behaviour preserved)', () => {
    const warehouse = bigWarehouse();
    const items: Item[] = [
      { id: 'SKU_001', demandScore: 1 },
      { id: 'SKU_002', demandScore: 2 },
    ];
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 0 });
    expect(binsForSku(out, 'SKU_001')).toHaveLength(1);
    expect(binsForSku(out, 'SKU_002')).toHaveLength(1);
  });

  it('satisfies the relaxed invariant (unique bin ids, single primary per sku)', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([3, 2, 5, 1, 4]);
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 0 });
    expect(() => assertWarehouseInvariants(out)).not.toThrow();
  });

  it('overflow is order-preserving: the first SKU that cannot fit stops placement', () => {
    // A tiny warehouse with few bins (generateParallelLayout(4,1,1) -> 13 bins).
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;

    // Use slottingBias=100 with strictly descending demand so the placement
    // order is deterministic: SKU_001 first, then SKU_002, etc.
    //   SKU_001: footprint 6 (max) -> uses 6 bins, 7 remain
    //   SKU_002: footprint 6        -> uses 6 bins, 1 remains
    //   SKU_003: footprint 6        -> needs 6, only 1 left -> OVERFLOW
    //   SKU_004: footprint 1        -> WOULD fit in the 1 remaining bin, but
    //                                  order-preserving placement must NOT
    //                                  leapfrog SKU_003.
    expect(binCount).toBe(13); // sanity: 6 + 6 = 12 placed, 1 left, SKU_003 overflows
    const items = makeItems(
      [6, 6, 6, 1],
      [4, 3, 2, 1] // strictly descending -> deterministic order at bias 100
    );

    const result = applyInventoryPlacementDetailed(tiny, { items, slottingBias: 100 });

    // Only the first two SKUs are placed (12 bins used).
    expect(result.placedCount).toBe(2);
    expect(result.placedBinCount).toBe(12);
    // SKU_003 (overflows) AND SKU_004 (would fit but must not leapfrog).
    expect(result.unplacedSkus).toEqual(['SKU_003', 'SKU_004']);
    expect(binsForSku(result.warehouse, 'SKU_003')).toHaveLength(0);
    expect(binsForSku(result.warehouse, 'SKU_004')).toHaveLength(0);
  });

  it('overflow when total footprint exceeds bin capacity reports all remaining SKUs', () => {
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;

    // 5 SKUs each with footprint 2 -> total 10. Whatever binCount is, the
    // overflow point is deterministic and everything after it is unplaced.
    const items = makeItems([2, 2, 2, 2, 2]);
    const result = applyInventoryPlacementDetailed(tiny, { items, slottingBias: 0 });

    const placed = result.placedCount;
    const unplaced = result.unplacedSkus.length;
    expect(placed + unplaced).toBe(items.length);
    // placedBinCount must equal the sum of placed footprints.
    let expectedPlacedBins = 0;
    for (let i = 0; i < placed; i++) expectedPlacedBins += items[i].storageFootprint!;
    expect(result.placedBinCount).toBe(expectedPlacedBins);
    expect(result.placedBinCount).toBeLessThanOrEqual(binCount);
  });

  it('slotting bias still controls WHERE the primary bin sits (footprint only controls count)', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    // One high-demand SKU with footprint 3, rest low-demand with footprint 1.
    const items = makeItems(
      [3, 1, 1, 1, 1],
      [9.99, 0.01, 0.01, 0.01, 0.01]
    );
    const out = applyInventoryPlacement(warehouse, { items, slottingBias: 100 });

    const topBins = binsForSku(out, 'SKU_001');
    expect(topBins).toHaveLength(3);
    const topPrimary = topBins.find((b) => b.primary)!;
    const topPrimaryDist =
      Math.abs(topPrimary.x - dispatch.x) + Math.abs(topPrimary.y - dispatch.y);

    // Every other SKU's bin must be no closer to dispatch than the top SKU's
    // primary (high bias puts highest-demand nearest).
    for (const row of out.grid) {
      for (const cell of row) {
        for (const bin of cell.locations) {
          if (bin.sku === 'SKU_001') continue;
          const d = Math.abs(bin.x - dispatch.x) + Math.abs(bin.y - dispatch.y);
          expect(topPrimaryDist).toBeLessThanOrEqual(d);
        }
      }
    }
  });

  it('preview reports totalBinsWanted and placedBinCount', () => {
    const warehouse = bigWarehouse();
    const items = makeItems([2, 2, 2]); // total wanted = 6
    const preview = computePlacementPreview(warehouse, { items, slottingBias: 0 });
    expect(preview.totalBinsWanted).toBe(6);
    expect(preview.placedBinCount).toBe(6);
    expect(preview.unplacedCount).toBe(0);
  });

  it('preview overflow readout uses totalBinsWanted vs binCount', () => {
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;

    // Make total footprint far exceed capacity.
    const items = makeItems(Array.from({ length: 20 }, () => 3));
    const preview = computePlacementPreview(tiny, { items, slottingBias: 0 });
    expect(preview.totalBinsWanted).toBe(60);
    expect(preview.binCount).toBe(binCount);
    expect(preview.unplacedCount).toBeGreaterThan(0);
    expect(preview.placedBinCount).toBeLessThanOrEqual(binCount);
  });
});
