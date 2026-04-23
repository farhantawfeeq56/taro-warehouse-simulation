import { getItemById } from './items';
import type { Order, Warehouse } from './types';

export function resolveOrderLocations(
  order: Order,
  warehouse: Pick<Warehouse, 'items'>
): string[] {
  return order.items.map((item, index) => {
    const itemId = item.itemId;
    const resolvedItem = getItemById(warehouse, itemId);
    if (!resolvedItem) {
      throw new Error(`Order \"${order.id}\" references unknown itemId \"${itemId}\" at index ${index}.`);
    }
    return resolvedItem.locationId;
  });
}

export function validateOrderItemLocations(
  order: Order,
  warehouse: Pick<Warehouse, 'items' | 'locations'>
): void {
  const validLocationIds = new Set(warehouse.locations.map(location => location.id));

  order.items.forEach((item, index) => {
    const itemId = item.itemId;
    const resolvedItem = getItemById(warehouse, itemId);
    if (!resolvedItem) {
      throw new Error(`Order \"${order.id}\" references unknown itemId \"${itemId}\" at index ${index}.`);
    }
    if (!validLocationIds.has(resolvedItem.locationId)) {
      throw new Error(
        `Order \"${order.id}\" itemId \"${itemId}\" resolves to invalid locationId \"${resolvedItem.locationId}\" at index ${index}.`
      );
    }
  });
}
