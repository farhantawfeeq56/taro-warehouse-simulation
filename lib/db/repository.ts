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
  const db = await getDb();
  const existing = await db.query.projects.findFirst();
  if (existing) return existing;

  const [project] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID() })
    .returning();
  return project;
}

export async function getProject(projectId: string) {
  return (await getDb()).query.projects.findFirst({ where: eq(projects.id, projectId) });
}

export async function listProjects() {
  const db = await getDb();
  return db.query.projects.findMany({
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });
}

export async function createProject(name?: string) {
  const db = await getDb();
  const [project] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), name: name ?? 'Untitled Project' })
    .returning();
  return project;
}

export async function deleteProject(id: string) {
  const db = await getDb();
  await db.delete(projects).where(eq(projects.id, id));
}

export async function updateProjectName(id: string, name: string) {
  const db = await getDb();
  const [updated] = await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  return updated;
}

// ── Warehouse ──────────────────────────────────────────────────────────────

export async function getWarehouseForProject(projectId: string) {
  return (await getDb()).query.warehouses.findFirst({
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
  const db = await getDb();
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

    // Touch the parent project so the dashboard sees the latest activity
    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, params.projectId));

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

  // Also touch the parent project for new warehouse creations
  await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, params.projectId));

  return created;
}

export async function updateWarehouseField(
  warehouseId: string,
  field: 'layoutConfig' | 'layoutJson' | 'inventoryJson' | 'ordersJson' | 'name',
  value: Record<string, unknown> | string,
) {
  const [updated] = await (await getDb())
    .update(warehouses)
    .set({ [field]: value, updatedAt: new Date() } as any)
    .where(eq(warehouses.id, warehouseId))
    .returning();
  return updated;
}
