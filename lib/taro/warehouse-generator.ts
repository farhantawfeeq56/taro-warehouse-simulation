/**
 * Session-only warehouse generation.
 *
 * Mirrors the server-side pipeline in `lib/db/actions.ts#generateAndSaveWarehouse`
 * (layout → inventory placement → random orders) but runs entirely in the
 * browser so a warehouse can be created without any database round-trip.
 * Nothing produced here is persisted.
 */
import type { Warehouse, Order, Item } from './types';
import { generateCrossAisleLayout } from './layout-generator';
import { applyInventoryPlacementDetailed } from './inventory-placement';
import { generateRandomOrders } from './demo-generator';
import { validateSkuQuantityInvariant } from './inventory';
import type { WarehouseConfiguration } from './warehouse-configuration';
import { assignProductCategory } from './categories';
import { generateDemandScores } from './demand';
import { generateAffinityGroups } from './affinity';
import { generateFootprints } from './footprint';

export interface GeneratedWarehouseResult {
  warehouse: Warehouse;
  orders: Order[];
  unplacedSkus: string[];
  placedBinCount: number;
  binCount: number;
  quantityViolations: Array<{ sku: string; expected: number; actual: number }>;
}

/**
 * When the slider requests more SKUs than the layout has bins for, we
 * scale the catalogue down so the whole inventory can actually be placed
 * (no overflow, no missing SKUs, no dead orders).
 *
 * The slider becomes an UPPER LIMIT rather than a hard count: the real
 * count is `min(sliderCount, ~90% of bin capacity)`. The 0.9 headroom keeps
 * multi-bin footprints (storage footprint > 1) from overflowing the
 * capacity even when several bulky SKUs land side by side.
 */
export function balanceSkuCount(
  requestedCount: number,
  binCount: number,
): number {
  const requested = Math.max(0, Math.floor(requestedCount));
  if (requested <= 0 || binCount <= 0) return requested;
  const capacityLimit = Math.max(1, Math.floor(binCount * 0.9));
  return Math.min(requested, capacityLimit);
}

/**
 * Generate a complete warehouse session: layout, inventory, placement, orders.
 * Pure client-side equivalent of `generateAndSaveWarehouse` (minus persistence).
 */
export function generateWarehouseSession(
  configuration: WarehouseConfiguration,
  orderCount: number,
  avgOrderSize: number,
): GeneratedWarehouseResult {
  const cfg = configuration;

  // 1. Layout (pure domain logic).
  const newWarehouse = generateCrossAisleLayout(
    cfg.layout.gridHeight,
    cfg.layout.rackCount,
    cfg.layout.aisleWidth,
    cfg.layout.crossAisleCount,
  );

  // 1b. Balance the catalogue against the layout's bin capacity so the
  //     warehouse always fills out fully (no overflow wedge, no unplaced
  //     SKUs, no dead orders). The slider is the upper limit, not the count.
  const binCapacity = estimateBinCapacity(newWarehouse);
  const balancedSkuCount = balanceSkuCount(cfg.inventory.skuCount, binCapacity);

  // 2. Inventory items - built with the same pipeline the setup overlay uses
  //    (demand scores → affinity groups → product categories → footprints),
  //    so `configuration` alone fully determines the catalogue.
  const items = buildInventory({ ...cfg, inventory: { ...cfg.inventory, skuCount: balancedSkuCount } });

  // 3. Place inventory (pure domain logic).
  const placementResult = applyInventoryPlacementDetailed(newWarehouse, {
    items,
    slottingBias: cfg.placement.slottingBias,
    categoryClustering: cfg.placement.categoryClustering,
  });
  const warehouseWithInventory = placementResult.warehouse;

  // 4. Generate orders (pure domain logic).
  const orders = generateRandomOrders(warehouseWithInventory, orderCount, avgOrderSize);

  // 5. Validate quantity invariant.
  const quantityViolations = validateSkuQuantityInvariant(warehouseWithInventory, items);

  return {
    warehouse: warehouseWithInventory,
    orders,
    unplacedSkus: placementResult.unplacedSkus,
    placedBinCount: placementResult.placedBinCount,
    binCount: placementResult.binCount,
    quantityViolations,
  };
}

/**
 * Estimate how many storage bins a warehouse layout provides. Bins live on
 * shelf cells; the generator cycles 1..3 z-levels per shelf (capacity, not
 * inventory), so the expected capacity is `shelves * 2`. The exact count is
 * computed by placement's `enumerateBins` - this is only a cheap upper-bound
 * estimate used to balance the catalogue before placement runs.
 */
export function estimateBinCapacity(warehouse: Warehouse): number {
  return warehouse.shelves.length * 2;
}

/**
 * Build the full Item catalogue for a configuration - the same enrichment
 * chain the layout-config overlay applies to its slider-driven inventory.
 */
export function buildInventory(cfg: WarehouseConfiguration): Item[] {
  const count = cfg.inventory.skuCount;
  const baseItems: Item[] = Array.from({ length: count }, (_, i) => ({
    id: `SKU_${String(i + 1).padStart(3, '0')}`,
    totalQuantity: 50, // overwritten below from demand scores
  }));

  // Demand scores + totalQuantity (mirrors the overlay's assignDemandDistribution).
  const scores = generateDemandScores({
    count,
    distribution: cfg.inventory.demandDistribution,
  });
  const minQty = 10;
  const maxQty = 250;
  const withDemand: Item[] = baseItems.map((item, i) => {
    const demandScore = scores[i];
    const totalQuantity =
      minQty + Math.round((demandScore / 10) * (maxQty - minQty));
    return { ...item, demandScore, totalQuantity };
  });

  // Affinity groups.
  const groups = generateAffinityGroups({
    count,
    affinity: cfg.inventory.productAffinity,
  });
  const withAffinity: Item[] = withDemand.map((item, i) => ({
    ...item,
    affinityGroup: groups[i],
  }));

  // Product categories.
  const withCategory = assignProductCategory(withAffinity);

  // Storage footprints.
  const footprints = generateFootprints({
    count,
    footprint: cfg.inventory.storageFootprint,
  });
  return withCategory.map((item, i) => ({
    ...item,
    storageFootprint: footprints[i],
  }));
}
