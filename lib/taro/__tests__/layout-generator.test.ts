import { describe, expect, it } from 'vitest';
import {
  generateParallelLayout,
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

describe('layout-generator cross-aisle structure', () => {
  it('cross-aisle creates full horizontal cuts across all rack columns', () => {
    const gridHeight = 18;
    const rackCount = 5;
    const aisleWidth = 2;

    const parallel = generateParallelLayout(gridHeight, rackCount, aisleWidth);
    const crossAisle = generateCrossAisleLayout(gridHeight, rackCount, aisleWidth, 2);

    const rackColumns = getRackColumns(parallel, gridHeight);

    expect(countFullRackCutRows(crossAisle, gridHeight, rackColumns)).toBeGreaterThan(0);
  });
});
