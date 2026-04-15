import { describe, expect, it } from 'vitest';
import { resolveOrderLocations, validateItems, filterValidOrders, getMissingItemIds } from '../validation';
import type { Warehouse, Order } from '../types';

const mockWarehouseItems = [
  { id: 'ITEM_L1', locationId: 'L1' },
  { id: 'ITEM_L2', locationId: 'L2' },
];

const mockWarehouseLocations = [
  { id: 'L1', x: 1, y: 1, z: 1, type: 'shelf' as const, items: ['SKU-1'] },
  { id: 'L2', x: 2, y: 2, z: 1, type: 'shelf' as const, items: ['SKU-2'] },
];

const warehouse: Warehouse = {
  width: 10,
  height: 10,
  grid: [],
  shelves: [],
  workerStart: null,
  locations: mockWarehouseLocations,
  items: mockWarehouseItems,
};

describe('resolveOrderLocations', () => {
  it('resolves itemId-based entries to locationId', () => {
    const order: Order = {
      id: 'order-1',
      items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };

    expect(resolveOrderLocations(order, warehouse)).toEqual(['L1', 'L2']);
  });

  it('throws a clear error when itemId cannot be resolved', () => {
    const order: Order = {
      id: 'order-2',
      items: [{ itemId: 'MISSING_ITEM' }],
      assignedWorkerId: null,
    };

    expect(() => resolveOrderLocations(order, warehouse)).toThrow(
      'Order "order-2" references unknown itemId "MISSING_ITEM" at index 0.'
    );
  });

  it('throws when an itemId resolves to a location that does not exist', () => {
    const order: Order = {
      id: 'order-4',
      items: [{ itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };
    const warehouseWithMissingLocation = {
      ...warehouse,
      locations: [{ id: 'L1', x: 1, y: 1, z: 1, type: 'shelf' as const, items: ['SKU-1'] }],
    };

    expect(() => resolveOrderLocations(order, warehouseWithMissingLocation)).toThrow(
      'Order "order-4" itemId "ITEM_L2" resolves to invalid locationId "L2" at index 0.'
    );
  });
});

describe('validateItems', () => {
  it('identifies unresolvable items', () => {
    const orders: Order[] = [
      {
        id: 'order-1',
        items: [{ itemId: 'ITEM_L1' }, { itemId: 'MISSING_ITEM' }],
        assignedWorkerId: null,
      }
    ];

    const result = validateItems(orders, warehouse);
    expect(result.hasUnresolvableItems).toBe(true);
    expect(result.context.missingItems).toBe(1);
    expect(result.context.missingItemsByOrder[0].missingItemIds).toEqual(['MISSING_ITEM']);
  });
});

describe('filterValidOrders', () => {
  it('removes invalid items and empty orders', () => {
    const orders: Order[] = [
      {
        id: 'order-1',
        items: [{ itemId: 'ITEM_L1' }, { itemId: 'MISSING_ITEM' }],
        assignedWorkerId: null,
      },
      {
        id: 'order-2',
        items: [{ itemId: 'MISSING_ITEM' }],
        assignedWorkerId: null,
      }
    ];

    const filtered = filterValidOrders(orders, warehouse);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('order-1');
    expect(filtered[0].items).toHaveLength(1);
    expect(filtered[0].items[0].itemId).toBe('ITEM_L1');
  });
});
