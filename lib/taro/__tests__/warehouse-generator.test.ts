import { describe, it, expect } from 'vitest';
import { generateWarehouseSession, buildInventory, balanceSkuCount } from '../warehouse-generator';
import { DEFAULT_WAREHOUSE_CONFIGURATION } from '../warehouse-configuration';

describe('balanceSkuCount', () => {
  it('keeps the requested count when it fits capacity', () => {
    expect(balanceSkuCount(1000, 2000)).toBe(1000);
  });

  it('caps the count at ~90% of bin capacity when it would overflow', () => {
    expect(balanceSkuCount(2500, 2000)).toBe(Math.floor(2000 * 0.9));
  });

  it('caps even a tiny request when the layout is smaller', () => {
    expect(balanceSkuCount(500, 100)).toBe(Math.floor(100 * 0.9));
  });
});

describe('generateWarehouseSession (session-only generator)', () => {
  it('generates a valid warehouse with orders without any DB', () => {
    const cfg = {
      ...DEFAULT_WAREHOUSE_CONFIGURATION,
      inventory: {
        ...DEFAULT_WAREHOUSE_CONFIGURATION.inventory,
        skuCount: 200,
      },
    };

    const result = generateWarehouseSession(cfg, 100, 5);

    expect(result.warehouse).toBeTruthy();
    expect(result.warehouse.grid.length).toBeGreaterThan(0);
    expect(result.warehouse.workerStart).not.toBeNull();
    expect(result.orders.length).toBeGreaterThan(0);
    expect(result.unplacedSkus.length).toBe(0);
    expect(result.quantityViolations.length).toBe(0);
  });

  it('balances a huge requested SKU count down to the layout capacity so nothing is unplaced', () => {
    // Max sliders vs a small layout: the generator must clamp the catalogue
    // to the available bins so every SKU gets placed and orders stay valid.
    const cfg = {
      ...DEFAULT_WAREHOUSE_CONFIGURATION,
      layout: {
        ...DEFAULT_WAREHOUSE_CONFIGURATION.layout,
        gridHeight: 8,
        rackCount: 6,
      },
      inventory: {
        ...DEFAULT_WAREHOUSE_CONFIGURATION.inventory,
        skuCount: 3000,
      },
    };

    const result = generateWarehouseSession(cfg, 100, 5);

    expect(result.unplacedSkus.length).toBe(0);
    expect(result.placedBinCount).toBeGreaterThan(0);
    expect(result.orders.length).toBeGreaterThan(0);
    expect(result.orders.every((o) => o.items.length > 0)).toBe(true);
  });

  it('defaults produce a balanced catalogue that fully fits the default layout', () => {
    const result = generateWarehouseSession(DEFAULT_WAREHOUSE_CONFIGURATION, 100, 5);

    expect(result.unplacedSkus.length).toBe(0);
    expect(result.placedBinCount).toBeGreaterThan(0);
  });

  it('buildInventory produces one Item per SKU with all enrichments', () => {
    const cfg = {
      ...DEFAULT_WAREHOUSE_CONFIGURATION,
      inventory: {
        ...DEFAULT_WAREHOUSE_CONFIGURATION.inventory,
        skuCount: 50,
        demandDistribution: 80,
        productAffinity: 60,
        storageFootprint: 40,
      },
    };

    const items = buildInventory(cfg);

    expect(items).toHaveLength(50);
    for (const item of items) {
      expect(item.id).toMatch(/^SKU_\d{3}$/);
      expect(item.demandScore).toBeGreaterThan(0);
      expect(item.affinityGroup).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.storageFootprint).toBeGreaterThanOrEqual(1);
      expect(item.totalQuantity).toBeGreaterThan(0);
    }
  });
});
