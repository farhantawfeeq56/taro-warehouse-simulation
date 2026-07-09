import { describe, expect, it } from 'vitest';
import {
  resolveOrderToLocations,
  validateOrderItemLocations,
} from '../order-location-resolver';
import type { Cell, Order, StorageLocation, Warehouse } from '../types';
import { getShelfLocationId } from '../layout';

function makeBin(x: number, y: number, z: number, sku: string, quantity = 10): StorageLocation {
  return {
    id: `${sku}@${x},${y},${z}`,
    locationId: getShelfLocationId(x, y),
    x,
    y,
    z,
    sku,
    quantity,
  };
}

function makeCell(x: number, y: number, type: 'empty' | 'shelf' | 'worker-start', bins: StorageLocation[] = []): Cell {
  return { x, y, type, locations: bins };
}

function makeWarehouse(cells: Cell[], width: number, height: number, workerStart = { x: 0, y: 0 }): Warehouse {
  const padded: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push(makeCell(x, y, 'empty'));
    }
    padded.push(row);
  }
  for (const cell of cells) {
    padded[cell.y][cell.x] = cell;
  }
  return {
    width,
    height,
    grid: padded,
    shelves: padded
      .flat()
      .filter(c => c.type === 'shelf')
      .map(c => ({ x: c.x, y: c.y })),
    workerStart,
    locations: padded
      .flat()
      .filter(c => c.type === 'shelf')
      .map(c => ({
        id: getShelfLocationId(c.x, c.y),
        x: c.x,
        y: c.y,
        type: 'shelf',
        binIds: c.locations.map(loc => loc.id),
      })),
  };
}

describe('resolveOrderToLocations', () => {
  it('resolves skuId-based entries to their bin coordinates', () => {
    const warehouse = makeWarehouse(
      [
        makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_A', 10)]),
        makeCell(1, 0, 'shelf', [makeBin(1, 0, 1, 'SKU_B', 5)]),
        makeCell(0, 0, 'worker-start'),
      ],
      3,
      1
    );
    const order: Order = {
      id: 'order-1',
      items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }],
      assignedWorkerId: null,
    };

    const resolved = resolveOrderToLocations(order, warehouse);
    expect(resolved.orderId).toBe('order-1');
    expect(resolved.lines).toHaveLength(2);
    expect(resolved.lines[0]).toMatchObject({ skuId: 'SKU_A', bin: { x: 0, y: 0, z: 1, sku: 'SKU_A', quantity: 10 } });
    expect(resolved.lines[1]).toMatchObject({ skuId: 'SKU_B', bin: { x: 1, y: 0, z: 1, sku: 'SKU_B', quantity: 5 } });
    expect(resolved.missingSkuIds).toEqual([]);
  });

  it('reports missing SKUs without throwing', () => {
    const warehouse = makeWarehouse(
      [makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_A')])],
      1,
      1
    );
    const order: Order = {
      id: 'order-2',
      items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_NOT_FOUND' }],
      assignedWorkerId: null,
    };

    const resolved = resolveOrderToLocations(order, warehouse);
    expect(resolved.lines).toHaveLength(1);
    expect(resolved.missingSkuIds).toEqual(['SKU_NOT_FOUND']);
  });

  it('respects the requested quantity on each line', () => {
    const warehouse = makeWarehouse(
      [makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_A', 100)])],
      1,
      1
    );
    const order: Order = {
      id: 'order-3',
      items: [{ skuId: 'SKU_A', quantity: 5 }],
      assignedWorkerId: null,
    };

    const resolved = resolveOrderToLocations(order, warehouse);
    expect(resolved.lines[0].quantity).toBe(5);
  });
});

describe('validateOrderItemLocations', () => {
  it('accepts orders where every skuId resolves to a known bin', () => {
    const warehouse = makeWarehouse(
      [makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_A')])],
      1,
      1
    );
    const order: Order = {
      id: 'order-1',
      items: [{ skuId: 'SKU_A' }],
      assignedWorkerId: null,
    };

    expect(() => validateOrderItemLocations(order, warehouse)).not.toThrow();
  });

  it('throws when an skuId cannot be resolved', () => {
    const warehouse = makeWarehouse(
      [makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_A')])],
      1,
      1
    );
    const order: Order = {
      id: 'order-2',
      items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_NOT_FOUND' }],
      assignedWorkerId: null,
    };

    expect(() => validateOrderItemLocations(order, warehouse)).toThrowError(
      /Order "order-2" references unknown skuId "SKU_NOT_FOUND" at index 1/
    );
  });

  it('accepts a SKU spanning multiple bins (no primary markers — legacy)', () => {
    // A SKU may now legitimately occupy multiple storage locations (its
    // storageFootprint). Without any `primary` marker the resolver falls
    // back to the first-encountered bin, so the order still resolves.
    const warehouse = makeWarehouse(
      [
        makeCell(0, 0, 'shelf', [makeBin(0, 0, 1, 'SKU_DUP')]),
        makeCell(1, 0, 'shelf', [makeBin(1, 0, 1, 'SKU_DUP')]),
      ],
      2,
      1
    );
    const order: Order = {
      id: 'order-multi',
      items: [{ skuId: 'SKU_DUP' }],
      assignedWorkerId: null,
    };

    expect(() => validateOrderItemLocations(order, warehouse)).not.toThrow();
  });

  it('throws when a SKU has more than one primary bin (invariant violation)', () => {
    // The relaxed invariant: a SKU may span many bins, but at most one of
    // them may be marked `primary` (the canonical pick location).
    const dupPrimary = (x: number, y: number): StorageLocation => ({
      ...makeBin(x, y, 1, 'SKU_DUP'),
      primary: true,
    });
    const warehouse = makeWarehouse(
      [
        makeCell(0, 0, 'shelf', [dupPrimary(0, 0)]),
        makeCell(1, 0, 'shelf', [dupPrimary(1, 0)]),
      ],
      2,
      1
    );
    const order: Order = {
      id: 'order-3',
      items: [{ skuId: 'SKU_DUP' }],
      assignedWorkerId: null,
    };

    expect(() => validateOrderItemLocations(order, warehouse)).toThrowError(
      /Warehouse invariant violated: SKU "SKU_DUP" has 2 primary bins/
    );
  });
});