import { describe, expect, it } from 'vitest';
import { resolveOrderLocations, validateOrderItemLocations } from '../order-location-resolver';
import type { Warehouse } from '../types';

const warehouse: Pick<Warehouse, 'items'> = {
  items: [
    { id: 'ITEM_L1', locationId: 'L1' },
    { id: 'ITEM_L2', locationId: 'L2' },
  ],
};

describe('resolveOrderLocations', () => {
  it('resolves itemId-based entries to locationId', () => {
    const order = {
      id: 'order-1',
      items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };

    expect(resolveOrderLocations(order, warehouse)).toEqual(['L1', 'L2']);
  });

  it('throws a clear error when itemId cannot be resolved', () => {
    const order = {
      id: 'order-2',
      items: [{ itemId: 'MISSING_ITEM' }],
      assignedWorkerId: null,
    };

    expect(() => resolveOrderLocations(order, warehouse)).toThrow(
      'Order "order-2" references unknown itemId "MISSING_ITEM" at index 0.'
    );
  });
});

describe('validateOrderItemLocations', () => {
  it('accepts orders where every itemId resolves to a known warehouse location', () => {
    const order = {
      id: 'order-3',
      items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };
    const warehouseWithLocations = {
      ...warehouse,
      locations: [
        { id: 'L1', x: 1, y: 1, z: 1, type: 'shelf' as const, items: ['SKU-1'] },
        { id: 'L2', x: 2, y: 2, z: 1, type: 'shelf' as const, items: ['SKU-2'] },
      ],
    };

    expect(() => validateOrderItemLocations(order, warehouseWithLocations)).not.toThrow();
  });

  it('throws when an itemId resolves to a location that does not exist', () => {
    const order = {
      id: 'order-4',
      items: [{ itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };
    const warehouseWithMissingLocation = {
      ...warehouse,
      locations: [{ id: 'L1', x: 1, y: 1, z: 1, type: 'shelf' as const, items: ['SKU-1'] }],
    };

    expect(() => validateOrderItemLocations(order, warehouseWithMissingLocation)).toThrow(
      'Order "order-4" itemId "ITEM_L2" resolves to invalid locationId "L2" at index 0.'
    );
  });
});
