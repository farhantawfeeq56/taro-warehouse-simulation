import { getItemById } from './items';
import type { Order, Warehouse, OrderValidationResult, SimulationValidationContext } from './types';

/** Result of validating order lines against the warehouse catalog and location graph. */
export interface ItemsValidationResult {
  hasUnresolvableItems: boolean;
  context: SimulationValidationContext;
}

/**
 * Validates that every order line resolves to an item on the layout with a valid storage location.
 * Aligns with simulation resolution: unknown item IDs and broken location links count as unresolvable.
 */
export function validateItems(orders: Order[], warehouse: Warehouse): ItemsValidationResult {
  const validLocationIds = new Set(warehouse.locations.map(loc => loc.id));
  const missingItemsByOrder: OrderValidationResult[] = [];
  let totalItems = 0;

  for (const order of orders) {
    const unresolvableLineIds: string[] = [];

    for (const line of order.items) {
      totalItems++;
      const resolvedItem = getItemById(warehouse, line.itemId);
      if (!resolvedItem) {
        unresolvableLineIds.push(line.itemId);
        continue;
      }
      if (!validLocationIds.has(resolvedItem.locationId)) {
        unresolvableLineIds.push(line.itemId);
      }
    }

    if (unresolvableLineIds.length > 0) {
      missingItemsByOrder.push({ orderId: order.id, missingItemIds: unresolvableLineIds });
    }
  }

  const missingItems = missingItemsByOrder.reduce((sum, row) => sum + row.missingItemIds.length, 0);

  const context: SimulationValidationContext = {
    totalItems,
    missingItems,
    affectedOrders: missingItemsByOrder.length,
    missingItemsByOrder,
  };

  return {
    hasUnresolvableItems: missingItems > 0,
    context,
  };
}

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
