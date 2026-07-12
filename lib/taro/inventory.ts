// SKU/bin lookup and warehouse invariants.
//
// The post-refactor model: a SKU lives in one or more StorageLocations
// (bins) in the warehouse. When a SKU spans several bins, exactly one is
// marked `primary: true` — the canonical pick location used by order
// resolution, simulation, and UI labels. Secondary bins hold additional
// capacity but are never added to a pick list directly. The primary is
// chosen by Inventory Placement as the nearest-to-dispatch bin of the
// SKU's contiguous group.

import type { Item, StorageLocation, Warehouse } from './types';
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

/**
 * Builds a SKU → canonical (primary) bin index from the warehouse's grid.
 *
 * Uses `buildBinIndex` internally so the full grid is only scanned once;
 * subsequent lookups via `getBinForSku` with this index are O(1).
 *
 * Primary-bins are preferred; when no bin is explicitly marked primary the
 * first-encountered bin wins (identical to `getBinForSku` scan logic).
 */
export function buildSkuToBinIndex(warehouse: Pick<Warehouse, 'grid'>): Map<string, StorageLocation> {
  const binIndex = buildBinIndex(warehouse);
  const skuToPrimaryBin = new Map<string, StorageLocation>();

  for (const bin of binIndex.values()) {
    const existing = skuToPrimaryBin.get(bin.sku);
    if (!existing || bin.primary) {
      skuToPrimaryBin.set(bin.sku, bin);
    }
  }

  return skuToPrimaryBin;
}

/**
 * Returns the CANONICAL (primary) bin for a SKU.
 *
 * A SKU may span multiple storage locations (its `storageFootprint`); the
 * primary bin is the one Inventory Placement marked as the pick location.
 * If no bin is explicitly marked primary (legacy/manually-built warehouses),
 * the first-encountered bin for the SKU is returned, preserving the
 * pre-footprint behaviour.
 *
 * When `skuIndex` is provided (from `buildSkuToBinIndex`) lookups are O(1);
 * otherwise the function falls back to a full grid scan.
 */
export function getBinForSku(
  warehouse: Pick<Warehouse, 'grid'>,
  skuId: string,
  skuIndex?: Map<string, StorageLocation> | null
): StorageLocation | undefined {
  if (skuIndex) {
    return skuIndex.get(skuId);
  }

  let fallback: StorageLocation | undefined;
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (bin.sku === skuId) {
          if (bin.primary) return bin;
          if (!fallback) fallback = bin;
        }
      }
    }
  }
  return fallback;
}

/**
 * Returns EVERY bin a SKU occupies (primary first, then secondaries in
 * grid-scan order). Useful for capacity inspection or footprint-aware UI.
 */
export function getBinsForSku(
  warehouse: Pick<Warehouse, 'grid'>,
  skuId: string
): StorageLocation[] {
  const bins: StorageLocation[] = [];
  let primary: StorageLocation | undefined;
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (bin.sku === skuId) {
          if (bin.primary) primary = bin;
          else bins.push(bin);
        }
      }
    }
  }
  return primary ? [primary, ...bins] : bins;
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
 * Returns the deduplicated set of all SKU ids available in the warehouse.
 * A SKU that spans multiple bins is reported once.
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

/** Deduplicated SKU metadata collected from all bins in the warehouse. */
export interface SkuMeta {
  skuId: string;
  /**
   * Demand weight (defaults to 1 — uniform — when absent from the bin).
   * Guaranteed to be > 0 so it can always be used as a sampling weight.
   */
  demandScore: number;
  /**
   * Affinity group id. `undefined` when the SKU carries no affinity
   * information (legacy/demo/CSV/manual bins), which causes order
   * generation to skip the affinity bias for this SKU.
   */
  affinityGroup?: number;
}

/**
 * Returns deduplicated SKU metadata from all bins in the warehouse.
 *
 * The warehouse grid is scanned once; when a SKU spans multiple bins,
 * the demandScore/affinityGroup values from the first encountered bin
 * are used (placement guarantees all bins of a SKU share the same
 * metadata). Missing values default to 1 for demandScore and `undefined`
 * for affinityGroup, making the result suitable for weighted sampling
 * without extra null guards.
 */
export function collectSkuMetadata(warehouse: Pick<Warehouse, 'grid'>): SkuMeta[] {
  const seen = new Map<string, SkuMeta>();

  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (seen.has(bin.sku)) continue;
        seen.set(bin.sku, {
          skuId: bin.sku,
          demandScore: bin.demandScore ?? 1,
          affinityGroup: bin.affinityGroup,
        });
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Asserts the warehouse satisfies the storage invariants:
 *   - Every StorageLocation.id is unique.
 *   - When the `primary` field is used for a SKU, exactly one of that SKU's
 *     bins is marked primary.
 *
 * NOTE: A SKU may legitimately appear in MULTIPLE bins (its
 * `storageFootprint`). The pre-footprint "one SKU per bin" rule is no longer
 * enforced. Legacy warehouses where `primary` is absent on every bin pass
 * unchanged.
 *
 * Throws with coordinates/details so the caller can fix the data.
 */
export function assertWarehouseInvariants(warehouse: Pick<Warehouse, 'grid'>): void {
  const seenBinId = new Set<string>();
  // Map sku -> { primaryCount, anyBin } for the primary-uniqueness check.
  const bySku = new Map<string, { primaryCount: number; anyBin: StorageLocation }>();

  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        if (seenBinId.has(bin.id)) {
          throw new Error(
            `Warehouse invariant violated: duplicate StorageLocation id "${bin.id}".`
          );
        }
        seenBinId.add(bin.id);

        const prev = bySku.get(bin.sku);
        if (prev) {
          prev.primaryCount += bin.primary ? 1 : 0;
        } else {
          bySku.set(bin.sku, {
            primaryCount: bin.primary ? 1 : 0,
            anyBin: bin,
          });
        }
      }
    }
  }

  // Exactly one primary per SKU — but only when the field is used at all.
  for (const [sku, info] of bySku) {
    if (info.primaryCount > 1) {
      throw new Error(
        `Warehouse invariant violated: SKU "${sku}" has ${info.primaryCount} ` +
          `primary bins; at most one bin per SKU may be marked primary.`
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Quantity invariant validator                                               */
/* -------------------------------------------------------------------------- */

/**
 * Describes a SKU whose aggregate bin quantity does not match its declared
 * total. The caller can use this to surface inventory integrity issues.
 */
export interface QuantityInvariantViolation {
  sku: string;
  /** The total declared on the Item (or the default 50 when absent). */
  expected: number;
  /** The sum of `StorageLocation.quantity` across all bins for this SKU. */
  actual: number;
}

/**
 * Validate that every SKU in the warehouse satisfies the quantity invariant:
 *
 *     Σ bin.quantity across all StorageLocations for a SKU == Item.totalQuantity
 *
 * Items that span multiple bins (`storageFootprint > 1`) should have had
 * their total quantity split by the placement algorithm so the sum across
 * all of their bins matches the declared total. Manual edits or imported
 * warehouses may break this invariant, so this function returns violations
 * instead of throwing — the caller decides how to react.
 *
 * When `items` is not provided (e.g., warehouses built manually or via CSV
 * import), the function returns an empty array — there is no declared total
 * to check against. Only call this when you have the original `Item[]` list
 * that was used during placement.
 */
export function validateSkuQuantityInvariant(
  warehouse: Pick<Warehouse, 'grid'>,
  items?: Item[]
): QuantityInvariantViolation[] {
  if (!items || items.length === 0) return [];

  // Build the expected quantity for every known SKU.
  const expectedMap = new Map<string, number>(
    items.map((i) => [i.id, i.totalQuantity ?? 50])
  );

  // Aggregate actual quantities across all bins, keyed by SKU.
  const actualMap = new Map<string, number>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        actualMap.set(bin.sku, (actualMap.get(bin.sku) ?? 0) + bin.quantity);
      }
    }
  }

  const violations: QuantityInvariantViolation[] = [];
  for (const [sku, expected] of expectedMap) {
    const actual = actualMap.get(sku) ?? 0;
    if (actual !== expected) {
      violations.push({ sku, expected, actual });
    }
  }
  return violations;
}
