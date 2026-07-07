// SKU/bin lookup and warehouse invariants.
//
// The post-refactor model: every SKU lives in exactly one StorageLocation (bin)
// in the warehouse. The resolver walks `grid[*][*].locations` to find it.

import type { StorageLocation, Warehouse } from './types';
import { getShelfLocationId } from './layout';

export interface ResolvedBin {
  bin: StorageLocation;
  shelfId: string;
}

export function buildBinIndex(warehouse: Pick<Warehouse, 'grid'>): Map<string, StorageLocation> {
  const binsById = new Map<string, StorageLocation>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        binsById.set(bin.id, bin);
      }
    }
  }
  return binsById;
}

export function getBinForSku(
  warehouse: Pick<Warehouse, 'grid'>,
  skuId: string
): StorageLocation | undefined {
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (bin.sku === skuId) return bin;
      }
    }
  }
  return undefined;
}

export function getShelfIdForSku(
  warehouse: Pick<Warehouse, 'grid'>,
  skuId: string
): string | undefined {
  const bin = getBinForSku(warehouse, skuId);
  if (!bin) return undefined;
  return getShelfLocationId(bin.x, bin.y);
}

/**
 * Returns the deduplicated set of all SKU ids available in the warehouse,
 * one per StorageLocation (which is itself unique by SKU).
 */
export function collectSkuIds(warehouse: Pick<Warehouse, 'grid'>): string[] {
  const seen = new Set<string>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        seen.add(bin.sku);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Asserts the warehouse satisfies the post-refactor invariants:
 *   - Every SKU appears in at most one StorageLocation.
 *   - Every StorageLocation.id is unique.
 *
 * Throws with both coordinates of any duplicate so the caller can fix the data.
 */
export function assertWarehouseInvariants(warehouse: Pick<Warehouse, 'grid'>): void {
  const seenSku = new Map<string, StorageLocation>();
  const seenBinId = new Set<string>();

  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (seenBinId.has(bin.id)) {
          throw new Error(
            `Warehouse invariant violated: duplicate StorageLocation id "${bin.id}".`
          );
        }
        seenBinId.add(bin.id);

        const previous = seenSku.get(bin.sku);
        if (previous) {
          throw new Error(
            `Warehouse invariant violated: SKU "${bin.sku}" appears in multiple bins ` +
              `(${previous.x},${previous.y},${previous.z}) and (${bin.x},${bin.y},${bin.z}). ` +
              `Each SKU must live in exactly one storage location.`
          );
        }
        seenSku.set(bin.sku, bin);
      }
    }
  }
}