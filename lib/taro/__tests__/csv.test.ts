import { describe, it, expect } from 'vitest';
import { generateTaskCSV, parseTaskCSV, coordToLocation, parseLocationZ } from '../csv';
import type { WorkerRoute } from '../types';

describe('csv', () => {
  describe('coordToLocation', () => {
    it('should convert coordinates to location label', () => {
      expect(coordToLocation(0, 0)).toBe('Aisle A, Rack 1, Bin 1');
      expect(coordToLocation(2, 0)).toBe('Aisle A, Rack 2, Bin 1');
      expect(coordToLocation(1, 0)).toBe('Aisle A, Rack 1, Bin 2');
    });

    it('should include z-level when provided', () => {
      expect(coordToLocation(0, 0, 1)).toBe('Aisle A, Rack 1, Bin 1, Level 1');
      expect(coordToLocation(0, 0, 3)).toBe('Aisle A, Rack 1, Bin 1, Level 3');
    });

    it('should handle larger coordinates', () => {
      expect(coordToLocation(10, 9)).toBe('Aisle D, Rack 6, Bin 1');
      expect(coordToLocation(11, 9)).toBe('Aisle D, Rack 6, Bin 2');
    });
  });

  describe('parseLocationZ', () => {
    it('should extract z-level from location string', () => {
      expect(parseLocationZ('Aisle A, Rack 1, Bin 1, Level 2')).toBe(2);
      expect(parseLocationZ('Aisle B, Rack 3, Bin 2, Level 4')).toBe(4);
    });

    it('should return undefined if no level found', () => {
      expect(parseLocationZ('Aisle A, Rack 1, Bin 1')).toBeUndefined();
      expect(parseLocationZ('Aisle B, Rack 3, Bin 2')).toBeUndefined();
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

    it('should sort picks by aisle and rack', () => {
      const routes: WorkerRoute[] = [
        {
          workerId: 1,
          route: [],
          picks: [
            { locationKey: '2,9,1-SKU_B', x: 2, y: 9, z: 1, sku: 'SKU_B' }, // Aisle D
            { locationKey: '0,0,1-SKU_A', x: 0, y: 0, z: 1, sku: 'SKU_A' }, // Aisle A
          ],
          color: '#3b82f6',
          zone: 'Aisle A',
          assignedPickCount: 2,
          progress: 0,
        },
      ];
      const csv = generateTaskCSV(routes);
      const lines = csv.split('\n').slice(1); // Skip header
      // SKU_A (Aisle A) should come before SKU_B (Aisle D)
      expect(lines[0]).toContain('SKU_A');
      expect(lines[1]).toContain('SKU_B');
    });
  });

  describe('parseTaskCSV', () => {
    it('should parse CSV with 5 columns', () => {
      const csv = `workerId,step,zone,location,item
1,1,Aisle A,Aisle A, Rack 1, Bin 1, Level 1,SKU_A
1,2,Aisle B,Aisle B, Rack 2, Bin 1, Level 2,SKU_B`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        workerId: 1,
        step: 1,
        zone: 'Aisle A',
        location: 'Aisle A, Rack 1, Bin 1, Level 1',
        item: 'SKU_A',
      });
      expect(tasks[1]).toEqual({
        workerId: 1,
        step: 2,
        zone: 'Aisle B',
        location: 'Aisle B, Rack 2, Bin 1, Level 2',
        item: 'SKU_B',
      });
    });

    it('should parse CSV with 4 columns (no zone)', () => {
      const csv = `workerId,step,location,item
1,1,Aisle A, Rack 1, Bin 1, Level 1,SKU_A
1,2,Aisle B, Rack 2, Bin 1, Level 2,SKU_B`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].zone).toBe('');
      expect(tasks[0].item).toBe('SKU_A');
    });

    it('should handle SKUs with commas', () => {
      const csv = `workerId,step,zone,location,item
1,1,Aisle A,Aisle A, Rack 1, Bin 1,Item, With, Commas,SKU_A`;

      const tasks = parseTaskCSV(csv);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].item).toBe('Item, With, Commas,SKU_A');
    });

    it('should filter invalid entries', () => {
      const csv = `workerId,step,zone,location,item
1,1,Aisle A,Aisle A, Rack 1, Bin 1,SKU_A
invalid,step,zone,location,item
1,abc,Aisle B,Aisle B, Rack 2, Bin 1,SKU_B`;

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
      expect(tasks[0].location).toContain('Level 1');
      expect(tasks[1].location).toContain('Level 2');
    });
  });
});
