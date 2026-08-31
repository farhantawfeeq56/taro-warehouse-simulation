// Centralized constants for Taro warehouse simulation

// Simulation defaults (can be overridden by user-provided profiles)
export const DEFAULT_WAREHOUSE_PROFILE = {
  scale: 2, // meters per grid cell
  workerSpeed: 60, // meters per minute
  pickTimePerItem: 6, // seconds per pick
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
} as const;

export const STRATEGY_NAMES = {
  single: 'Single Order (Baseline)',
  batch: 'Batch Picking',
  zone: 'Zone Picking',
} as const;

// Worker colors (up to 10 workers)
// vartest3: three palettes, switched by the floating segmented toolbar (keys 1-3).
export const WORKER_PALETTES = [
  // 1 · existing — raw Tailwind 500s
  [
    '#606C38', // olive
    '#BC6C25', // copper
    '#ECA400', // amber
    '#AD343E', // cherry
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
  ],
  // 2 · muted categorical — mid-dark (S≈60%, L≈45%), visible on white, distinct from black shelves
  [
    '#C63D2F', // red
    '#C9712F', // orange
    '#B89A2E', // gold (matches PAPER gold)
    '#6E9E2E', // green
    '#2E9E6E', // teal-green
    '#2E9E9E', // teal
    '#2E6E9E', // blue (matches PAPER blue family)
    '#4E4EA5', // indigo
    '#8A4EA5', // violet (matches PAPER purple)
    '#A54E7C', // plum
  ],
  // 3 · PAPER family — derives from the app's PAPER tiles (gold/purple/blue/orange + dark)
  [
    '#D6A83D', // gold
    '#8A70A8', // purple
    '#5B8DB8', // blue
    '#C87555', // orange
    '#B24C63', // rosewood
    '#DE9151', // toasted almond
    '#606C38', // olive
    '#14B8A6', // teal
    '#3B82F6', // blue (needed to reach 10)
    '#6366F1', // indigo
  ],
] as const;

// Active palette — module-level so engine + renderers read it live (no prop drilling).
let workerPaletteIndex = 0;
export const getWorkerPalette = () => WORKER_PALETTES[workerPaletteIndex];
export const setWorkerPalette = (i: number) => {
  workerPaletteIndex = Math.max(0, Math.min(WORKER_PALETTES.length - 1, i));
};
export const WORKER_COLORS = WORKER_PALETTES[0]; // default — kept for compat

// Animation
export const REPLAY_DURATION_MS = 3000; // 3 seconds baseline for animation
