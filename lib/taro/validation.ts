import { getItemById } from './items';
import type { Order, Warehouse, OrderValidationResult, SimulationValidationContext } from './types';

/** Result of validating order lines against the warehouse catalog and location graph. */
export interface ItemsValidationResult {
  hasUnresolvableItems: boolean;
  context: SimulationValidationContext;
}

export interface ResolvedOrder {
  id: string;
  locations: string[];
}

/**
 * Validates that every order line resolves to an item on the layout with a valid storage location.
 * Aligns with simulation resolution: unknown item IDs and broken location links count as unresolvable.
 */
export function validateItems(orders: Order[], warehouse: Warehouse): ItemsValidationResult {
  const validLocationIds = new Set(warehouse.locations.map(loc => loc.id));
  const missingItemsByOrder: OrderValidationResult[] = [];
  let totalItemsCount = 0;

  for (const order of orders) {
    const unresolvableLineIds: string[] = [];

    for (const line of order.items) {
      totalItemsCount++;
      const resolvedItem = getItemById(warehouse, line.itemId);
      if (!resolvedItem || !validLocationIds.has(resolvedItem.locationId)) {
        unresolvableLineIds.push(line.itemId);
      }
    }

    if (unresolvableLineIds.length > 0) {
      missingItemsByOrder.push({ orderId: order.id, missingItemIds: unresolvableLineIds });
    }
  }

  const missingItemsCount = missingItemsByOrder.reduce((sum, row) => sum + row.missingItemIds.length, 0);

  const context: SimulationValidationContext = {
    totalItems: totalItemsCount,
    missingItems: missingItemsCount,
    affectedOrders: missingItemsByOrder.length,
    missingItemsByOrder,
  };

  return {
    hasUnresolvableItems: missingItemsCount > 0,
    context,
  };
}

/**
 * Safely resolves order locations, filtering out items that don't have valid location mappings.
 */
export function safelyResolveOrderLocations(
  orders: Order[],
  warehouse: Warehouse
): { resolvedOrders: ResolvedOrder[]; missingItemIds: Set<string>; invalidLocationItemIds: Set<string> } {
  const resolvedOrders: ResolvedOrder[] = [];
  const missingItemIds = new Set<string>();
  const invalidLocationItemIds = new Set<string>();
  const validLocationIds = new Set(warehouse.locations.map(loc => loc.id));

  for (const order of orders) {
    const locations: string[] = [];
    for (const item of order.items) {
      const resolvedItem = getItemById(warehouse, item.itemId);
      if (!resolvedItem) {
        missingItemIds.add(item.itemId);
        continue;
      }
      if (!validLocationIds.has(resolvedItem.locationId)) {
        invalidLocationItemIds.add(item.itemId);
        continue;
      }
      locations.push(resolvedItem.locationId);
    }
    resolvedOrders.push({ id: order.id, locations });
  }

  return { resolvedOrders, missingItemIds, invalidLocationItemIds };
}

/**
 * Creates a filtered list of orders containing only items that exist in the warehouse with valid locations.
 */
export function filterValidOrders(
  orders: Order[],
  warehouse: Warehouse
): Order[] {
  const validLocationIds = new Set(warehouse.locations.map(loc => loc.id));
  
  return orders.map(order => ({
    ...order,
    items: order.items.filter(item => {
      const resolvedItem = getItemById(warehouse, item.itemId);
      return resolvedItem !== undefined && validLocationIds.has(resolvedItem.locationId);
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

/**
 * Resolves order locations, returns a list of location IDs.
 * Throws an error if an item cannot be resolved.
 */
export function resolveOrderLocations(
  order: Order,
  warehouse: Warehouse
): string[] {
  const validLocationIds = new Set(warehouse.locations.map(loc => loc.id));
  
  return order.items.map((item, index) => {
    const itemId = item.itemId;
    const resolvedItem = getItemById(warehouse, itemId);
    if (!resolvedItem) {
      throw new Error(`Order "${order.id}" references unknown itemId "${itemId}" at index ${index}.`);
    }
    if (!validLocationIds.has(resolvedItem.locationId)) {
      throw new Error(`Order "${order.id}" itemId "${itemId}" resolves to invalid locationId "${resolvedItem.locationId}" at index ${index}.`);
    }
    return resolvedItem.locationId;
  });
}
