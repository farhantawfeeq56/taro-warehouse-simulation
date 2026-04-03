// Core data types for Taro warehouse simulation

export type CellType = 'empty' | 'shelf' | 'worker-start';

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

export interface Item {
  id: number;
  x: number;
  y: number;
  z: number;
  sku: string;
}

export interface Order {
  id: string;
  items: number[]; // Item IDs (legacy) or SKU references
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
  items: Item[];
  shelves: { x: number; y: number }[];
  workerStart: WorkerPosition | null;
}

export type StrategyType = 'single' | 'batch' | 'zone' | 'wave';

export interface WorkerRoute {
  workerId: number;
  route: { x: number; y: number }[];
  picks: { itemId: number; x: number; y: number; z: number; sku: string }[]; // actual pick locations only
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

export type ZVisualizationMode = 'collapsed' | 'level1' | 'level2' | 'level3' | 'level4';

export interface PickTask {
  workerId: number;
  step: number;
  zone: string;
  location: string;
  item: string;
}
