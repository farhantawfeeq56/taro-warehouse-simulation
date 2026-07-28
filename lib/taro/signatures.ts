import type { Warehouse, Order } from '@/lib/taro/types';

/**
 * Deterministic, cheap content signature for warehouse layout and inventory.
 * Changes only when the physical structure or bin contents change — NOT on
 * empty-cell drawing or worker-start repositioning (those don't affect
 * simulation outcomes the way the user cares about for staleness).
 *
 * The signature captures:
 *  - Grid dimensions
 *  - Shelf positions (the walkable-isle footprint)
 *  - Worker start position
 *  - Every bin's SKU, position, and z-level (order-independent via sort)
 */
export function warehouseSignature(w: Warehouse): string {
  const parts: string[] = [];

  // Grid dimensions
  parts.push(`wh:${w.width}x${w.height}`);

  // Shelf positions (sorted for order-independence)
  const shelfKeys = w.shelves.map((s) => `${s.x},${s.y}`).sort();
  parts.push(`s:${shelfKeys.join(';')}`);

  // Worker start
  if (w.workerStart) {
    parts.push(`ws:${w.workerStart.x},${w.workerStart.y}`);
  } else {
    parts.push('ws:none');
  }

  // All bins — SKU, position, z-level (sorted → deterministic)
  const binKeys: string[] = [];
  for (const row of w.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        binKeys.push(`${bin.sku}|${bin.x},${bin.y},${bin.z}`);
      }
    }
  }
  parts.push(`b:${binKeys.sort().join(';')}`);

  return parts.join('|');
}

/**
 * Deterministic, cheap content signature for the order set.
 * Order-independent (multiset of SKUs + line-count + order-count).
 */
export function ordersSignature(orders: Order[]): string {
  // Order count
  const count = orders.length;

  // Total line count
  const totalLines = orders.reduce((sum, o) => sum + o.items.length, 0);

  // SKU multiset (sorted for determinism)
  const skuCounts = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      skuCounts.set(item.skuId, (skuCounts.get(item.skuId) ?? 0) + (item.quantity ?? 1));
    }
  }
  const skuParts = [...skuCounts.entries()]
    .map(([sku, qty]) => `${sku}:${qty}`)
    .sort()
    .join(';');

  return `o:${count}|l:${totalLines}|skus:${skuParts}`;
}
