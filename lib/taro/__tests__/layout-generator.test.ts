import { describe, expect, it } from 'vitest';
import {
  generateParallelLayout,
  generateSegmentedLayout,
  generateCrossAisleLayout,
} from '../layout-generator';
import type { Warehouse } from '../types';
import { OUTER_PADDING } from '../layout-utils';

function getRackColumns(warehouse: Warehouse, gridHeight: number): number[] {
  const startY = OUTER_PADDING;
  const endY = OUTER_PADDING + gridHeight;
  const startX = OUTER_PADDING;
  const endX = warehouse.width - OUTER_PADDING;

  const rackColumns: number[] = [];

  for (let x = startX; x < endX; x++) {
    let hasShelf = false;

    for (let y = startY; y < endY; y++) {
      if (warehouse.grid[y][x].type === 'shelf') {
        hasShelf = true;
        break;
      }
    }

    if (hasShelf) {
      rackColumns.push(x);
    }
  }

  return rackColumns;
}

function countFullRackCutRows(warehouse: Warehouse, gridHeight: number, rackColumns: number[]): number {
  const startY = OUTER_PADDING;
  const endY = OUTER_PADDING + gridHeight;
  let fullCutRows = 0;

  for (let y = startY; y < endY; y++) {
    const isFullRackCut = rackColumns.every((x) => warehouse.grid[y][x].type !== 'shelf');
    if (isFullRackCut) {
      fullCutRows++;
    }
  }

  return fullCutRows;
}

describe('layout-generator segmented vs cross-aisle structure', () => {
  it('segmented only interrupts rack cells and keeps aisle columns intact', () => {
    const gridHeight = 18;
    const rackCount = 6;
    const aisleWidth = 2;
    const segmentCount = 3;

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const segmented = generateSegmentedLayout(gridHeight, rackCount, aisleWidth, segmentCount);

    for (let y = 0; y < parallel.height; y++) {
      for (let x = 0; x < parallel.width; x++) {
        if (parallel.grid[y][x].type !== 'shelf') {
          expect(segmented.grid[y][x].type).toBe(parallel.grid[y][x].type);
        }
      }
    }
  });

  it('segmented creates rack-only breaks without full horizontal cut rows', () => {
    const gridHeight = 18;
    const rackCount = 5;
    const aisleWidth = 2;
    const segmentCount = 3;

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const segmented = generateSegmentedLayout(gridHeight, rackCount, aisleWidth, segmentCount);

    const rackColumns = getRackColumns(parallel, gridHeight);

    let interruptedRackCells = 0;
    for (let y = OUTER_PADDING; y < OUTER_PADDING + gridHeight; y++) {
      for (const x of rackColumns) {
        if (parallel.grid[y][x].type === 'shelf' && segmented.grid[y][x].type !== 'shelf') {
          interruptedRackCells++;
        }
      }
    }

    expect(interruptedRackCells).toBeGreaterThan(0);
    expect(countFullRackCutRows(segmented, gridHeight, rackColumns)).toBe(0);
  });

  it('cross-aisle retains full horizontal cuts while segmented does not', () => {
    const gridHeight = 18;
    const rackCount = 5;
    const aisleWidth = 2;

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const segmented = generateSegmentedLayout(gridHeight, rackCount, aisleWidth, 3);
    const crossAisle = generateCrossAisleLayout(gridHeight, rackCount, aisleWidth, 2);

    const rackColumns = getRackColumns(parallel, gridHeight);

    expect(countFullRackCutRows(segmented, gridHeight, rackColumns)).toBe(0);
    expect(countFullRackCutRows(crossAisle, gridHeight, rackColumns)).toBeGreaterThan(0);
  });

  it('handles segmentCount <= 1 by matching base parallel structure', () => {
    const gridHeight = 12;
    const rackCount = 4;
    const aisleWidth = 2;

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const segmented = generateSegmentedLayout(gridHeight, rackCount, aisleWidth, 1);

    for (let y = 0; y < parallel.height; y++) {
      for (let x = 0; x < parallel.width; x++) {
        expect(segmented.grid[y][x].type).toBe(parallel.grid[y][x].type);
      }
    }
  });

  it('handles very small grid heights without invalid break calculations', () => {
    const gridHeight = 2;
    const rackCount = 3;
    const aisleWidth = 2;
    const segmentCount = 5;

    expect(() => generateSegmentedLayout(gridHeight, rackCount, aisleWidth, segmentCount)).not.toThrow();

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const segmented = generateSegmentedLayout(gridHeight, rackCount, aisleWidth, segmentCount);

    for (let y = 0; y < parallel.height; y++) {
      for (let x = 0; x < parallel.width; x++) {
        expect(segmented.grid[y][x].type).toBe(parallel.grid[y][x].type);
      }
    }
  });
});
