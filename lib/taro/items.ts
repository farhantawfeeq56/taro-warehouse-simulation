import type { Item, Warehouse } from './types';

export function getItems(warehouse: Pick<Warehouse, 'items'>): Item[] {
  return warehouse.items;
}

export function getItemById(warehouse: Pick<Warehouse, 'items'>, itemId: string): Item | undefined {
  return warehouse.items.find(item => item.id === itemId);
}

export function getItemsByLocation(warehouse: Pick<Warehouse, 'items'>, locationId: string): Item[] {
  return warehouse.items.filter(item => item.locationId === locationId);
}
