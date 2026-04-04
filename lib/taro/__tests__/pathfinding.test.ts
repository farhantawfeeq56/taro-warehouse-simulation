import { describe, it, expect } from 'vitest';
import { findPath, calculatePathDistance, isWalkable } from '../pathfinding';
import { createEmptyWarehouse } from '../demo-generator';

describe('pathfinding', () => {
  describe('isWalkable', () => {
    it('should allow walking on empty cells', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      expect(isWalkable(warehouse, 5, 5)).toBe(true);
    });

    it('should not allow walking on shelf cells', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      warehouse.grid[5][5].type = 'shelf';
      expect(isWalkable(warehouse, 5, 5)).toBe(false);
    });

    it('should allow walking on worker-start cells', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      warehouse.grid[5][5].type = 'worker-start';
      expect(isWalkable(warehouse, 5, 5)).toBe(true);
    });

    it('should return false for out of bounds positions', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      expect(isWalkable(warehouse, -1, 5)).toBe(false);
      expect(isWalkable(warehouse, 5, -1)).toBe(false);
      expect(isWalkable(warehouse, 10, 5)).toBe(false);
      expect(isWalkable(warehouse, 5, 10)).toBe(false);
    });
  });

  describe('findPath', () => {
    it('should find path between adjacent cells', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      const path = findPath(warehouse, { x: 0, y: 0 }, { x: 1, y: 0 });
      expect(path).not.toHaveLength(0);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 1, y: 0 });
    });

    it('should find path avoiding obstacles', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      // Create a shelf wall
      warehouse.grid[2][0].type = 'shelf';
      warehouse.grid[2][1].type = 'shelf';
      warehouse.grid[2][2].type = 'shelf';

      const path = findPath(warehouse, { x: 0, y: 1 }, { x: 4, y: 1 });
      expect(path.length).toBeGreaterThan(0);
      // Path should go around the shelf
      expect(path.every(p => warehouse.grid[p.y][p.x].type !== 'shelf')).toBe(true);
    });

    it('should return empty path if no path exists', () => {
      const warehouse = createEmptyWarehouse(5, 5);
      // Create a complete wall
      for (let x = 0; x < 5; x++) {
        warehouse.grid[2][x].type = 'shelf';
      }

      const path = findPath(warehouse, { x: 0, y: 0 }, { x: 4, y: 4 });
      expect(path).toHaveLength(0);
    });

    it('should handle start and end on same cell', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      const path = findPath(warehouse, { x: 5, y: 5 }, { x: 5, y: 5 });
      expect(path).toEqual([{ x: 5, y: 5 }]);
    });
  });

  describe('calculatePathDistance', () => {
    it('should return 0 for empty path', () => {
      expect(calculatePathDistance([])).toBe(0);
    });

    it('should return 0 for single point path', () => {
      expect(calculatePathDistance([{ x: 0, y: 0 }])).toBe(0);
    });

    it('should calculate Manhattan distance correctly', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },  // 3 steps right
        { x: 3, y: 4 },  // 4 steps down
        { x: 5, y: 4 },  // 2 steps right
      ];
      expect(calculatePathDistance(path)).toBe(3 + 4 + 2); // 9
    });

    it('should handle diagonal paths (Manhattan distance)', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 3, y: 3 },  // 6 steps (3 right + 3 down)
      ];
      expect(calculatePathDistance(path)).toBe(6);
    });
  });
});
