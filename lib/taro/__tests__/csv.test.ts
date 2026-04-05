import { describe, it, expect } from 'vitest';
import { generateTaskCSV, parseTaskCSV, coordToLocation, parseLocationZ } from '../csv';
import type { WorkerRoute } from '../types';

describe('csv', () => {
  describe('coordToLocation', () => {
    it('should convert coordinates to location label', () => {
      expect(coordToLocation(0, 0)).toBe('X:0, Y:0');
      expect(coordToLocation(2, 0)).toBe('X:2, Y:0');
      expect(coordToLocation(1, 0)).toBe('X:1, Y:0');
    });

    it('should include z-level when provided', () => {
      expect(coordToLocation(0, 0, 1)).toBe('X:0, Y:0, Z:1');
      expect(coordToLocation(0, 0, 3)).toBe('X:0, Y:0, Z:3');
    });

    it('should handle larger coordinates', () => {
      expect(coordToLocation(10, 9)).toBe('X:10, Y:9');
      expect(coordToLocation(11, 9)).toBe('X:11, Y:9');
    });
  });

  describe('parseLocationZ', () => {
    it('should extract z-level from location string', () => {
      expect(parseLocationZ('X:0, Y:0, Z:2')).toBe(2);
      expect(parseLocationZ('X:7, Y:4, Level 4')).toBe(4);
    });

    it('should return undefined if no level found', () => {
      expect(parseLocationZ('X:1, Y:2')).toBeUndefined();
      expect(parseLocationZ('X:7, Y:4')).toBeUndefined();
    });

    it('should handle invalid input', () => {
      expect(parseLocationZ('')).toBeUndefined();
      expect(parseLocationZ('No Level Here')).toBeUndefined();
    });
  });

  describe('generateTaskCSV', () => {
    it('should generate CSV with header', () => {
      const routes: WorkerRoute[] = [
        {
          workerId: 1,
          route: [],
          picks: [{ locationKey: '0,0,1-SKU_A', x: 0, y: 0, z: 1, sku: 'SKU_A' }],
          color: '#3b82f6',
          zone: 'Aisle A',
          assignedPickCount: 1,
          progress: 0,
        },
      ];
      const csv = generateTaskCSV(routes);
      expect(csv.startsWith('workerId,step,zone,location,item')).toBe(true);
    });

    it('should include all worker picks', () => {
      const routes: WorkerRoute[] = [
        {
          workerId: 1,
          route: [],
          picks: [
            { locationKey: '0,0,1-SKU_A', x: 0, y: 0, z: 1, sku: 'SKU_A' },
            { locationKey: '2,0,1-SKU_B', x: 2, y: 0, z: 1, sku: 'SKU_B' },
          ],
          color: '#3b82f6',
          zone: 'Aisle A',
          assignedPickCount: 2,
          progress: 0,
        },
      ];
      const csv = generateTaskCSV(routes);
      expect(csv).toContain('SKU_A');
      expect(csv).toContain('SKU_B');
      expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
    });

    it('should sort picks by y then x', () => {
      const routes: WorkerRoute[] = [
        {
          workerId: 1,
          route: [],
          picks: [
            { locationKey: '2,9,1-SKU_B', x: 2, y: 9, z: 1, sku: 'SKU_B' },
            { locationKey: '0,0,1-SKU_A', x: 0, y: 0, z: 1, sku: 'SKU_A' },
          ],
          color: '#3b82f6',
          zone: 'Aisle A',
          assignedPickCount: 2,
          progress: 0,
        },
      ];
      const csv = generateTaskCSV(routes);
      const lines = csv.split('\n').slice(1); // Skip header
      expect(lines[0]).toContain('SKU_A');
      expect(lines[1]).toContain('SKU_B');
    });
  });

  describe('parseTaskCSV', () => {
    it('should parse CSV with 5 columns', () => {
      const csv = `workerId,step,zone,location,item
1,1,Zone 1,X:0, Y:0, Z:1,SKU_A
1,2,Zone 2,X:2, Y:1, Z:2,SKU_B`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        workerId: 1,
        step: 1,
        zone: 'Zone 1',
        location: 'X:0, Y:0, Z:1',
        item: 'SKU_A',
      });
      expect(tasks[1]).toEqual({
        workerId: 1,
        step: 2,
        zone: 'Zone 2',
        location: 'X:2, Y:1, Z:2',
        item: 'SKU_B',
      });
    });

    it('should parse CSV with 4 columns (no zone)', () => {
      const csv = `workerId,step,location,item
1,1,X:0, Y:0, Z:1,SKU_A
1,2,X:2, Y:2, Z:2,SKU_B`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].zone).toBe('');
      expect(tasks[0].item).toBe('SKU_A');
    });

    it('should handle SKUs with commas', () => {
      const csv = `workerId,step,zone,location,item
1,1,Zone 1,X:0, Y:0,Item, With, Commas,SKU_A`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].item).toBe('Item, With, Commas,SKU_A');
    });

    it('should filter invalid entries', () => {
      const csv = `workerId,step,zone,location,item
1,1,Zone 1,X:0, Y:0,SKU_A
invalid,step,zone,location,item
1,abc,Zone 2,X:2, Y:1,SKU_B`;

      const tasks = parseTaskCSV(csv);
      // Should only include valid rows
      expect(tasks.every(t => !isNaN(t.workerId) && !isNaN(t.step))).toBe(true);
    });
  });

  describe('CSV round-trip', () => {
    it('should preserve data through generate and parse', () => {
      const originalRoutes: WorkerRoute[] = [
        {
          workerId: 1,
          route: [],
          picks: [
            { locationKey: '0,0,1-SKU_A', x: 0, y: 0, z: 1, sku: 'SKU_A' },
            { locationKey: '2,3,2-SKU_B', x: 2, y: 3, z: 2, sku: 'SKU_B' },
          ],
          color: '#3b82f6',
          zone: 'Aisle A',
          assignedPickCount: 2,
          progress: 0,
        },
      ];

      const csv = generateTaskCSV(originalRoutes);
      const tasks = parseTaskCSV(csv);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].item).toBe('SKU_A');
      expect(tasks[1].item).toBe('SKU_B');
      expect(tasks[0].location).toContain('Z:1');
      expect(tasks[1].location).toContain('Z:2');
    });
  });
});
