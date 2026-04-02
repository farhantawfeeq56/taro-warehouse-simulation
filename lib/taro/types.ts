// Core data types for Taro warehouse simulation

export type CellType = 'empty' | 'shelf' | 'item' | 'worker-start';

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  itemId?: number;
}

export interface Item {
  id: number;
  x: number;
  y: number;
}

export interface Order {
  id: string;
  items: number[];
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
  picks: { itemId: number; x: number; y: number }[]; // actual pick locations only
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

export type ToolType = 'shelf' | 'item' | 'worker' | 'erase';

export interface PickTask {
  workerId: number;
  step: number;
  zone: string;
  location: string;
  item: string;
}
