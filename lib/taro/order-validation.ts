import { assertWarehouseInvariants, getBinForSku, buildSkuToBinIndex } from './inventory';
import type { Order, Warehouse, OrderValidationResult, SimulationValidationContext, StorageLocation } from './types';

/** Result of validating order lines against the warehouse catalog. */
export interface ItemsValidationResult {
  hasUnresolvableItems: boolean;
  context: SimulationValidationContext;
}

/**
 * Validates that every order line resolves to a SKU present in the warehouse.
 * Aligns with simulation resolution: unknown SKUs count as unresolvable.
 */
export function validateItems(orders: Order[], warehouse: Warehouse, skuIndex?: Map<string, StorageLocation> | null): ItemsValidationResult {
  assertWarehouseInvariants(warehouse);

  // Build a SKU→bin index once so every item lookup is O(1) instead of
  // O(width×height×bins).  This is the hot path — called from
  // evaluateReadiness on every warehouse mutation.
  const index = skuIndex ?? buildSkuToBinIndex(warehouse);

  const missingItemsByOrder: OrderValidationResult[] = [];
  let totalItems = 0;

  for (const order of orders) {
    const unresolvableSkuIds: string[] = [];

    for (const line of order.items) {
      totalItems++;
      const bin = getBinForSku(warehouse, line.skuId, index);
      if (!bin) {
        unresolvableSkuIds.push(line.skuId);
      }
    }

    if (unresolvableSkuIds.length > 0) {
      missingItemsByOrder.push({ orderId: order.id, missingSkuIds: unresolvableSkuIds });
    }
  }

  const missingItems = missingItemsByOrder.reduce((sum, row) => sum + row.missingSkuIds.length, 0);

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
 * Validates order lines against warehouse SKUs without throwing errors.
 * Returns information about missing SKUs that could not be found in the warehouse.
 */
export function validateOrderItems(
  orders: Order[],
  warehouse: Pick<Warehouse, 'grid'>,
  skuIndex?: Map<string, StorageLocation> | null
): SimulationValidationContext {
  assertWarehouseInvariants(warehouse);

  const index = skuIndex ?? buildSkuToBinIndex(warehouse);

  const missingItemsByOrder: OrderValidationResult[] = [];
  let totalItems = 0;
  let missingItems = 0;

  for (const order of orders) {
    const missingSkuIds: string[] = [];

    for (const item of order.items) {
      totalItems++;
      const bin = getBinForSku(warehouse, item.skuId, index);
      if (!bin) {
        missingItems++;
        missingSkuIds.push(item.skuId);
      }
    }

    if (missingSkuIds.length > 0) {
      missingItemsByOrder.push({
        orderId: order.id,
        missingSkuIds: [...missingSkuIds],
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
 * Creates a filtered list of orders containing only lines whose SKU exists in the warehouse.
 */
export function filterValidOrderItems(
  orders: Order[],
  warehouse: Pick<Warehouse, 'grid'>
): Order[] {
  assertWarehouseInvariants(warehouse);

  const index = buildSkuToBinIndex(warehouse);

  return orders
    .map(order => ({
      ...order,
      items: order.items.filter(item => getBinForSku(warehouse, item.skuId, index) !== undefined),
    }))
    .filter(order => order.items.length > 0);
}

/**
 * Gets a Set of all missing SKU ids from validation context.
 */
export function getMissingSkuIds(validationContext: SimulationValidationContext): Set<string> {
  const missingSkuIds = new Set<string>();
  for (const orderResult of validationContext.missingItemsByOrder) {
    for (const skuId of orderResult.missingSkuIds) {
      missingSkuIds.add(skuId);
    }
  }
  return missingSkuIds;
}