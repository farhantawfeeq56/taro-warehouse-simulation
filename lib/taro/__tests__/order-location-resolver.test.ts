import { describe, expect, it } from 'vitest';
import { resolveOrderLocations } from '../order-location-resolver';
import type { Warehouse } from '../types';

const warehouse: Pick<Warehouse, 'items'> = {
  items: [
    { id: 'ITEM_L1', locationId: 'L1' },
    { id: 'ITEM_L2', locationId: 'L2' },
  ],
};

describe('resolveOrderLocations', () => {
  it('returns location-based orders unchanged', () => {
    const order = { id: 'order-1', items: ['L1', 'L2'], assignedWorkerId: null };

    expect(resolveOrderLocations(order, warehouse)).toEqual(['L1', 'L2']);
  });

  it('resolves itemId-based entries to locationId', () => {
    const order = {
      id: 'order-2',
      items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }],
      assignedWorkerId: null,
    };

    expect(resolveOrderLocations(order, warehouse)).toEqual(['L1', 'L2']);
  });

  it('throws a clear error when itemId cannot be resolved', () => {
    const order = {
      id: 'order-3',
      items: [{ itemId: 'MISSING_ITEM' }],
      assignedWorkerId: null,
    };

    expect(() => resolveOrderLocations(order, warehouse)).toThrow(
      'Order "order-3" references unknown itemId "MISSING_ITEM" at index 0.'
    );
  });
});
