'use server';

import { getOrCreateProject, getProject, getWarehouseForProject, upsertWarehouse, listProjects as repoListProjects, createProject as repoCreateProject, deleteProject as repoDeleteProject, updateProjectName as repoUpdateProjectName } from '@/lib/db/repository';
import type { Warehouse, Order, Item } from '@/lib/taro/types';
import {
  generateParallelLayout,
  generateCrossAisleLayout,
  generateFishboneLayout,
} from '@/lib/taro/layout-generator';
import { applyInventoryPlacementDetailed } from '@/lib/taro/inventory-placement';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { validateSkuQuantityInvariant } from '@/lib/taro/inventory';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { mergeConfiguration } from '@/lib/taro/warehouse-configuration';

// ── Types for serialized warehouse data ────────────────────────────────────

export interface WarehouseSnapshot {
  projectId: string;
  warehouseId: string | null;
  warehouse: Warehouse | null;
  orders: Order[];
  /** Normalised generation configuration (always set — merged with defaults). */
  configuration: WarehouseConfiguration;
}

// ── Project CRUD ────────────────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  /** Whether a warehouse has been configured for this project. */
  hasWarehouse: boolean;
  /** Total number of storage locations across all shelves. */
  itemCount: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await repoListProjects();

  const summaries: ProjectSummary[] = [];
  for (const project of projects) {
    const warehouse = await getWarehouseForProject(project.id);
    const layout = warehouse?.layoutJson as Record<string, unknown> | null;

    let itemCount = 0;
    if (layout?.grid && Array.isArray(layout.grid)) {
      for (const row of layout.grid as Array<Array<Record<string, unknown>>>) {
        for (const cell of row) {
          if (Array.isArray(cell.locations)) {
            itemCount += cell.locations.length;
          }
        }
      }
    }

    summaries.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      hasWarehouse: !!warehouse,
      itemCount,
    });
  }

  return summaries;
}

export async function createProjectAction(name?: string) {
  return repoCreateProject(name);
}

export async function deleteProjectAction(id: string) {
  return repoDeleteProject(id);
}

export async function updateProjectNameAction(id: string, name: string) {
  return repoUpdateProjectName(id, name);
}

export async function loadProject(projectId: string): Promise<WarehouseSnapshot> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const dbWarehouse = await getWarehouseForProject(project.id);

  if (!dbWarehouse) {
    return {
      projectId: project.id,
      warehouseId: null,
      warehouse: null,
      orders: [],
      configuration: mergeConfiguration(null),
    };
  }

  return {
    projectId: project.id,
    warehouseId: dbWarehouse.id,
    warehouse: (dbWarehouse.layoutJson as unknown as Warehouse) ?? null,
    orders: (dbWarehouse.ordersJson as unknown as Order[]) ?? [],
    configuration: mergeConfiguration(dbWarehouse.layoutConfig as Record<string, unknown> | null),
  };
}

// ── Load (default — most recent project, creates one if none exist) ─────────

export async function loadWorkspace(): Promise<WarehouseSnapshot> {
  const project = await getOrCreateProject();
  const dbWarehouse = await getWarehouseForProject(project.id);

  if (!dbWarehouse) {
    return {
      projectId: project.id,
      warehouseId: null,
      warehouse: null,
      orders: [],
      configuration: mergeConfiguration(null),
    };
  }

  return {
    projectId: project.id,
    warehouseId: dbWarehouse.id,
    warehouse: (dbWarehouse.layoutJson as unknown as Warehouse) ?? null,
    orders: (dbWarehouse.ordersJson as unknown as Order[]) ?? [],
    configuration: mergeConfiguration(dbWarehouse.layoutConfig as Record<string, unknown> | null),
  };
}

// ── Save: Layout + Inventory + Orders (full generation) ────────────────────

export interface GenerateAndSaveParams {
  /** The complete WarehouseConfiguration to persist and use for generation. */
  configuration: WarehouseConfiguration;
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
  // 1. Generate layout (pure domain logic) from configuration
  const cfg = params.configuration;
  let newWarehouse: Warehouse;
  switch (cfg.layout.type) {
    case 'parallel':
      newWarehouse = generateParallelLayout(cfg.layout.gridHeight, cfg.layout.rackCount, cfg.layout.aisleWidth);
      break;
    case 'cross-aisle':
      newWarehouse = generateCrossAisleLayout(cfg.layout.gridHeight, cfg.layout.rackCount, cfg.layout.aisleWidth, cfg.layout.crossAisleCount);
      break;
    case 'fishbone':
      newWarehouse = generateFishboneLayout(cfg.layout.fbWidth, cfg.layout.fbHeight, cfg.layout.fbTheta, cfg.layout.fbI2, cfg.layout.fbS, cfg.layout.fbAp);
      break;
    default:
      newWarehouse = generateParallelLayout(cfg.layout.gridHeight, cfg.layout.rackCount, cfg.layout.aisleWidth);
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

  // 5. Persist everything — configuration, layout, inventory, and orders
  await upsertWarehouse({
    projectId,
    layoutConfig: params.configuration as unknown as Record<string, unknown>,
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
