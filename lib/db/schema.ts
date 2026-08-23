import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';

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

  // Workspace node position (null = use auto-layout until first drag)
  positionX: integer('position_x'),
  positionY: integer('position_y'),

  // The complete generation configuration (layout + inventory gen + placement).
  // Persisted as one strongly-typed JSONB unit. Backward-compatible with
  // the old flat layoutConfig format via mergeConfiguration().
  layoutConfig: jsonb('layout_config').$type<WarehouseConfiguration>(),

  // Full warehouse layout (grid + cells + worker start) as JSON
  layoutJson: jsonb('layout_json').$type<Record<string, unknown>>(),

  // Full inventory (items + storageLocations) as JSON
  inventoryJson: jsonb('inventory_json').$type<Record<string, unknown>>(),

  // Full orders array as JSON
  ordersJson: jsonb('orders_json').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Multi-warehouse support: removed the 1:1 constraint to allow many warehouses per project
}));
