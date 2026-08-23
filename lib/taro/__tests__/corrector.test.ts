import { describe, it, expect } from 'vitest';
import {
  reconcile,
  dedupeBinIds,
  fixPrimaryBins,
  fixOutOfBoundsBins,
  fixUnreachableBins,
  reconcileOrders,
  pruneComparisonMembers,
} from '../corrector';
import { generateDemoWarehouse, generateRandomOrders } from '../demo-generator';
import { getShelfLocationId } from '../layout';
import { findPath } from '../pathfinding';
import type { Cell, Order, StorageLocation, Warehouse, WarehouseLocation } from '../types';

function bin(x: number, y: number, z: number, sku: string, quantity = 10, primary?: boolean): StorageLocation {
  return {
    id: `${sku}@${x},${y},${z}`,
    locationId: getShelfLocationId(x, y),
    x,
    y,
    z,
    sku,
    quantity,
    ...(primary !== undefined ? { primary } : {}),
  };
}

function emptyCell(x: number, y: number): Cell {
  return { x, y, type: 'empty', locations: [] };
}

function shelfCell(x: number, y: number, bins: StorageLocation[]): Cell {
  return { x, y, type: 'shelf', locations: bins };
}

function buildWarehouse(
  width: number,
  height: number,
  shelfBins: Array<[number, number, StorageLocation[]]>,
  workerStart: { x: number; y: number } | null = { x: 0, y: 0 },
): Warehouse {
  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => emptyCell(x, y)),
  );
  const shelves: { x: number; y: number }[] = [];
  const locations: WarehouseLocation[] = [];
  for (const [x, y, bins] of shelfBins) {
    grid[y][x] = shelfCell(x, y, bins);
    shelves.push({ x, y });
    locations.push({
      id: getShelfLocationId(x, y),
      x,
      y,
      type: 'shelf',
      binIds: bins.map((b) => b.id),
    });
  }
  if (workerStart) {
    grid[workerStart.y][workerStart.x] = { x: workerStart.x, y: workerStart.y, type: 'worker-start', locations: [] };
  }
  return { width, height, grid, shelves, workerStart, locations };
}

describe('corrector', () => {
  describe('dedupeBinIds', () => {
    it('regenerates colliding ids but keeps distinct bins', () => {
      // Two bins with the SAME id (e.g. CSV rows colliding on the same slot).
      const a = bin(1, 1, 1, 'SKU_A', 10);
      const b = { ...bin(1, 1, 1, 'SKU_A', 10), sku: 'SKU_A' }; // same coords+sku → same id
      const wh = buildWarehouse(3, 3, [[1, 1, [a, b]]]);
      const { warehouse, fixed } = dedupeBinIds(wh);
      expect(fixed).toBe(1);
      const ids = warehouse.grid[1][1].locations.map((l) => l.id);
      expect(new Set(ids).size).toBe(2);
      // The kept one is the original; the second is regenerated.
      expect(ids).toContain('SKU_A@1,1,1');
      expect(ids.some((id) => id.startsWith('SKU_A@1,1,1#'))).toBe(true);
    });
  });

  describe('fixPrimaryBins', () => {
    it('keeps exactly one primary per multi-bin SKU, nearest dispatch', () => {
      // SKU_X occupies (1,1) and (0,1) — (0,1) is nearest to start (0,0).
      const far = bin(1, 1, 1, 'SKU_X', 10, false);
      const near = bin(0, 1, 1, 'SKU_X', 10, false);
      const wh = buildWarehouse(3, 3, [
        [1, 1, [far]],
        [0, 1, [near]],
      ]);
      const { warehouse, fixed } = fixPrimaryBins(wh);
      expect(fixed).toBe(1);
      const primaries = warehouse.grid
        .flat()
        .flatMap((c) => c.locations)
        .filter((l) => l.sku === 'SKU_X' && l.primary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].x).toBe(0);
      expect(primaries[0].y).toBe(1);
    });
  });

  describe('fixOutOfBoundsBins', () => {
    it('relocates out-of-bounds bins onto a shelf cell', () => {
      const oob = { ...bin(99, 99, 1, 'SKU_OOB', 10), x: 99, y: 99 } as StorageLocation;
      const wh = buildWarehouse(3, 3, [[1, 1, [bin(1, 1, 1, 'SKU_OK')]]]);
      wh.grid[2][2] = shelfCell(2, 2, [oob]); // out-of-bounds coords on an in-grid cell
      const { warehouse, fixed } = fixOutOfBoundsBins(wh);
      expect(fixed).toBeGreaterThan(0);
      const oobBin = warehouse.grid
        .flat()
        .flatMap((c) => c.locations)
        .find((l) => l.sku === 'SKU_OOB');
      expect(oobBin).toBeDefined();
      expect(oobBin!.x).toBeLessThan(3);
      expect(oobBin!.y).toBeLessThan(3);
    });
  });

  describe('fixUnreachableBins', () => {
    it('relocates SKUs from walled-off shelves to reachable bins', () => {
      // Build a warehouse where (2,2) is FULLY enclosed: every reachable cell
      // (all 8 neighbors) is a shelf, and (2,2) sits inside a pocket that A*
      // cannot enter. The worker starts at (0,0); a reachable shelf at (0,2)
      // receives the relocated bin.
      const wh = buildWarehouse(5, 5, []);
      // Reachable shelf that will accept the relocated SKU.
      wh.grid[0][2] = shelfCell(0, 2, []);
      // Enclose (2,2): 8 neighbors all shelves.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const wx = 2 + dx;
        const wy = 2 + dy;
        if (wx >= 0 && wx < 5 && wy >= 0 && wy < 5) wh.grid[wy][wx] = shelfCell(wx, wy, []);
      }
      // Put the trapped bin at (2,2) — it sits on a shelf cell with no walkable
      // escape, so A* cannot reach it from (0,0).
      wh.grid[2][2] = shelfCell(2, 2, [bin(2, 2, 1, 'SKU_TRAPPED', 10)]);
      wh.grid[0][0] = { x: 0, y: 0, type: 'worker-start', locations: [] };
      wh.workerStart = { x: 0, y: 0 };

      const { warehouse, relocated, cleared } = fixUnreachableBins(wh);
      expect(relocated + cleared).toBeGreaterThan(0);
      // SKU_TRAPPED must no longer sit on the unreachable cell.
      const stillTrapped = warehouse.grid[2][2].locations.some((l) => l.sku === 'SKU_TRAPPED');
      expect(stillTrapped).toBe(false);
      // And it should now live on a reachable shelf (has a walkable neighbor
      // pathable from the worker start).
      const moved = warehouse.grid.flat().flatMap((c) => c.locations).find((l) => l.sku === 'SKU_TRAPPED');
      expect(moved).toBeDefined();
      expect(moved!.x === 2 && moved!.y === 2).toBe(false);
      const destCell = warehouse.grid[moved!.y][moved!.x];
      expect(destCell.type).toBe('shelf');
      // The destination must be reachable: some orth neighbor is walkable & pathable.
      const reachable = [[0,1],[0,-1],[1,0],[-1,0]].some(([dx, dy]) => {
        const nx = moved!.x + dx;
        const ny = moved!.y + dy;
        const c = warehouse.grid[ny]?.[nx];
        return c && c.type !== 'shelf' && findPath(wh, { x: 0, y: 0 }, { x: nx, y: ny }).length > 0;
      });
      expect(reachable).toBe(true);
    });
  });

  describe('reconcileOrders', () => {
    it('prunes lines whose SKU is missing from the warehouse', () => {
      const wh = buildWarehouse(3, 3, [[1, 1, [bin(1, 1, 1, 'SKU_GOOD')]]]);
      const orders: Order[] = [
        { id: 'A', items: [{ skuId: 'SKU_GOOD' }, { skuId: 'SKU_MISSING' }], assignedWorkerId: null },
      ];
      const { orders: out, pruned } = reconcileOrders(orders, wh);
      expect(pruned).toBe(1);
      expect(out).toHaveLength(1);
      expect(out[0].items.map((i) => i.skuId)).toEqual(['SKU_GOOD']);
    });

    it('merges duplicate lines within one order', () => {
      const wh = buildWarehouse(3, 3, [[1, 1, [bin(1, 1, 1, 'SKU_A')]]]);
      const orders: Order[] = [
        { id: 'A', items: [{ skuId: 'SKU_A', quantity: 2 }, { skuId: 'SKU_A', quantity: 3 }], assignedWorkerId: null },
      ];
      const { orders: out } = reconcileOrders(orders, wh);
      expect(out[0].items).toHaveLength(1);
      expect(out[0].items[0].quantity).toBe(5);
    });

    it('regenerates when more than 25% of lines are missing', () => {
      const wh = buildWarehouse(3, 3, [[1, 1, [bin(1, 1, 1, 'SKU_GOOD')]]]);
      const orders: Order[] = [
        { id: 'A', items: [{ skuId: 'SKU_GOOD' }, { skuId: 'M1' }, { skuId: 'M2' }, { skuId: 'M3' }, { skuId: 'M4' }], assignedWorkerId: null },
      ];
      const { orders: out, regenerated } = reconcileOrders(orders, wh);
      expect(regenerated).toBe(true);
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((o) => o.items.every((i) => ['SKU_GOOD'].includes(i.skuId)))).toBe(true);
    });

    it('regenerates when the order set is empty but warehouse has SKUs', () => {
      const wh = buildWarehouse(3, 3, [[1, 1, [bin(1, 1, 1, 'SKU_A')]]]);
      const { orders, regenerated } = reconcileOrders([], wh);
      expect(regenerated).toBe(true);
      expect(orders.length).toBe(0); // no count to preserve — stays empty
    });
  });

  describe('pruneComparisonMembers', () => {
    it('removes members pointing at unknown warehouses', () => {
      expect(pruneComparisonMembers(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['a', 'c']);
    });
  });

  describe('reconcile (integration)', () => {
    it('converges: second pass is a no-op', () => {
      const wh = generateDemoWarehouse();
      const orders = generateRandomOrders(wh, 20, 4);
      const first = reconcile(wh, orders);
      const second = reconcile(first.warehouse, first.orders);
      expect(second.report.missingLinesPruned).toBe(0);
      expect(second.report.ordersRegenerated).toBe(false);
      expect(second.orders).toEqual(first.orders);
      // Warehouse should be structurally identical too (same SKUs, same grid).
      expect(second.warehouse.grid).toEqual(first.warehouse.grid);
    });

    it('fixes a corrupted warehouse + order set end to end', () => {
      const wh = generateDemoWarehouse();
      // Corrupt: duplicate bin ids, out-of-bounds bin, missing-SKU order line.
      const corrupt = structuredClone(wh);
      const cell = corrupt.grid[3][3];
      if (cell.locations.length > 0) {
        const dup = { ...cell.locations[0] };
        cell.locations.push(dup);
      }
      corrupt.grid[3][3] = { ...corrupt.grid[3][3], locations: [...cell.locations, { ...bin(99, 99, 1, 'SKU_GHOST'), x: 99, y: 99 }] };
      const orders: Order[] = [
        { id: 'X', items: [{ skuId: 'SKU_GHOST' }, { skuId: 'SKU_NOPE' }], assignedWorkerId: null },
      ];
      const { warehouse: cw, orders: co } = reconcile(corrupt, orders);
      // The ghost bin must have been RELOCATED to valid in-bounds coordinates,
      // not silently dropped (its inventory is preserved).
      const ghostBins = cw.grid.flat().flatMap((c) => c.locations).filter((l) => l.sku === 'SKU_GHOST');
      expect(ghostBins.length).toBe(1);
      const g = ghostBins[0];
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeLessThan(cw.width);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeLessThan(cw.height);
      // All bin ids are unique after dedup.
      const allIds = cw.grid.flat().flatMap((c) => c.locations.map((l) => l.id));
      expect(new Set(allIds).size).toBe(allIds.length);
      // Every order line resolves to a SKU present in the corrected warehouse.
      const skus = new Set(cw.grid.flat().flatMap((c) => c.locations.map((l) => l.sku)));
      expect(co.every((o) => o.items.every((i) => skus.has(i.skuId)))).toBe(true);
      // The fully-missing SKU_NOPE line is pruned.
      expect(co.every((o) => o.items.every((i) => i.skuId !== 'SKU_NOPE'))).toBe(true);
    });
  });
});
