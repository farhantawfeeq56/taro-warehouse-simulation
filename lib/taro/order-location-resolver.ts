import { getItemById } from './items';
import type { Order, Warehouse } from './types';

type CompatOrderItem = string | { locationId?: string; itemId?: string };

interface CompatOrder {
  id: string;
  items: CompatOrderItem[];
}

export function resolveOrderLocations(
  order: Order | CompatOrder,
  warehouse: Pick<Warehouse, 'items'>
): string[] {
  return order.items.map((item, index) => {
    if (typeof item === 'string') {
      return item;
    }

    if (item.locationId) {
      return item.locationId;
    }

    if (item.itemId) {
      const resolvedItem = getItemById(warehouse, item.itemId);
      if (!resolvedItem) {
        throw new Error(`Order \"${order.id}\" references unknown itemId \"${item.itemId}\" at index ${index}.`);
      }
      return resolvedItem.locationId;
    }

    throw new Error(`Order \"${order.id}\" has an invalid item at index ${index}; expected locationId or itemId.`);
  });
}
