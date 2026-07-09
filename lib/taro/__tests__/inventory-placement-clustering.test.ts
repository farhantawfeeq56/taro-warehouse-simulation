import { describe, expect, it } from 'vitest';
import { generateParallelLayout } from '../layout-generator';
import {
  applyInventoryPlacement,
  applyInventoryPlacementDetailed,
  computePlacementPreview,
} from '../inventory-placement';
import type { Item, Warehouse } from '../types';

function makeItems(spec: { demand?: number; category?: number }[]): Item[] {
  return spec.map((s, i) => ({
    id: `SKU_${String(i + 1).padStart(3, '0')}`,
    demandScore: s.demand ?? 0,
    category: s.category,
  }));
}

function bigWarehouse(): Warehouse {
  return generateParallelLayout(12, 10, 2);
}

// (StorageLocation carries no category field, so tests resolve sku -> category
// via the generating item array.)
function categoryBySku(items: Item[]): Map<string, number | undefined> {
  const m = new Map<string, number | undefined>();
  for (const it of items) m.set(it.id, it.category);
  return m;
}

function categoryRuns(warehouse: Warehouse, items: Item[]): Map<number, number> {
  const cs = categoryBySku(items);
  // Rebuild tour using actual placed SKUs, resolving categories through cs.
  const dispatch = warehouse.workerStart
    ? warehouse.workerStart
    : { x: 0, y: warehouse.height - 1 };
  const shelves: { x: number; y: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (warehouse.grid[y][x].type === 'shelf') shelves.push({ x, y });
    }
  }
  const raw: { x: number; y: number; z: number; dist: number }[] = [];
  shelves.forEach((shelf, i) => {
    const zLevels = (i % 3) + 1;
    for (let z = 1; z <= zLevels; z++) {
      raw.push({
        x: shelf.x,
        y: shelf.y,
        z,
        dist: Math.abs(shelf.x - dispatch.x) + Math.abs(shelf.y - dispatch.y),
      });
    }
  });
  raw.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.z - b.z));

  let runs = new Map<number, number>();
  let prev: number | undefined;
  for (const b of raw) {
    const cell = warehouse.grid[b.y][b.x];
    const bin = cell.locations.find((l) => l.z === b.z);
    if (!bin) continue;
    const cat = cs.get(bin.sku);
    if (cat == null) continue;
    if (cat !== prev) runs.set(cat, (runs.get(cat) ?? 0) + 1);
    prev = cat;
  }
  return runs;
}

describe('inventory-placement (category clustering)', () => {
  it('at clustering = 100 each category occupies a single contiguous zone', () => {
    const warehouse = bigWarehouse();
    // Two categories, 4 SKUs each, distinct demand profiles.
    const items = makeItems([
      { demand: 9, category: 1 }, { demand: 8, category: 1 },
      { demand: 7, category: 1 }, { demand: 6, category: 1 },
      { demand: 5, category: 2 }, { demand: 4, category: 2 },
      { demand: 3, category: 2 }, { demand: 2, category: 2 },
    ]);
    const out = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 100,
      categoryClustering: 100,
      seed: 1,
    });
    const runs = categoryRuns(out, items);
    // Each real category should appear in exactly ONE contiguous run.
    expect(runs.get(1)).toBe(1);
    expect(runs.get(2)).toBe(1);
  });

  it('at clustering = 0 (scattered) categories are interleaved (all SKUs placed)', () => {
    const warehouse = bigWarehouse();
    const items = makeItems(
      Array.from({ length: 12 }, (_, i) => ({
        demand: 12 - i,
        category: (i % 3) + 1, // 3 categories interleaved in the input
      }))
    );
    const out = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 100,
      categoryClustering: 0,
      seed: 1,
    });
    const runs = categoryRuns(out, items);
    // With demand-rank filling over the whole tour and interleaved input
    // categories, each category must span MORE than one run (fully scattered).
    expect((runs.get(1) ?? 0)).toBeGreaterThan(1);
    expect((runs.get(2) ?? 0)).toBeGreaterThan(1);
    expect((runs.get(3) ?? 0)).toBeGreaterThan(1);
    // All SKUs placed, no duplicates (sanity).
    const placedSkus = out.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => l.sku));
    expect(placedSkus).toHaveLength(items.length);
    expect(new Set(placedSkus).size).toBe(items.length);
  });

  it('clustering = 0 reproduces the pure Slotting Bias placement exactly', () => {
    const warehouse = bigWarehouse();
    const items = makeItems(
      Array.from({ length: 20 }, (_, i) => ({
        demand: (i * 7) % 10 + 1,
        category: (i % 4) + 1,
      }))
    );
    const scatter = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 60,
      categoryClustering: 0,
      seed: 5,
    });
    const baseline = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 60,
      // no categoryClustering -> defaults to 0
      seed: 5,
    });
    const a = scatter.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    const b = baseline.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    expect(a).toEqual(b);
  });

  it('at clustering = 100 with slotting = 100, high-demand category is nearer dispatch', () => {
    const warehouse = bigWarehouse();
    const dispatch = warehouse.workerStart!;
    // Category 1 has the high-demand SKUs; category 2 the low-demand SKUs.
    const items = makeItems([
      { demand: 9, category: 1 }, { demand: 8, category: 1 },
      { demand: 7, category: 1 }, { demand: 6, category: 1 },
      { demand: 2, category: 2 }, { demand: 1, category: 2 },
      { demand: 0.5, category: 2 }, { demand: 0.1, category: 2 },
    ]);
    const out = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 100,
      categoryClustering: 100,
      seed: 7,
    });
    const avgDist = (cat: number) => {
      const dists: number[] = [];
      out.grid.flat().forEach((c) => {
        for (const l of c.locations) {
          if (items.some((it) => it.id === l.sku && it.category === cat)) {
            dists.push(Math.abs(c.x - dispatch.x) + Math.abs(c.y - dispatch.y));
          }
        }
      });
      return dists.reduce((a, b) => a + b, 0) / Math.max(1, dists.length);
    };
    // Category 1 (high mean demand) should be, on average, no farther than
    // category 2 (low mean demand).
    expect(avgDist(1)).toBeLessThanOrEqual(avgDist(2));
  });

  it('is deterministic for a fixed seed', () => {
    const warehouse = bigWarehouse();
    const items = makeItems(
      Array.from({ length: 16 }, (_, i) => ({
        demand: (i % 5) + 1,
        category: (i % 3) + 1,
      }))
    );
    const run = (seed: number) =>
      applyInventoryPlacement(warehouse, {
        items,
        slottingBias: 50,
        categoryClustering: 50,
        seed,
      }).grid
        .flat()
        .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
        .sort()
        .join('|');
    expect(run(11)).toEqual(run(11));
  });

  it('graceful fallback: clustering has no effect when items lack categories', () => {
    const warehouse = bigWarehouse();
    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
      id: `SKU_${String(i + 1).padStart(3, '0')}`,
      demandScore: 10 - i,
      // category intentionally undefined
    }));
    const scattered = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 70,
      categoryClustering: 0,
      seed: 3,
    });
    const clustered = applyInventoryPlacement(warehouse, {
      items,
      slottingBias: 70,
      categoryClustering: 100,
      seed: 3,
    });
    const a = scattered.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    const b = clustered.grid
      .flat()
      .flatMap((c) => c.locations.map((l) => `${l.x},${l.y},${l.z}:${l.sku}`))
      .sort();
    // Without real categories, the clustered plan == scatter plan.
    expect(a).toEqual(b);
  });

  it('preview reports categoryCount and places all SKUs', () => {
    const warehouse = bigWarehouse();
    const items = makeItems(
      Array.from({ length: 18 }, (_, i) => ({
        demand: 18 - i,
        category: (i % 3) + 1,
      }))
    );
    const preview = computePlacementPreview(warehouse, {
      items,
      slottingBias: 80,
      categoryClustering: 100,
    });
    expect(preview.categoryCount).toBe(3);
    expect(preview.unplacedCount).toBe(0);
    expect(preview.shelves.some((s) => s.active)).toBe(true);
  });

  it('overflow is still respected under clustering', () => {
    const tiny = generateParallelLayout(4, 1, 1);
    const shelfCount = tiny.grid.flat().filter((c) => c.type === 'shelf').length;
    let binCount = 0;
    for (let i = 0; i < shelfCount; i++) binCount += (i % 3) + 1;
    const items = makeItems(
      Array.from({ length: binCount + 6 }, (_, i) => ({
        demand: i + 1,
        category: (i % 2) + 1,
      }))
    );
    const result = applyInventoryPlacementDetailed(tiny, {
      items,
      slottingBias: 100,
      categoryClustering: 100,
    });
    expect(result.binCount).toBe(binCount);
    expect(result.placedCount).toBe(binCount);
    expect(result.unplacedSkus.length).toBe(6);
  });
});