import { getItemById } from './items';
import type { Order, OrderItem, Warehouse } from './types';

export type CompatOrderItem = string | { locationId?: string; itemId?: string };

export interface CompatOrder {
  id: string;
  items: CompatOrderItem[];
  assignedWorkerId?: number | null;
}

function toItemId(item: CompatOrderItem): string {
  if (typeof item === 'string') {
    return `ITEM_${item}`;
  }

  if (item.itemId) {
    return item.itemId;
  }

  if (item.locationId) {
    return `ITEM_${item.locationId}`;
  }

  throw new Error('Invalid order item; expected string, locationId, or itemId.');
}

export function migrateOrderToItemIds(order: Order | CompatOrder): Order {
  const migratedItems: OrderItem[] = order.items.map(item => ({ itemId: toItemId(item) }));
  return {
    id: order.id,
    items: migratedItems,
    assignedWorkerId: order.assignedWorkerId ?? null,
  };
}

export function resolveOrderLocations(
  order: Order | CompatOrder,
  warehouse: Pick<Warehouse, 'items'>
): string[] {
  return order.items.map((rawItem, index) => {
    const itemId = toItemId(rawItem);
    const resolvedItem = getItemById(warehouse, itemId);
    if (!resolvedItem) {
      throw new Error(`Order \"${order.id}\" references unknown itemId \"${itemId}\" at index ${index}.`);
    }
    return resolvedItem.locationId;
  });
}
