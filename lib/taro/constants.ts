// Centralized constants for Taro warehouse simulation

// Physical measurements
export const CELL_SIZE_METERS = 2; // Meters per grid cell
export const WALKING_SPEED = 60; // Walking speed in meters per minute
export const COST_PER_MINUTE = 0.50; // Cost per minute of worker time

// Canvas rendering
export const CELL_SIZE = 20;
export const GRID_COLOR = '#e5e7eb';
export const SHELF_COLOR = '#374151';
export const WORKER_COLOR = '#22c55e';
export const EMPTY_COLOR = '#ffffff';

// Z-level colors
export const Z_LEVEL_COLORS: Record<number, string> = {
  1: '#3b82f6', // blue
  2: '#8b5cf6', // purple
  3: '#f59e0b', // amber
  4: '#ef4444', // red
};

// Strategy visualization
export const STRATEGY_COLORS = {
  single: '#3b82f6', // blue
  batch: '#22c55e',  // green
  zone: '#a855f7',   // purple
  wave: '#f97316',   // orange,
} as const;

export const STRATEGY_NAMES = {
  single: 'Single Order (Baseline)',
  batch: 'Batch Picking',
  zone: 'Zone Picking',
  wave: 'Wave Picking',
} as const;

// Worker colors
export const WORKER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']; // blue, emerald, amber, red

// Animation
export const REPLAY_DURATION_MS = 3000; // 3 seconds baseline for animation

// Warehouse layout constants
export const RACK_SPACING = 2; // cells per rack slot (shelf + aisle gap)
export const AISLE_HEIGHT = 3; // rows per aisle (1 shelf + 2 path rows)
