// Core data types for Taro warehouse simulation

// Branded types for grid coordinates to prevent mixing coordinates
export type GridX = number & { readonly __brand: 'GridX' };
export type GridY = number & { readonly __brand: 'GridY' };

// Helper functions to create branded types
export const gridX = (value: number): GridX => value as GridX;
export const gridY = (value: number): GridY => value as GridY;

export type CellType = 'empty' | 'shelf' | 'worker-start';

// Storage location represents the canonical data model
// Key: ${x},${y},${z}-${sku} for stable references
export interface StorageLocation {
  id: string;
  locationId: string;
  x: number;
  y: number;
  z: number; // z-level (1-4 typically)
  sku: string;
  quantity: number;
}

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  locations: StorageLocation[];
}

export interface OrderItem {
  itemId: string;
}

// Orders now reference item IDs.
export interface Order {
  id: string;
  items: OrderItem[];
  assignedWorkerId: number | null; // null = Auto
}

export interface WorkerPosition {
  x: number;
  y: number;
}

export interface WarehouseLocation {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'shelf';
  items: string[];
}

export interface Item {
  id: string;
  locationId: string;
}

export interface Warehouse {
  width: number;
  height: number;
  grid: Cell[][];
  shelves: { x: number; y: number }[];
  workerStart: WorkerPosition | null;
  locations: WarehouseLocation[];
  items: Item[];
}

export interface WarehouseProfile {
  scale: number; // meters per grid cell
  workerSpeed: number; // meters per minute
  pickTimePerItem: number; // seconds per pick
  allowDiagonals: boolean;
}

export interface Neighbor {
  x: number;
  y: number;
  weight: number;
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
  missingItemIds: string[];
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
  item: string;
}
