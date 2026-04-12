import { getItemById } from './items';
import type { Order, Warehouse, OrderValidationResult, SimulationValidationContext } from './types';

/**
 * Validates order items against warehouse items without throwing errors.
 * Returns information about missing items that could not be found in the warehouse.
 */
export function validateOrderItems(
  orders: Order[],
  warehouse: Pick<Warehouse, 'items'>
): SimulationValidationContext {
  const missingItemsByOrder: OrderValidationResult[] = [];
  let totalItems = 0;
  let missingItems = 0;

  for (const order of orders) {
    const missingItemIds: string[] = [];

    for (const item of order.items) {
      totalItems++;
      const resolvedItem = getItemById(warehouse, item.itemId);

      if (!resolvedItem) {
        missingItems++;
        missingItemIds.push(item.itemId);
      }
    }

    if (missingItemIds.length > 0) {
      missingItemsByOrder.push({
        orderId: order.id,
        missingItemIds: [...missingItemIds],
      });
    }
  }

  return {
    totalItems,
    missingItems,
    affectedOrders: missingItemsByOrder.length,
    missingItemsByOrder,
  };
}

/**
 * Creates a filtered list of orders containing only items that exist in the warehouse.
 */
export function filterValidOrderItems(
  orders: Order[],
  warehouse: Pick<Warehouse, 'items'>
): Order[] {
  return orders.map(order => ({
    ...order,
    items: order.items.filter(item => {
      const resolvedItem = getItemById(warehouse, item.itemId);
      return resolvedItem !== undefined;
    }),
  })).filter(order => order.items.length > 0);
}

/**
 * Gets a Set of all missing item IDs from validation context.
 */
export function getMissingItemIds(validationContext: SimulationValidationContext): Set<string> {
  const missingItemIds = new Set<string>();
  for (const orderResult of validationContext.missingItemsByOrder) {
    for (const itemId of orderResult.missingItemIds) {
      missingItemIds.add(itemId);
    }
  }
  return missingItemIds;
}
