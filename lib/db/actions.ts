'use server';

import { getOrCreateProject, getWarehouseForProject, upsertWarehouse } from '@/lib/db/repository';
import type { Warehouse, Order, Item } from '@/lib/taro/types';
import {
  generateParallelLayout,
  generateCrossAisleLayout,
  generateFishboneLayout,
} from '@/lib/taro/layout-generator';
import { applyInventoryPlacementDetailed } from '@/lib/taro/inventory-placement';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { validateSkuQuantityInvariant } from '@/lib/taro/inventory';

// ── Types for serialized warehouse data ────────────────────────────────────

export interface WarehouseSnapshot {
  projectId: string;
  warehouseId: string | null;
  warehouse: Warehouse | null;
  orders: Order[];
  layoutConfig: Record<string, unknown> | null;
}

// ── Load ───────────────────────────────────────────────────────────────────

export async function loadWorkspace(): Promise<WarehouseSnapshot> {
  const project = await getOrCreateProject();
  const dbWarehouse = await getWarehouseForProject(project.id);

  if (!dbWarehouse) {
    return {
      projectId: project.id,
      warehouseId: null,
      warehouse: null,
      orders: [],
      layoutConfig: null,
    };
  }

  return {
    projectId: project.id,
    warehouseId: dbWarehouse.id,
    warehouse: (dbWarehouse.layoutJson as unknown as Warehouse) ?? null,
    orders: (dbWarehouse.ordersJson as unknown as Order[]) ?? [],
    layoutConfig: dbWarehouse.layoutConfig as Record<string, unknown> | null,
  };
}

// ── Save: Layout + Inventory + Orders (full generation) ────────────────────

export interface GenerateAndSaveParams {
  layoutConfig: {
    type: 'parallel' | 'cross-aisle' | 'fishbone';
    gridHeight: number;
    rackCount: number;
    aisleWidth: number;
    crossAisleCount: number;
    fbWidth: number;
    fbHeight: number;
    fbTheta: number;
    fbI2: number;
    fbS: number;
    fbAp: number;
  };
  items: Item[];
  slottingBias: number;
  categoryClustering: number;
  storageFootprint: number;
  orderCount: number;
  avgOrderSize: number;
}

export interface GenerateAndSaveResult {
  warehouse: Warehouse;
  orders: Order[];
  unplacedSkus: string[];
  placedBinCount: number;
  binCount: number;
  quantityViolations: Array<{ sku: string; expected: number; actual: number }>;
}

export async function generateAndSaveWarehouse(
  projectId: string,
  params: GenerateAndSaveParams,
): Promise<GenerateAndSaveResult> {
  // 1. Generate layout (pure domain logic)
  let newWarehouse: Warehouse;
  switch (params.layoutConfig.type) {
    case 'parallel':
      newWarehouse = generateParallelLayout(params.layoutConfig.gridHeight, params.layoutConfig.rackCount, params.layoutConfig.aisleWidth);
      break;
    case 'cross-aisle':
      newWarehouse = generateCrossAisleLayout(params.layoutConfig.gridHeight, params.layoutConfig.rackCount, params.layoutConfig.aisleWidth, params.layoutConfig.crossAisleCount);
      break;
    case 'fishbone':
      newWarehouse = generateFishboneLayout(params.layoutConfig.fbWidth, params.layoutConfig.fbHeight, params.layoutConfig.fbTheta, params.layoutConfig.fbI2, params.layoutConfig.fbS, params.layoutConfig.fbAp);
      break;
    default:
      newWarehouse = generateParallelLayout(params.layoutConfig.gridHeight, params.layoutConfig.rackCount, params.layoutConfig.aisleWidth);
  }

  // 2. Place inventory (pure domain logic)
  const placementResult = applyInventoryPlacementDetailed(newWarehouse, {
    items: params.items,
    slottingBias: params.slottingBias,
    categoryClustering: params.categoryClustering,
  });
  const warehouseWithInventory = placementResult.warehouse;

  // 3. Generate orders (pure domain logic)
  const orders = generateRandomOrders(warehouseWithInventory, params.orderCount, params.avgOrderSize);

  // 4. Validate quantity invariant
  const quantityViolations = validateSkuQuantityInvariant(warehouseWithInventory, params.items);

  // 5. Persist everything
  await upsertWarehouse({
    projectId,
    layoutConfig: params.layoutConfig as unknown as Record<string, unknown>,
    layoutJson: warehouseWithInventory as unknown as Record<string, unknown>,
    inventoryJson: params.items as unknown as Record<string, unknown>,
    ordersJson: orders as unknown as Record<string, unknown>,
  });

  return {
    warehouse: warehouseWithInventory,
    orders,
    unplacedSkus: placementResult.unplacedSkus,
    placedBinCount: placementResult.placedBinCount,
    binCount: placementResult.binCount,
    quantityViolations,
  };
}

// ── Save: Orders only ──────────────────────────────────────────────────────

export async function saveOrders(
  projectId: string,
  warehouse: Warehouse,
  orderCount: number,
  avgOrderSize: number,
): Promise<Order[]> {
  const orders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
  await upsertWarehouse({
    projectId,
    ordersJson: orders as unknown as Record<string, unknown>,
  });
  return orders;
}

// ── Save: Warehouse layout edits (canvas drawing) ──────────────────────────

export async function saveWarehouseLayout(
  projectId: string,
  warehouse: Warehouse,
): Promise<void> {
  await upsertWarehouse({
    projectId,
    layoutJson: warehouse as unknown as Record<string, unknown>,
  });
}
