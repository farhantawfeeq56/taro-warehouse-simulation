// Core data types for Taro warehouse simulation

// Branded types for grid coordinates to prevent mixing coordinates
export type GridX = number & { readonly __brand: 'GridX' };
export type GridY = number & { readonly __brand: 'GridY' };

// Helper functions to create branded types
export const gridX = (value: number): GridX => value as GridX;
export const gridY = (value: number): GridY => value as GridY;

export type CellType = 'empty' | 'shelf' | 'worker-start';

/**
 * A StorageLocation is a single bin: one slot on one shelf at one z-level.
 * Each bin carries exactly one SKU and its stock quantity.
 *
 * Invariant: every `sku` value across all StorageLocations in a Warehouse is unique.
 *            One SKU lives in exactly one bin.
 */
export interface StorageLocation {
  id: string;
  locationId: string;
  x: number;
  y: number;
  z: number;
  sku: string;
  quantity: number;
}

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  locations: StorageLocation[];
}

/**
 * A WarehouseLocation is a physical shelf (the shelf itself, not a single bin).
 * It groups the bins that sit on that shelf so callers can answer shelf-level
 * questions (which aisle/rack/column) without scanning every StorageLocation.
 */
export interface WarehouseLocation {
  id: string;
  x: number;
  y: number;
  type: 'shelf';
  binIds: string[];
}

export interface OrderItem {
  skuId: string;
  quantity?: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  assignedWorkerId: number | null; // null = Auto
}

export interface WorkerPosition {
  x: number;
  y: number;
}

export interface Warehouse {
  width: number;
  height: number;
  grid: Cell[][];
  shelves: { x: number; y: number }[];
  workerStart: WorkerPosition | null;
  locations: WarehouseLocation[];
}

export interface WarehouseProfile {
  scale: number; // meters per grid cell
  workerSpeed: number; // meters per minute
  pickTimePerItem: number; // seconds per pick
}

export interface Neighbor {
  x: number;
  y: number;
  edgeCost: number;
}

export type NeighborGraph = Map<string, Neighbor[]>;

export interface LaborProfile {
  costPerHour: number;
}

export interface SimulationProfiles {
  warehouseProfile?: Partial<WarehouseProfile>;
  laborProfile?: Partial<LaborProfile>;
  /** When true, unresolvable order lines are skipped instead of aborting the run. */
  allowPartial?: boolean;
}

export type StrategyType = 'single' | 'batch' | 'zone' | 'wave';

export interface WorkerRoute {
  workerId: number;
  route: { x: number; y: number }[];
  picks: { locationKey: string; x: number; y: number; z: number; sku: string; pickCount?: number }[];
  tasks: PickTask[];
  color: string;
  zone: string;
  assignedPickCount: number;
  progress: number;
}

export interface StrategyResult {
  strategy: StrategyType;
  strategyName: string;
  distance: number;
  totalDistance: number;
  criticalPathDistance: number;
  estimatedTime: number;
  efficiency: number;
  workerUtilization: number;
  costPerOrder: number;
  route: { x: number; y: number }[];
  color: string;
  workerRoutes: WorkerRoute[];
}

export interface SimulationResults {
  strategies: StrategyResult[];
  heatmap: number[][];
  bestStrategy: StrategyType;
  isPartial: boolean;
  unresolvableItems: string[];
  missingItemsCount: number;
  invalidLocationCount: number;
  validationContext?: SimulationValidationContext;
}

export interface OrderValidationResult {
  orderId: string;
  missingSkuIds: string[];
}

export interface SimulationValidationContext {
  totalItems: number;
  missingItems: number;
  affectedOrders: number;
  missingItemsByOrder: OrderValidationResult[];
}

export type ToolType = 'shelf' | 'worker' | 'erase';

export type ZVisualizationMode = 'all' | 'level1' | 'level2' | 'level3' | 'level4';

export interface PickTask {
  workerId: number;
  step: number;
  zone: string;
  location: string;
  sku: string;
}

export interface SimulationBlockState {
  /** Set when simulation cannot run; drives right-panel blocked UI. */
  simulationState?: 'NO_VALID_ITEMS' | 'UNREACHABLE_LOCATIONS';
  title: string;
  description: string;
}
