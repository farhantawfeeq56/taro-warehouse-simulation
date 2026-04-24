// Centralized constants for Taro warehouse simulation

// Simulation defaults (can be overridden by user-provided profiles)
export const DEFAULT_WAREHOUSE_PROFILE = {
  scale: 2, // meters per grid cell
  workerSpeed: 60, // meters per minute
  pickTimePerItem: 6, // seconds per pick
  allowDiagonals: false,
} as const;

export const DEFAULT_LABOR_PROFILE = {
  costPerHour: 30, // dollars per labor hour
} as const;

// Canvas rendering
export const CELL_SIZE = 20;
export const GRID_COLOR = '#e5e7eb';
export const SHELF_COLOR = '#374151';
export const WORKER_COLOR = '#22c55e';
export const EMPTY_COLOR = '#ffffff';

// Z-level colors
export const Z_LEVEL_COLORS: Record<number, string> = {
  1: '#FFEC51', // Banana cream
  2: '#32E875', // malachite green
  3: '#B24C63', // rosewood
  4: '#DE9151', // toasted almond
};

// Strategy visualization
export const STRATEGY_COLORS = {
  single: '#A72608', // oxidized iron (red)
  batch: '#D30C7B',  // hot rose
  zone: '#FEC601',   // school bus yellow
  wave: '#8B5D33',   // toffee brown
} as const;

export const STRATEGY_NAMES = {
  single: 'Single Order (Baseline)',
  batch: 'Batch Picking',
  zone: 'Zone Picking',
  wave: 'Wave Picking',
} as const;

// Worker colors
export const WORKER_COLORS = ['#606C38', '#BC6C25', '#ECA400', '#AD343E']; // olive, copper, amber, cherry

// Animation
export const REPLAY_DURATION_MS = 3000; // 3 seconds baseline for animation
