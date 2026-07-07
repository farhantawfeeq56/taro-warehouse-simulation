import { describe, expect, it } from 'vitest';
import { generateParallelLayout } from '../layout-generator';
import {
  applyInventoryPlacement,
  computePlacementPreview,
  DEFAULT_INVENTORY_PLACEMENT,
  normalisePlacement,
} from '../inventory-placement';

describe('inventory-placement', () => {
  const warehouse = generateParallelLayout(8, 4, 2);

  it('applies placement and produces shelf locations for active shelves', () => {
    const out = applyInventoryPlacement(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    const totalShelves = out.grid
      .flat()
      .filter((cell) => cell.type === 'shelf').length;
    const activeCells = out.grid.flat().filter((cell) => cell.locations.length > 0);
    const activeShelves = activeCells.length;
    expect(activeShelves).toBeGreaterThan(0);
    expect(activeShelves).toBeLessThanOrEqual(totalShelves);

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

  it('low inventory spread leaves more empty shelves than high spread', () => {
    const compact = applyInventoryPlacement(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      inventorySpread: 0,
    });
    const distributed = applyInventoryPlacement(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      inventorySpread: 100,
    });
    const compactActive = compact.grid.flat().filter((c) => c.locations.length > 0).length;
    const distributedActive = distributed.grid.flat().filter((c) => c.locations.length > 0).length;
    expect(compactActive).toBeLessThan(distributedActive);
  });

  it('preview reflects active density of shelves', () => {
    const preview = computePlacementPreview(warehouse, DEFAULT_INVENTORY_PLACEMENT);
    const active = preview.shelves.filter((s) => s.active);
    expect(active.length).toBeGreaterThan(0);
    for (const s of active) {
      expect(s.zLevels).toBeGreaterThanOrEqual(1);
      expect(s.zLevels).toBeLessThanOrEqual(4);
    }
  });

  it('high fast-mover placement concentrates high-demand shelves near dispatch', () => {
    const focused = applyInventoryPlacement(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      fastMoverPlacement: 100,
      hotspotIntensity: 90,
    });
    const preview = computePlacementPreview(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      fastMoverPlacement: 100,
      hotspotIntensity: 90,
    });
    const top = [...preview.shelves].sort((a, b) => b.fastMoverScore - a.fastMoverScore)[0];
    expect(top).toBeDefined();
    if (warehouse.workerStart && top) {
      // The dominant hotspot should be closer to dispatch than the average active shelf.
      const dist = Math.abs(top.x - warehouse.workerStart!.x) + Math.abs(top.y - warehouse.workerStart!.y);
      const otherDistances = preview.shelves
        .filter((s) => s.active && s.x !== top.x && s.y !== top.y)
        .map((s) => Math.abs(s.x - warehouse.workerStart!.x) + Math.abs(s.y - warehouse.workerStart!.y));
      const avgOther = otherDistances.reduce((a, b) => a + b, 0) / Math.max(1, otherDistances.length);
      expect(dist).toBeLessThanOrEqual(avgOther);
    }
    const activeCells = focused.grid.flat().filter((c) => c.locations.length > 0).length;
    expect(activeCells).toBeGreaterThan(0);
  });

  it('high product grouping produces shelves that share a group', () => {
    const preview = computePlacementPreview(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      productGrouping: 100,
    });
    const groupCounts = new Map<number, number>();
    for (const s of preview.shelves.filter((s) => s.active)) {
      groupCounts.set(s.groupIndex, (groupCounts.get(s.groupIndex) ?? 0) + 1);
    }
    // At least one group should have multiple members.
    const maxGroup = Math.max(0, ...Array.from(groupCounts.values()));
    expect(maxGroup).toBeGreaterThan(1);
  });

  it('low product grouping produces a single, large group', () => {
    const preview = computePlacementPreview(warehouse, {
      ...DEFAULT_INVENTORY_PLACEMENT,
      productGrouping: 0,
    });
    const groups = new Set(preview.shelves.filter((s) => s.active).map((s) => s.groupIndex));
    expect(groups.size).toBe(1);
  });

  it('normalisePlacement clamps values to 0..1', () => {
    const norm = normalisePlacement({
      fastMoverPlacement: -50,
      productGrouping: 150,
      inventorySpread: 50,
      hotspotIntensity: 50,

    });
    expect(norm.fastMoverPlacement).toBe(0);
    expect(norm.productGrouping).toBe(1);
    expect(norm.inventorySpread).toBe(0.5);
    expect(norm.hotspotIntensity).toBe(0.5);
  });
});
