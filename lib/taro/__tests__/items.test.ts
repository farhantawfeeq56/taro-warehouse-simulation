import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateDefaultItemsFromLocations, getItemById, getItemByLocation, getItems } from '../items';
import type { Warehouse, WarehouseLocation } from '../types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('items', () => {
  it('generates one default item per location', () => {
    const locations: WarehouseLocation[] = [
      { id: 'shelf-7-4', x: 7, y: 4, z: 1, type: 'shelf', items: ['SKU_001'] },
      { id: 'shelf-8-4', x: 8, y: 4, z: 1, type: 'shelf', items: ['SKU_002'] },
    ];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const items = generateDefaultItemsFromLocations(locations);

    expect(items).toEqual([
      { id: 'ITEM_shelf-7-4', locationId: 'shelf-7-4' },
      { id: 'ITEM_shelf-8-4', locationId: 'shelf-8-4' },
    ]);
    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('provides item lookup helpers', () => {
    const warehouse = {
      items: [
        { id: 'ITEM_shelf-1-1', locationId: 'shelf-1-1' },
        { id: 'ITEM_shelf-2-1', locationId: 'shelf-2-1' },
      ],
    } as Pick<Warehouse, 'items'>;

    expect(getItems(warehouse)).toHaveLength(2);
    expect(getItemById(warehouse, 'ITEM_shelf-1-1')).toEqual({ id: 'ITEM_shelf-1-1', locationId: 'shelf-1-1' });
    expect(getItemByLocation(warehouse, 'shelf-2-1')).toEqual({ id: 'ITEM_shelf-2-1', locationId: 'shelf-2-1' });
    expect(getItemById(warehouse, 'MISSING')).toBeUndefined();
    expect(getItemByLocation(warehouse, 'MISSING')).toBeUndefined();
  });
});
