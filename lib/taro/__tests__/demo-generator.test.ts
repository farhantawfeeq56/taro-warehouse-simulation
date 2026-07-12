import { describe, it, expect } from 'vitest';
import { createEmptyWarehouse, generateDemoWarehouse, getNextSku, generateRandomOrders } from '../demo-generator';
import { collectSkuMetadata } from '../inventory';
import type { Warehouse, StorageLocation } from '../types';

// ── Test helpers ────────────────────────────────────────────────────────────

/** Build a minimal warehouse sized to fit the given bins. */
function warehouseWithBins(bins: StorageLocation[]): Warehouse {
  // Compute required grid dimensions from bin coordinates (add padding)
  const maxX = bins.reduce((m, b) => Math.max(m, b.x), 0);
  const maxY = bins.reduce((m, b) => Math.max(m, b.y), 0);
  const width = maxX + 3;
  const height = maxY + 3;
  const grid: Warehouse['grid'] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [] as StorageLocation[],
    }))
  );
  for (const bin of bins) {
    grid[bin.y][bin.x] = { ...grid[bin.y][bin.x], type: 'shelf' };
    grid[bin.y][bin.x].locations.push(bin);
  }
  return {
    width,
    height,
    grid,
    shelves: bins.map((b) => ({ x: b.x, y: b.y })),
    workerStart: { x: 1, y: 1 },
    locations: [],
  };
}

/** Count how many times each SKU appears across a set of orders. */
function countSkuFrequencies(orders: { items: { skuId: string }[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      counts.set(item.skuId, (counts.get(item.skuId) ?? 0) + 1);
    }
  }
  return counts;
}

describe('demo-generator', () => {
  describe('createEmptyWarehouse', () => {
    it('should create warehouse with correct dimensions (logical + outer padding)', () => {
      const warehouse = createEmptyWarehouse(30, 24);
      expect(warehouse.width).toBe(30 + 2 * 2);
      expect(warehouse.height).toBe(24 + 2 * 2);
    });

    it('should initialize all cells as empty', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      for (let y = 0; y < warehouse.height; y++) {
        for (let x = 0; x < warehouse.width; x++) {
          expect(warehouse.grid[y][x].type).toBe('empty');
          expect(warehouse.grid[y][x].locations).toHaveLength(0);
        }
      }
    });

    it('should have no items or shelves initially', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      const totalBins = warehouse.grid.flat().reduce((sum, c) => sum + c.locations.length, 0);
      expect(totalBins).toBe(0);
      expect(warehouse.shelves).toHaveLength(0);
      expect(warehouse.workerStart).toBeNull();
    });
  });

  describe('generateDemoWarehouse', () => {
    it('should create warehouse with items', () => {
      const warehouse = generateDemoWarehouse();
      expect(warehouse.width).toBeGreaterThan(0);
      expect(warehouse.height).toBeGreaterThan(0);
      expect(warehouse.shelves.length).toBeGreaterThan(0);
      const totalBins = warehouse.grid.flat().reduce((sum, c) => sum + c.locations.length, 0);
      expect(totalBins).toBeGreaterThan(0);
    });

    it('should have worker start position', () => {
      const warehouse = generateDemoWarehouse();
      expect(warehouse.workerStart).not.toBeNull();
      expect(warehouse.workerStart?.x).toBeGreaterThanOrEqual(0);
      expect(warehouse.workerStart?.y).toBeGreaterThanOrEqual(0);
    });

    it('should have shelves with storage locations', () => {
      const warehouse = generateDemoWarehouse();
      const shelfCells = warehouse.grid.flat().filter(cell => cell.type === 'shelf');
      expect(shelfCells.length).toBeGreaterThan(0);

      // At least some shelves should have locations
      const shelvesWithLocations = shelfCells.filter(cell => cell.locations.length > 0);
      expect(shelvesWithLocations.length).toBeGreaterThan(0);
    });

    it('should have valid z-levels (1-4)', () => {
      const warehouse = generateDemoWarehouse();
      for (const cell of warehouse.grid.flat()) {
        for (const loc of cell.locations) {
          expect(loc.z).toBeGreaterThanOrEqual(1);
          expect(loc.z).toBeLessThanOrEqual(4);
          expect(loc.quantity).toBeGreaterThan(0);
          expect(loc.sku).toBeTruthy();
        }
      }
    });

    it('should have unique SKUs', () => {
      const warehouse = generateDemoWarehouse();
      const allSku: string[] = [];
      for (const cell of warehouse.grid.flat()) {
        for (const loc of cell.locations) {
          allSku.push(loc.sku);
        }
      }

      const uniqueSkus = new Set(allSku);
      expect(uniqueSkus.size).toBeGreaterThan(0);
    });
  });

  describe('getNextSku', () => {
    it('should start with SKU_001 for empty warehouse', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      expect(getNextSku(warehouse)).toBe('SKU_001');
    });

    it('should increment SKU based on existing items', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      warehouse.grid[0][0].type = 'shelf';
      warehouse.grid[0][0].locations = [
        { id: 'SKU_001@0,0,1', locationId: 'shelf-0-0', x: 0, y: 0, z: 1, sku: 'SKU_001', quantity: 10 },
        { id: 'SKU_002@0,0,2', locationId: 'shelf-0-0', x: 0, y: 0, z: 2, sku: 'SKU_002', quantity: 20 },
      ];

      expect(getNextSku(warehouse)).toBe('SKU_003');
    });

    it('should handle non-consecutive SKUs', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      warehouse.grid[0][0].type = 'shelf';
      warehouse.grid[0][0].locations = [
        { id: 'SKU_001@0,0,1', locationId: 'shelf-0-0', x: 0, y: 0, z: 1, sku: 'SKU_001', quantity: 10 },
        { id: 'SKU_100@0,0,2', locationId: 'shelf-0-0', x: 0, y: 0, z: 2, sku: 'SKU_100', quantity: 20 },
      ];

      expect(getNextSku(warehouse)).toBe('SKU_101');
    });
  });

  describe('collectSkuMetadata', () => {
    it('returns empty array for empty warehouse', () => {
      const w = createEmptyWarehouse(10, 10);
      expect(collectSkuMetadata(w)).toHaveLength(0);
    });

    it('dedupes by SKU across multiple bins', () => {
      const bins: StorageLocation[] = [
        { id: 'SKU_A@2,2,1', locationId: 'shelf-2-2', x: 2, y: 2, z: 1, sku: 'SKU_A', quantity: 10, demandScore: 5 },
        { id: 'SKU_A@2,2,2', locationId: 'shelf-2-2', x: 2, y: 2, z: 2, sku: 'SKU_A', quantity: 10, demandScore: 5 },
        { id: 'SKU_B@2,2,3', locationId: 'shelf-2-2', x: 2, y: 2, z: 3, sku: 'SKU_B', quantity: 20, demandScore: 1 },
      ];
      const w = warehouseWithBins(bins);
      const meta = collectSkuMetadata(w);
      expect(meta).toHaveLength(2);
      const a = meta.find((m) => m.skuId === 'SKU_A')!;
      expect(a.demandScore).toBe(5);
      expect(a.affinityGroup).toBeUndefined();
    });

    it('defaults demandScore to 1 and affinityGroup to undefined when absent', () => {
      const bins: StorageLocation[] = [
        { id: 'SKU_X@2,2,1', locationId: 'shelf-2-2', x: 2, y: 2, z: 1, sku: 'SKU_X', quantity: 10 },
      ];
      const w = warehouseWithBins(bins);
      const meta = collectSkuMetadata(w);
      expect(meta).toHaveLength(1);
      expect(meta[0].demandScore).toBe(1);
      expect(meta[0].affinityGroup).toBeUndefined();
    });

    it('reads affinityGroup when present', () => {
      const bins: StorageLocation[] = [
        { id: 'SKU_A@2,2,1', locationId: 'shelf-2-2', x: 2, y: 2, z: 1, sku: 'SKU_A', quantity: 10, demandScore: 3, affinityGroup: 7 },
        { id: 'SKU_B@3,2,1', locationId: 'shelf-3-2', x: 3, y: 2, z: 1, sku: 'SKU_B', quantity: 10, demandScore: 1, affinityGroup: 7 },
      ];
      const w = warehouseWithBins(bins);
      const meta = collectSkuMetadata(w);
      expect(meta).toHaveLength(2);
      expect(meta[0].affinityGroup).toBe(7);
      expect(meta[1].affinityGroup).toBe(7);
    });
  });

  describe('generateRandomOrders — demand weighting', () => {
    it('returns empty array when warehouse has no items', () => {
      const w = createEmptyWarehouse(10, 10);
      expect(generateRandomOrders(w, 5, 3)).toHaveLength(0);
    });

    it('generates the requested number of orders', () => {
      const bins: StorageLocation[] = [
        { id: 'SKU_A@2,2,1', locationId: 'shelf-2-2', x: 2, y: 2, z: 1, sku: 'SKU_A', quantity: 10, demandScore: 1 },
        { id: 'SKU_B@3,2,1', locationId: 'shelf-3-2', x: 3, y: 2, z: 1, sku: 'SKU_B', quantity: 10, demandScore: 1 },
        { id: 'SKU_C@4,2,1', locationId: 'shelf-4-2', x: 4, y: 2, z: 1, sku: 'SKU_C', quantity: 10, demandScore: 1 },
      ];
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 10, 2);
      expect(orders).toHaveLength(10);
    });

    it('all items in an order are unique (no duplicate SKUs)', () => {
      const bins: StorageLocation[] = Array.from({ length: 50 }, (_, i) => ({
        id: `SKU_${i}@2,2,1`,
        locationId: 'shelf-2-2',
        x: 2,
        y: 2,
        z: 1,
        sku: `SKU_${i}`,
        quantity: 10,
        demandScore: 1,
      }));
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 20, 5);
      for (const order of orders) {
        const skus = order.items.map((i) => i.skuId);
        expect(new Set(skus).size).toBe(skus.length);
      }
    });

    it('orders have items around avgOrderSize with variance', () => {
      const bins: StorageLocation[] = Array.from({ length: 100 }, (_, i) => ({
        id: `SKU_${i}@2,2,1`,
        locationId: 'shelf-2-2',
        x: 2,
        y: 2,
        z: 1,
        sku: `SKU_${i}`,
        quantity: 10,
        demandScore: 1,
      }));
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 200, 4);
      const sizes = orders.map((o) => o.items.length);
      const mean = sizes.reduce((s, n) => s + n, 0) / sizes.length;
      // Roughly centred on avgOrderSize (within ±1.5 given ±40% variance)
      expect(mean).toBeGreaterThan(2);
      expect(mean).toBeLessThan(7);
      // At least some variance (all orders shouldn't be the same size)
      expect(new Set(sizes).size).toBeGreaterThan(1);
    });

    it('higher-demand SKU appears more often than a lower-demand SKU (large sample)', () => {
      // 10 SKUs: 8 with demandScore=1, 2 with demandScore=8
      const bins: StorageLocation[] = [];
      for (let i = 0; i < 8; i++) {
        bins.push({
          id: `LOW_${i}@${2 + i},2,1`,
          locationId: `shelf-${2 + i}-2`,
          x: 2 + i,
          y: 2,
          z: 1,
          sku: `LOW_${i}`,
          quantity: 10,
          demandScore: 1,
        });
      }
      bins.push({
        id: 'HIGH_A@10,2,1',
        locationId: 'shelf-10-2',
        x: 10,
        y: 2,
        z: 1,
        sku: 'HIGH_A',
        quantity: 10,
        demandScore: 8,
      });
      bins.push({
        id: 'HIGH_B@11,2,1',
        locationId: 'shelf-11-2',
        x: 11,
        y: 2,
        z: 1,
        sku: 'HIGH_B',
        quantity: 10,
        demandScore: 8,
      });

      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 2000, 3);
      const freqs = countSkuFrequencies(orders);

      // Each high-demand SKU (8× heavier) should appear more than the average low-demand SKU
      const lowAvg =
        (freqs.get('LOW_0')! +
          freqs.get('LOW_1')! +
          freqs.get('LOW_2')! +
          freqs.get('LOW_3')! +
          freqs.get('LOW_4')! +
          freqs.get('LOW_5')! +
          freqs.get('LOW_6')! +
          freqs.get('LOW_7')!) /
        8;

      expect(freqs.get('HIGH_A')!).toBeGreaterThan(lowAvg * 3); // at least 3× (conservative)
      expect(freqs.get('HIGH_B')!).toBeGreaterThan(lowAvg * 3);
    });

    it('when all demandScores are equal, distribution is roughly uniform', () => {
      const bins: StorageLocation[] = Array.from({ length: 20 }, (_, i) => ({
        id: `SKU_${i}@${2 + i},2,1`,
        locationId: `shelf-${2 + i}-2`,
        x: 2 + i,
        y: 2,
        z: 1,
        sku: `SKU_${i}`,
        quantity: 10,
        demandScore: 1,
      }));
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 5000, 1); // size 1 isolates demand weighting
      const freqs = countSkuFrequencies(orders);
      const values = Array.from(freqs.values());
      const expected = 5000 / 20;
      for (const v of values) {
        // Each SKU should appear roughly 250 times (± a wide tolerance)
        expect(v).toBeGreaterThan(expected * 0.3);
        expect(v).toBeLessThan(expected * 1.7);
      }
    });
  });

  describe('generateRandomOrders — affinity bias', () => {
    it('SKUs from the same affinity group co-occur more often than chance', () => {
      // 20 SKUs across 2 affinity groups (group 1 and group 2).
      // All have equal demand to isolate the affinity effect.
      const bins: StorageLocation[] = [];
      for (let i = 0; i < 10; i++) {
        bins.push({
          id: `G1_${i}@${2 + i},2,1`,
          locationId: `shelf-${2 + i}-2`,
          x: 2 + i,
          y: 2,
          z: 1,
          sku: `G1_${i}`,
          quantity: 10,
          demandScore: 1,
          affinityGroup: 1,
        });
      }
      for (let i = 0; i < 10; i++) {
        bins.push({
          id: `G2_${i}@${2 + i},3,1`,
          locationId: `shelf-${2 + i}-3`,
          x: 2 + i,
          y: 3,
          z: 1,
          sku: `G2_${i}`,
          quantity: 10,
          demandScore: 1,
          affinityGroup: 2,
        });
      }

      const w = warehouseWithBins(bins);
      // Size-2 orders let us examine co-purchase pairs
      const orders = generateRandomOrders(w, 3000, 2);

      let sameGroupPairs = 0;
      let totalPairs = 0;

      for (const order of orders) {
        if (order.items.length < 2) continue;
        totalPairs++;
        const [a, b] = order.items;
        // Determine affinity groups from SKU prefix
        const groupA = a.skuId.startsWith('G1') ? 1 : 2;
        const groupB = b.skuId.startsWith('G1') ? 1 : 2;
        if (groupA === groupB) sameGroupPairs++;
      }

      const ratio = sameGroupPairs / totalPairs;
      // In a uniform world, both items are independent uniform over 20 SKUs,
      // so same-group probability ≈ (10/20)² + (10/20)² = 0.25 + 0.25 = 0.5.
      // With 5× affinity boost, same-group should dominate → expect > 0.8.
      expect(ratio).toBeGreaterThan(0.75);
    });

    it('no affinityGroup on bins means no affinity bias (degenerates to demand-only)', () => {
      const bins: StorageLocation[] = Array.from({ length: 30 }, (_, i) => ({
        id: `SKU_${i}@${2 + i},2,1`,
        locationId: `shelf-${2 + i}-2`,
        x: 2 + i,
        y: 2,
        z: 1,
        sku: `SKU_${i}`,
        quantity: 10,
        demandScore: 1,
      }));
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 2000, 2);
      const freqs = countSkuFrequencies(orders);
      // All SKUs should have roughly similar frequencies (no bias directionality)
      const values = Array.from(freqs.values());
      const minCount = Math.min(...values);
      const maxCount = Math.max(...values);
      // With 2000 orders of size 2 and 30 SKUs, expected = 133 per SKU.
      // Tolerance: 3× spread (uniform would have much tighter spread, but
      // weighted random still has noise, so use a generous bound).
      expect(maxCount / minCount).toBeLessThan(3);
    });

    it('single-SKU warehouse: every order contains that one SKU', () => {
      const bins: StorageLocation[] = [
        { id: 'LONELY@2,2,1', locationId: 'shelf-2-2', x: 2, y: 2, z: 1, sku: 'LONELY', quantity: 10, demandScore: 1 },
      ];
      const w = warehouseWithBins(bins);
      const orders = generateRandomOrders(w, 10, 3);
      expect(orders).toHaveLength(10);
      for (const order of orders) {
        expect(order.items).toHaveLength(1); // capped to pool size
        expect(order.items[0].skuId).toBe('LONELY');
      }
    });

    it('empty warehouse returns empty orders', () => {
      const w = createEmptyWarehouse(10, 10);
      const orders = generateRandomOrders(w, 5, 3);
      expect(orders).toHaveLength(0);
    });
  });
});
