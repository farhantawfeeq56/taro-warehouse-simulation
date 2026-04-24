import { describe, it, expect } from 'vitest';
import { findPath, calculatePathDistance, isWalkable, getNeighborGraph } from '../pathfinding';
import { createEmptyWarehouse } from '../demo-generator';

function countStepTypes(path: { x: number; y: number }[]) {
  let diagonalSteps = 0;
  let orthogonalSteps = 0;

  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);

    if (dx === 1 && dy === 1) {
      diagonalSteps++;
    } else if (dx + dy === 1) {
      orthogonalSteps++;
    }
  }

  return { diagonalSteps, orthogonalSteps };
}

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
      warehouse.grid[2][0].type = 'shelf';
      warehouse.grid[2][1].type = 'shelf';
      warehouse.grid[2][2].type = 'shelf';

      const path = findPath(warehouse, { x: 0, y: 1 }, { x: 4, y: 1 });
      expect(path.length).toBeGreaterThan(0);
      expect(path.every(p => warehouse.grid[p.y][p.x].type !== 'shelf')).toBe(true);
    });

    it('should return empty path if no path exists', () => {
      const warehouse = createEmptyWarehouse(5, 5);
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

    it('uses diagonal-optimal path on open grid from (0,0) to (5,5)', () => {
      const warehouse = createEmptyWarehouse(8, 8);
      const path = findPath(warehouse, { x: 0, y: 0 }, { x: 5, y: 5 });

      expect(path).toHaveLength(6);
      expect(calculatePathDistance(path)).toBeCloseTo(5 * Math.sqrt(2), 5);
      const { diagonalSteps, orthogonalSteps } = countStepTypes(path);
      expect(diagonalSteps).toBe(5);
      expect(orthogonalSteps).toBe(0);
    });

    it('prevents illegal corner-cutting diagonals when adjacent orthogonals are blocked', () => {
      const warehouse = createEmptyWarehouse(6, 6);
      warehouse.grid[2][1].type = 'shelf';
      warehouse.grid[1][2].type = 'shelf';

      const path = findPath(warehouse, { x: 1, y: 1 }, { x: 2, y: 2 });

      expect(path.length).toBeGreaterThan(0);
      expect(path[1]).not.toEqual({ x: 2, y: 2 });
      expect(calculatePathDistance(path)).toBeGreaterThan(Math.sqrt(2));
    });

    it('uses diagonals in open space without orthogonal staircase artifacts', () => {
      const warehouse = createEmptyWarehouse(8, 8);
      const start = { x: 0, y: 0 };
      const end = { x: 5, y: 3 };

      const path = findPath(warehouse, start, end);
      const { diagonalSteps, orthogonalSteps } = countStepTypes(path);

      expect(diagonalSteps).toBe(3);
      expect(orthogonalSteps).toBe(2);
      expect(calculatePathDistance(path)).toBeCloseTo(3 * Math.sqrt(2) + 2, 5);
    });
  });

  describe('calculatePathDistance', () => {
    it('should return 0 for empty path', () => {
      expect(calculatePathDistance([])).toBe(0);
    });

    it('should return 0 for single point path', () => {
      expect(calculatePathDistance([{ x: 0, y: 0 }])).toBe(0);
    });

    it('should calculate accumulated edge-cost distance', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 2 },
      ];

      expect(calculatePathDistance(path)).toBeCloseTo(2 * Math.sqrt(2) + 1, 5);
    });
  });

  describe('neighbor graph caching', () => {
    it('reuses cached graph when walkability is unchanged', () => {
      const warehouse = createEmptyWarehouse(6, 6);

      const graphA = getNeighborGraph(warehouse);
      const graphB = getNeighborGraph(warehouse);

      expect(graphA).toBe(graphB);
    });
  });
});
