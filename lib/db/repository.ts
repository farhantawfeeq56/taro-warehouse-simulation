import { eq } from 'drizzle-orm';
import { getDb } from './index';
import { projects, warehouses } from './schema';

// ── Project ────────────────────────────────────────────────────────────────

export async function getOrCreateProject(): Promise<{
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const db = getDb();
  const existing = await db.query.projects.findFirst();
  if (existing) return existing;

  const [project] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID() })
    .returning();
  return project;
}

export async function getProject(projectId: string) {
  return getDb().query.projects.findFirst({ where: eq(projects.id, projectId) });
}

// ── Warehouse ──────────────────────────────────────────────────────────────

export async function getWarehouseForProject(projectId: string) {
  return getDb().query.warehouses.findFirst({
    where: eq(warehouses.projectId, projectId),
  });
}

export async function upsertWarehouse(params: {
  projectId: string;
  name?: string;
  layoutConfig?: Record<string, unknown>;
  layoutJson?: Record<string, unknown>;
  inventoryJson?: Record<string, unknown>;
  ordersJson?: Record<string, unknown>;
}) {
  const db = getDb();
  const existing = await db.query.warehouses.findFirst({
    where: eq(warehouses.projectId, params.projectId),
  });

  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.name !== undefined) updates.name = params.name;
    if (params.layoutConfig !== undefined) updates.layoutConfig = params.layoutConfig;
    if (params.layoutJson !== undefined) updates.layoutJson = params.layoutJson;
    if (params.inventoryJson !== undefined) updates.inventoryJson = params.inventoryJson;
    if (params.ordersJson !== undefined) updates.ordersJson = params.ordersJson;

    const [updated] = await db
      .update(warehouses)
      .set(updates)
      .where(eq(warehouses.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(warehouses)
    .values({
      id: crypto.randomUUID(),
      projectId: params.projectId,
      name: params.name ?? 'Default Warehouse',
      layoutConfig: params.layoutConfig as any,
      layoutJson: params.layoutJson as any,
      inventoryJson: params.inventoryJson as any,
      ordersJson: params.ordersJson as any,
    })
    .returning();
  return created;
}

export async function updateWarehouseField(
  warehouseId: string,
  field: 'layoutConfig' | 'layoutJson' | 'inventoryJson' | 'ordersJson' | 'name',
  value: Record<string, unknown> | string,
) {
  const [updated] = await getDb()
    .update(warehouses)
    .set({ [field]: value, updatedAt: new Date() } as any)
    .where(eq(warehouses.id, warehouseId))
    .returning();
  return updated;
}
