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

// Order now uses location keys (SKU-based) instead of legacy item IDs
export interface Order {
  id: string;
  items: string[]; // SKU-based item references
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
}

export type StrategyType = 'single' | 'batch' | 'zone' | 'wave';

export interface WorkerRoute {
  workerId: number;
  route: { x: number; y: number }[];
  picks: { locationKey: string; x: number; y: number; z: number; sku: string }[];
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
  workerRoutes?: WorkerRoute[];
}

export interface SimulationResults {
  strategies: StrategyResult[];
  heatmap: number[][];
  bestStrategy: StrategyType;
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
