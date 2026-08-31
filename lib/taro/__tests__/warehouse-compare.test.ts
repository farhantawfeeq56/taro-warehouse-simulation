import { describe, it, expect } from 'vitest';
import { warehousesAreIdentical, findDuplicateGroups } from '../warehouse-compare';
import type { WorkspaceWarehouse, Warehouse } from '../types';

function makeWarehouse(width: number, height: number, skus: string[]): Warehouse {
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      type: 'floor' as const,
      x,
      y,
      locations: [] as { sku: string; z: number; quantity: number }[],
    })),
  );
  const locations: { sku: string; z: number; quantity: number; x: number; y: number }[] = [];
  skus.forEach((sku, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    if (y < height) {
      grid[y][x].type = 'shelf';
      grid[y][x].locations = [{ sku, z: 1, quantity: 5 }];
      locations.push({ sku, z: 1, quantity: 5, x, y });
    }
  });
  return { width, height, grid, shelves: locations.map(l => ({ x: l.x, y: l.y })), locations, workerStart: null };
}

function ws(id: string, name: string, wh: Warehouse): WorkspaceWarehouse {
  return { id, name, position: null, warehouse: wh };
}

describe('warehouse-compare', () => {
  it('detects identical layouts', () => {
    const a = makeWarehouse(3, 3, ['A', 'B']);
    const b = makeWarehouse(3, 3, ['A', 'B']);
    expect(warehousesAreIdentical(ws('1', 'one', a), ws('2', 'two', b))).toBe(true);
  });

  it('detects different layouts', () => {
    const a = makeWarehouse(3, 3, ['A', 'B']);
    const b = makeWarehouse(3, 3, ['A', 'C']);
    expect(warehousesAreIdentical(ws('1', 'one', a), ws('2', 'two', b))).toBe(false);
  });

  it('groups duplicates by name', () => {
    const a = makeWarehouse(3, 3, ['A']);
    const b = makeWarehouse(3, 3, ['A']);
    const c = makeWarehouse(3, 3, ['B']);
    const groups = findDuplicateGroups([ws('1', 'one', a), ws('2', 'two', b), ws('3', 'three', c)]);
    expect(groups).toEqual([{ names: ['one', 'two'] }]);
  });
});
