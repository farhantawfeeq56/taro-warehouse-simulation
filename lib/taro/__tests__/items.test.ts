import { describe, expect, it } from 'vitest';
import { getItemById, getItems, getItemsByLocation } from '../items';
import type { Warehouse } from '../types';

describe('items', () => {
  it('provides item lookup helpers', () => {
    const warehouse = {
      items: [
        { id: 'ITEM_shelf-1-1', locationId: 'shelf-1-1' },
        { id: 'ITEM_shelf-2-1', locationId: 'shelf-2-1' },
      ],
    } as Pick<Warehouse, 'items'>;

    expect(getItems(warehouse)).toHaveLength(2);
    expect(getItemById(warehouse, 'ITEM_shelf-1-1')).toEqual({ id: 'ITEM_shelf-1-1', locationId: 'shelf-1-1' });
    expect(getItemsByLocation(warehouse, 'shelf-2-1')).toEqual([{ id: 'ITEM_shelf-2-1', locationId: 'shelf-2-1' }]);
    expect(getItemsByLocation(warehouse, 'MISSING')).toEqual([]);
    expect(getItemById(warehouse, 'MISSING')).toBeUndefined();
  });
});
