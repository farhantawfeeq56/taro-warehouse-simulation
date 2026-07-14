import { pgTable, text, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Untitled Project'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Default Warehouse'),

  // Layout config: the raw params from LayoutConfigOverlay
  layoutConfig: jsonb('layout_config').$type<{
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
  }>(),

  // Full warehouse layout (grid + cells + worker start) as JSON
  layoutJson: jsonb('layout_json').$type<Record<string, unknown>>(),

  // Full inventory (items + storageLocations) as JSON
  inventoryJson: jsonb('inventory_json').$type<Record<string, unknown>>(),

  // Full orders array as JSON
  ordersJson: jsonb('orders_json').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Enforce 1:1 project→warehouse for now; drop this constraint later for multi-warehouse
  uniqueProject: unique().on(table.projectId),
}));
