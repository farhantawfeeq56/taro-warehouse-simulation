import { describe, it, expect } from 'vitest';
import { generateWarehouseSession, buildInventory } from '../warehouse-generator';
import { DEFAULT_WAREHOUSE_CONFIGURATION } from '../warehouse-configuration';

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
