import { describe, it, expect } from 'vitest';
import { warehousesAreIdentical, findDuplicateGroups } from '../warehouse-compare';
import type { WorkspaceWarehouse, Warehouse, Cell, StorageLocation } from '../types';

function loc(sku: string, x: number, y: number): StorageLocation {
  return { id: `l-${sku}-${x}-${y}`, locationId: `loc-${x}-${y}`, x, y, z: 1, sku, quantity: 5 };
}

function makeWarehouse(width: number, height: number, skus: string[]): Warehouse {
  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      type: 'empty' as const,
      x,
      y,
      locations: [] as StorageLocation[],
    })),
  );
  const locations: StorageLocation[] = [];
  skus.forEach((sku, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    if (y < height) {
      grid[y][x] = { type: 'shelf', x, y, locations: [loc(sku, x, y)] };
      locations.push(loc(sku, x, y));
    }
  });
  return {
    width,
    height,
    grid,
    shelves: locations.map(l => ({ x: l.x, y: l.y })),
    locations: locations.map(l => ({ id: `wl-${l.x}-${l.y}`, x: l.x, y: l.y, type: 'shelf' as const, binIds: [l.id] })),
    workerStart: null,
  };
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
