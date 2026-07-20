'use server';

import { getOrCreateProject, getProject, getWarehousesForProject, upsertWarehouse, duplicateWarehouse as repoDuplicateWarehouse, listProjects as repoListProjects, createProject as repoCreateProject, deleteProject as repoDeleteProject, updateProjectName as repoUpdateProjectName, renameWarehouse as repoRenameWarehouse, deleteWarehouse as repoDeleteWarehouse, updateWarehousePosition as repoUpdateWarehousePosition } from '@/lib/db/repository';
import type { Warehouse, Order, Item, WorkspaceWarehouse } from '@/lib/taro/types';
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
   * All warehouses for this project as a workspace model.
   * Each entry carries its id, name, position, layout data, and its own
   * generation configuration (layout + inventory gen + placement).
   */
  workspaceWarehouses: WorkspaceWarehouse[];
  orders: Order[];
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

/** Build a WorkspaceWarehouse[] from DB warehouse rows. */
function dbWarehousesToWorkspace(
  dbWarehouses: Array<{
    id: string;
    name: string;
    positionX: number | null;
    positionY: number | null;
    layoutJson: unknown;
    layoutConfig: unknown;
    inventoryJson: unknown;
  }>,
): WorkspaceWarehouse[] {
  return dbWarehouses.map((w) => {
    const configuration = mergeConfiguration(w.layoutConfig as Record<string, unknown> | null);

    // Legacy migration: warehouses saved before the nested layoutConfig format
    // have no `inventory` subsection, so mergeConfiguration defaults skuCount to
    // 2500. Override it with the actual count from inventoryJson when available.
    if (w.inventoryJson && Array.isArray(w.inventoryJson)) {
      const actualSkuCount = w.inventoryJson.length;
      if (configuration.inventory.skuCount !== actualSkuCount) {
        configuration.inventory.skuCount = actualSkuCount;
      }
    }

    return {
      id: w.id,
      name: w.name,
      position:
        w.positionX !== null && w.positionY !== null
          ? { x: w.positionX, y: w.positionY }
          : null,
      warehouse: (w.layoutJson as unknown as Warehouse) ?? null,
      configuration,
    };
  }).filter((w) => w.warehouse !== null) as WorkspaceWarehouse[];
}

export async function loadProject(projectId: string): Promise<WarehouseSnapshot> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const dbWarehouses = await getWarehousesForProject(project.id);

  if (dbWarehouses.length === 0) {
    return {
      projectId: project.id,
      workspaceWarehouses: [],
      orders: [],
    };
  }

  const firstWarehouse = dbWarehouses[0];

  return {
    projectId: project.id,
    workspaceWarehouses: dbWarehousesToWorkspace(dbWarehouses),
    orders: (firstWarehouse.ordersJson as unknown as Order[]) ?? [],
  };
}

// ── Load (default — most recent project, creates one if none exist) ─────────

export async function loadWorkspace(): Promise<WarehouseSnapshot> {
  const project = await getOrCreateProject();
  const dbWarehouses = await getWarehousesForProject(project.id);

  if (dbWarehouses.length === 0) {
    return {
      projectId: project.id,
      workspaceWarehouses: [],
      orders: [],
    };
  }

  const firstWarehouse = dbWarehouses[0];

  return {
    projectId: project.id,
    workspaceWarehouses: dbWarehousesToWorkspace(dbWarehouses),
    orders: (firstWarehouse.ordersJson as unknown as Order[]) ?? [],
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
  /**
   * When set (edit mode), updates the existing warehouse record instead of
   * creating a new one. Prevents DB record duplication on every edit.
   */
  warehouseId?: string;
}

export interface GenerateAndSaveResult {
  warehouse: Warehouse;
  warehouseId: string;
  orders: Order[];
  unplacedSkus: string[];
  placedBinCount: number;
  binCount: number;
  quantityViolations: Array<{ sku: string; expected: number; actual: number }>;
  /** The full configuration used for generation (returned so callers can store it per-warehouse). */
  configuration: WarehouseConfiguration;
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

  // 5. Persist everything — configuration, layout, inventory, and orders.
  // When a warehouseId is provided (edit mode), update that existing record.
  // Otherwise, generate a fresh id to create a new warehouse.
  const warehouseId = params.warehouseId ?? crypto.randomUUID();
  const saved = await upsertWarehouse({
    projectId,
    warehouseId,
    layoutConfig: params.configuration as unknown as Record<string, unknown>,
    layoutJson: warehouseWithInventory as unknown as Record<string, unknown>,
    inventoryJson: params.items as unknown as Record<string, unknown>,
    ordersJson: orders as unknown as Record<string, unknown>,
  });

  return {
    warehouse: warehouseWithInventory,
    warehouseId: saved.id,
    orders,
    unplacedSkus: placementResult.unplacedSkus,
    placedBinCount: placementResult.placedBinCount,
    binCount: placementResult.binCount,
    quantityViolations,
    configuration: params.configuration,
  };
}

// ── Duplicate Warehouse ────────────────────────────────────────────────────

export interface DuplicateWarehouseResult {
  warehouseId: string;
  warehouse: Warehouse;
  orders: Order[];
  name: string;
  configuration: WarehouseConfiguration;
}

export async function duplicateWarehouseAction(
  projectId: string,
  sourceWarehouseId: string,
): Promise<DuplicateWarehouseResult> {
  const duplicated = await repoDuplicateWarehouse(sourceWarehouseId, projectId);

  const warehouse = (duplicated.layoutJson as unknown as Warehouse) ?? null;
  const orders = (duplicated.ordersJson as unknown as Order[]) ?? [];
  const configuration = mergeConfiguration(duplicated.layoutConfig as Record<string, unknown> | null);

  // Legacy migration: same as dbWarehousesToWorkspace
  if (duplicated.inventoryJson && Array.isArray(duplicated.inventoryJson)) {
    const actualSkuCount = duplicated.inventoryJson.length;
    if (configuration.inventory.skuCount !== actualSkuCount) {
      configuration.inventory.skuCount = actualSkuCount;
    }
  }

  return {
    warehouseId: duplicated.id,
    warehouse,
    orders,
    name: duplicated.name,
    configuration,
  };
}

// ── Save: Orders only ──────────────────────────────────────────────────────

export async function saveOrders(
  projectId: string,
  warehouse: Warehouse,
  orderCount: number,
  avgOrderSize: number,
  warehouseId?: string,
): Promise<Order[]> {
  const orders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
  await upsertWarehouse({
    projectId,
    warehouseId,
    ordersJson: orders as unknown as Record<string, unknown>,
  });
  return orders;
}

// ── Workspace: Rename ──────────────────────────────────────────────────────

export async function renameWarehouseAction(
  warehouseId: string,
  name: string,
  projectId: string,
): Promise<void> {
  await repoRenameWarehouse(warehouseId, name, projectId);
}

// ── Workspace: Delete ──────────────────────────────────────────────────────

export async function deleteWarehouseAction(
  warehouseId: string,
  projectId: string,
): Promise<void> {
  await repoDeleteWarehouse(warehouseId, projectId);
}

// ── Workspace: Position ────────────────────────────────────────────────────

export async function saveWarehousePositionAction(
  warehouseId: string,
  projectId: string,
  x: number,
  y: number,
): Promise<void> {
  await repoUpdateWarehousePosition(warehouseId, projectId, x, y);
}

// ── Save: Warehouse layout edits (canvas drawing) ──────────────────────────

export async function saveWarehouseLayout(
  projectId: string,
  warehouse: Warehouse,
  warehouseId?: string,
): Promise<void> {
  await upsertWarehouse({
    projectId,
    warehouseId,
    layoutJson: warehouse as unknown as Record<string, unknown>,
  });
}
