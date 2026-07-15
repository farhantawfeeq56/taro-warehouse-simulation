/**
 * WarehouseConfiguration — the complete set of INPUT parameters that describe
 * how a warehouse was generated.
 *
 * Separation of concerns:
 *   Configuration = INPUTS (what the user chose in Layout Config)
 *   Layout        = OUTPUT (the generated grid + cells + worker start)
 *   Inventory     = OUTPUT (the generated items + storage locations)
 *   Orders        = OUTPUT (the generated order lines)
 *
 * This object is persisted as a single JSONB column and used to restore the
 * Layout Config overlay when editing an existing warehouse.
 *
 * Values that can be derived from generated data are intentionally omitted.
 * For example, `skuCount` is derived from `inventoryJson.length` on load.
 */

export type LayoutType = 'parallel' | 'cross-aisle' | 'fishbone';

export interface LayoutConfiguration {
  type: LayoutType;
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
}

export interface InventoryGenerationConfiguration {
  skuCount: number;
  demandDistribution: number;
  productAffinity: number;
  storageFootprint: number;
}

export interface PlacementConfiguration {
  slottingBias: number;
  categoryClustering: number;
}

export interface WarehouseConfiguration {
  layout: LayoutConfiguration;
  inventory: InventoryGenerationConfiguration;
  placement: PlacementConfiguration;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT_CONFIGURATION: LayoutConfiguration = {
  type: 'parallel',
  gridHeight: 30,
  rackCount: 30,
  aisleWidth: 2,
  crossAisleCount: 1,
  fbWidth: 30,
  fbHeight: 20,
  fbTheta: 45,
  fbI2: 1,
  fbS: 4,
  fbAp: 0.8,
};

export const DEFAULT_INVENTORY_GENERATION_CONFIGURATION: InventoryGenerationConfiguration = {
  skuCount: 2500,
  demandDistribution: 0,
  productAffinity: 0,
  storageFootprint: 0,
};

export const DEFAULT_PLACEMENT_CONFIGURATION: PlacementConfiguration = {
  slottingBias: 0,
  categoryClustering: 0,
};

export const DEFAULT_WAREHOUSE_CONFIGURATION: WarehouseConfiguration = {
  layout: { ...DEFAULT_LAYOUT_CONFIGURATION },
  inventory: { ...DEFAULT_INVENTORY_GENERATION_CONFIGURATION },
  placement: { ...DEFAULT_PLACEMENT_CONFIGURATION },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Deeply merges a partial (or legacy-format) configuration on top of defaults.
 *
 * - New-style nested configs are deep-merged per subsection.
 * - Old-style flat configs (pre-editor-workflow) are detected by the presence
 *   of `type` at the top level and migrated into the nested structure.
 *
 * Any missing fields receive the default value, so callers never need to
 * manually map or guard against undefined.
 */
export function mergeConfiguration(
  saved: Partial<WarehouseConfiguration> | Record<string, unknown> | null | undefined,
): WarehouseConfiguration {
  if (!saved) return { ...DEFAULT_WAREHOUSE_CONFIGURATION };

  // Detect old flat format: has `type` at top level but not `layout`
  if ('type' in saved && !('layout' in saved)) {
    return mergeLegacyFlatConfig(saved as Record<string, unknown>);
  }

  // New-style nested config — deep merge each subsection
  const cfg = saved as Partial<WarehouseConfiguration>;
  return {
    layout: { ...DEFAULT_LAYOUT_CONFIGURATION, ...cfg.layout },
    inventory: { ...DEFAULT_INVENTORY_GENERATION_CONFIGURATION, ...cfg.inventory },
    placement: { ...DEFAULT_PLACEMENT_CONFIGURATION, ...cfg.placement },
  };
}

/**
 * Migrates the old flat `layoutConfig` format to the new nested structure.
 * This ensures warehouses saved before the editor workflow launch remain
 * editable without data loss.
 */
function mergeLegacyFlatConfig(old: Record<string, unknown>): WarehouseConfiguration {
  return {
    layout: {
      type: (old.type as LayoutType) ?? DEFAULT_LAYOUT_CONFIGURATION.type,
      gridHeight: (old.gridHeight as number) ?? DEFAULT_LAYOUT_CONFIGURATION.gridHeight,
      rackCount: (old.rackCount as number) ?? DEFAULT_LAYOUT_CONFIGURATION.rackCount,
      aisleWidth: (old.aisleWidth as number) ?? DEFAULT_LAYOUT_CONFIGURATION.aisleWidth,
      crossAisleCount: (old.crossAisleCount as number) ?? DEFAULT_LAYOUT_CONFIGURATION.crossAisleCount,
      fbWidth: (old.fbWidth as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbWidth,
      fbHeight: (old.fbHeight as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbHeight,
      fbTheta: (old.fbTheta as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbTheta,
      fbI2: (old.fbI2 as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbI2,
      fbS: (old.fbS as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbS,
      fbAp: (old.fbAp as number) ?? DEFAULT_LAYOUT_CONFIGURATION.fbAp,
    },
    inventory: { ...DEFAULT_INVENTORY_GENERATION_CONFIGURATION },
    placement: { ...DEFAULT_PLACEMENT_CONFIGURATION },
  };
}
