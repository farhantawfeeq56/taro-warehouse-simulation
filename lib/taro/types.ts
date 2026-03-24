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
  workerStart: WorkerPosition | null;
}

export type StrategyType = 'single' | 'batch' | 'zone' | 'wave';

export interface WorkerRoute {
  workerId: number;
  route: { x: number; y: number }[];
  color: string;
  zone: string;
  assignedPickCount: number;
  progress: number;
}

export interface StrategyResult {
  strategy: StrategyType;
  strategyName: string;
  distance: number;
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
