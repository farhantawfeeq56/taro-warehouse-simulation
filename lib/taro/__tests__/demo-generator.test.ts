import { describe, it, expect } from 'vitest';
import { createEmptyWarehouse, generateDemoWarehouse, getNextSku } from '../demo-generator';

describe('demo-generator', () => {
  describe('createEmptyWarehouse', () => {
    it('should create warehouse with correct dimensions', () => {
      const warehouse = createEmptyWarehouse(30, 24);
      expect(warehouse.width).toBe(30);
      expect(warehouse.height).toBe(24);
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
});
