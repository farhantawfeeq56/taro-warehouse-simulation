import { assertWarehouseInvariants, getBinForSku } from './inventory';
import type { Order, StorageLocation, Warehouse } from './types';

export interface ResolvedLine {
  skuId: string;
  bin: StorageLocation;
  quantity: number;
}

export interface ResolvedOrder {
  orderId: string;
  lines: ResolvedLine[];
  missingSkuIds: string[];
}

/**
 * Resolve every line of an order to its unique StorageLocation by SKU.
 * Missing SKUs are returned in `missingSkuIds` (the resolver never throws on
 * missing SKUs — callers decide whether to abort or run partial).
 */
export function resolveOrderToLocations(
  order: Order,
  warehouse: Pick<Warehouse, 'grid'>
): ResolvedOrder {
  assertWarehouseInvariants(warehouse);

  const lines: ResolvedLine[] = [];
  const missingSkuIds: string[] = [];

  for (const item of order.items) {
    const bin = getBinForSku(warehouse, item.skuId);
    if (!bin) {
      missingSkuIds.push(item.skuId);
      continue;
    }
    lines.push({
      skuId: item.skuId,
      bin,
      quantity: item.quantity ?? 1,
    });
  }

  return { orderId: order.id, lines, missingSkuIds };
}

/**
 * Strict variant: throws on the first missing SKU or invariant violation.
 * Used by tests and pre-flight checks.
 */
export function validateOrderItemLocations(
  order: Order,
  warehouse: Pick<Warehouse, 'grid'>
): void {
  assertWarehouseInvariants(warehouse);

  order.items.forEach((item, index) => {
    const bin = getBinForSku(warehouse, item.skuId);
    if (!bin) {
      throw new Error(
        `Order "${order.id}" references unknown skuId "${item.skuId}" at index ${index}.`
      );
    }
  });
}