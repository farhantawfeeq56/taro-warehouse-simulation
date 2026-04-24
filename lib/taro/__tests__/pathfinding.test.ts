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
      expect(isWalkable(warehouse, warehouse.width, 5)).toBe(false);
      expect(isWalkable(warehouse, 5, warehouse.height)).toBe(false);
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
      // Create a complete wall across the entire width
      for (let x = 0; x < warehouse.width; x++) {
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

    it('should calculate orthogonal distances correctly', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },  // 3 steps right
        { x: 3, y: 4 },  // 4 steps down
        { x: 5, y: 4 },  // 2 steps right
      ];
      expect(calculatePathDistance(path)).toBe(3 + 4 + 2); // 9
    });

    it('should handle diagonal paths with Euclidean distance', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      expect(calculatePathDistance(path)).toBeCloseTo(Math.sqrt(2));
    });
  });

  describe('8-direction pathfinding', () => {
    it('should find diagonal path when allowed', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      const start = { x: 0, y: 0 };
      const end = { x: 2, y: 2 };
      
      const path = findPath(warehouse, start, end, { allowDiagonals: true });
      
      // Path could be (0,0) -> (1,1) -> (2,2)
      expect(path).toHaveLength(3);
      expect(path[1]).toEqual({ x: 1, y: 1 });
      expect(calculatePathDistance(path)).toBeCloseTo(2 * Math.sqrt(2));
    });

    it('should respect corner cutting constraints', () => {
      const warehouse = createEmptyWarehouse(10, 10);
      // Place shelves such that diagonal between (1,1) and (2,2) is blocked by corners
      // To go from (1,1) to (2,2) diagonally, (1,2) and (2,1) must be walkable.
      warehouse.grid[1][2].type = 'shelf'; 
      
      const start = { x: 1, y: 1 };
      const end = { x: 2, y: 2 };
      
      const path = findPath(warehouse, start, end, { allowDiagonals: true });
      
      // Should not be able to go directly (1,1) -> (2,2)
      // Must go (1,1) -> (2,1) [blocked] or (1,1) -> (1,2) [blocked] or ...
      // Wait, if I block (1,2), then (1,1) to (2,2) diagonal is blocked if we enforce no corner cutting.
      // The check is: check: [{ x: x - 1, y }, { x, y: y - 1 }]
      // For (1,1) to (2,2), it's (2,2) relative to (1,1).
      // cand = {x:2, y:2}, check = [{x:2, y:1}, {x:1, y:2}]
      
      expect(path.some(p => p.x === 2 && p.y === 2)).toBe(true);
      // If direct diagonal is blocked, it must take at least 2 orthogonal steps or another route
      const dist = calculatePathDistance(path);
      expect(dist).toBeGreaterThan(Math.sqrt(2));
    });
  });
});
