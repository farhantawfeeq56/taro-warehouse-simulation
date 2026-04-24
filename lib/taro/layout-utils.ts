import { Cell } from './types';

export const OUTER_PADDING = 2;

export function addOuterPadding(grid: Cell[][]): Cell[][] {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const paddedHeight = height + OUTER_PADDING * 2;
  const paddedWidth = width + OUTER_PADDING * 2;

  const paddedGrid: Cell[][] = [];

  for (let y = 0; y < paddedHeight; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < paddedWidth; x++) {
      const logicalX = x - OUTER_PADDING;
      const logicalY = y - OUTER_PADDING;

      if (
        logicalX >= 0 &&
        logicalX < width &&
        logicalY >= 0 &&
        logicalY < height
      ) {
        // Within logical grid
        const originalCell = grid[logicalY][logicalX];
        row.push({
          ...originalCell,
          x, // Visual x
          y, // Visual y
        });
      } else {
        // Padding - aisle (empty)
        row.push({
          x,
          y,
          type: 'empty',
          locations: [],
        });
      }
    }
    paddedGrid.push(row);
  }

  return paddedGrid;
}
