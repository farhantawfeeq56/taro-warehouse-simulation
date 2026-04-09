import type { Item, Warehouse, WarehouseLocation } from './types';

export function generateDefaultItemsFromLocations(locations: WarehouseLocation[]): Item[] {
  const items = locations.map(location => ({
    id: `ITEM_${location.id}`,
    locationId: location.id,
  }));

  console.log('[Taro] Generated default items:', items);
  return items;
}

export function getItems(warehouse: Pick<Warehouse, 'items'>): Item[] {
  return warehouse.items;
}

export function getItemById(warehouse: Pick<Warehouse, 'items'>, itemId: string): Item | undefined {
  return warehouse.items.find(item => item.id === itemId);
}

export function getItemByLocation(warehouse: Pick<Warehouse, 'items'>, locationId: string): Item | undefined {
  return warehouse.items.find(item => item.locationId === locationId);
}

export function getItemsByLocation(warehouse: Pick<Warehouse, 'items'>, locationId: string): Item[] {
  return warehouse.items.filter(item => item.locationId === locationId);
}
