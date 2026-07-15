'use server';

import { getOrCreateProject, getProject, getWarehousesForProject, upsertWarehouse, listProjects as repoListProjects, createProject as repoCreateProject, deleteProject as repoDeleteProject, updateProjectName as repoUpdateProjectName } from '@/lib/db/repository';
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
  /**
   * All warehouse IDs for this project, ordered by most recently updated.
   *
   * NOTE: Currently only `warehouses[0]` (the most recently updated warehouse)
   * is displayed. This is temporary compatibility behaviour — once proper
   * warehouse selection (multi-warehouse UI) is implemented, replace all
   * `warehouses[0]` references with the user-chosen warehouse.
   */
  warehouseIds: string[];
  /**
   * All warehouses for this project, ordered by most recently updated.
   *
   * NOTE: Currently only `warehouses[0]` is used. This is a temporary
   * compatibility shim; replace with explicit warehouse selection later.
   */
  warehouses: Warehouse[];
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
    const warehouses = await getWarehousesForProject(project.id);
    const hasWarehouse = warehouses.length > 0;

    let itemCount = 0;
    for (const wh of warehouses) {
      const layout = wh.layoutJson as Record<string, unknown> | null;
      if (layout?.grid && Array.isArray(layout.grid)) {
        for (const row of layout.grid as Array<Array<Record<string, unknown>>>) {
          for (const cell of row) {
            if (Array.isArray(cell.locations)) {
              itemCount += cell.locations.length;
            }
          }
        }
      }
    }

    // Use the latest timestamp available — prefer the most recent warehouse.updatedAt if it's
    // more recent than the project's own timestamp.
    const latestWarehouse = warehouses[0];
    const updatedAt =
      latestWarehouse && latestWarehouse.updatedAt > project.updatedAt
        ? latestWarehouse.updatedAt
        : project.updatedAt;

    summaries.push({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt,
      hasWarehouse,
      itemCount,
    });
  }

  // Re-sort by the effective updatedAt so the dashboard shows the most
  // recently worked-on project first.
  summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

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

  const dbWarehouses = await getWarehousesForProject(project.id);

  if (dbWarehouses.length === 0) {
    return {
      projectId: project.id,
      warehouseIds: [],
      warehouses: [],
      orders: [],
      configuration: mergeConfiguration(null),
    };
  }

  const firstWarehouse = dbWarehouses[0];
  const configuration = mergeConfiguration(firstWarehouse.layoutConfig as Record<string, unknown> | null);

  // Legacy migration: warehouses saved before the nested layoutConfig format
  // have no `inventory` subsection, so mergeConfiguration defaults skuCount to
  // 2500. Override it with the actual count from inventoryJson when available.
  if (firstWarehouse.inventoryJson && Array.isArray(firstWarehouse.inventoryJson)) {
    const actualSkuCount = firstWarehouse.inventoryJson.length;
    if (configuration.inventory.skuCount !== actualSkuCount) {
      configuration.inventory.skuCount = actualSkuCount;
    }
  }

  return {
    projectId: project.id,
    warehouseIds: dbWarehouses.map((w) => w.id),
    warehouses: dbWarehouses.map((w) => (w.layoutJson as unknown as Warehouse) ?? null).filter(Boolean) as Warehouse[],
    orders: (firstWarehouse.ordersJson as unknown as Order[]) ?? [],
    configuration,
  };
}

// ── Load (default — most recent project, creates one if none exist) ─────────

export async function loadWorkspace(): Promise<WarehouseSnapshot> {
  const project = await getOrCreateProject();
  const dbWarehouses = await getWarehousesForProject(project.id);

  if (dbWarehouses.length === 0) {
    return {
      projectId: project.id,
      warehouseIds: [],
      warehouses: [],
      orders: [],
      configuration: mergeConfiguration(null),
    };
  }

  const firstWarehouse = dbWarehouses[0];
  const configuration = mergeConfiguration(firstWarehouse.layoutConfig as Record<string, unknown> | null);

  // Same legacy migration as loadProject
  if (firstWarehouse.inventoryJson && Array.isArray(firstWarehouse.inventoryJson)) {
    const actualSkuCount = firstWarehouse.inventoryJson.length;
    if (configuration.inventory.skuCount !== actualSkuCount) {
      configuration.inventory.skuCount = actualSkuCount;
    }
  }

  return {
    projectId: project.id,
    warehouseIds: dbWarehouses.map((w) => w.id),
    warehouses: dbWarehouses.map((w) => (w.layoutJson as unknown as Warehouse) ?? null).filter(Boolean) as Warehouse[],
    orders: (firstWarehouse.ordersJson as unknown as Order[]) ?? [],
    configuration,
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
