// Hidden corrector - silently repairs state that would otherwise lead to
// edge cases (missing items, duplicate ids, unreachable bins, …). Runs ONLY
// at explicit user actions (loading a project, running the simulation,
// switching the active warehouse) - never on a timer, so it adds no memory
// pressure.
//
// Every function is pure and idempotent: applying it repeatedly converges to
// a clean state and then no-ops. The user never sees the fixes.
import type { Order, Warehouse } from './types';
import { collectSkuIds } from './inventory';
import { generateRandomOrders } from './demo-generator';
import { isWalkable } from './pathfinding';
import { buildCoordinateLocations } from './layout';
import { getShelfLocationId } from './layout';

// ── Fix counters (optional, dev-only) ──────────────────────────────────────

export interface CorrectorReport {
  dedupedBinIds: number;
  primaryFixed: number;
  outOfBoundsRelocated: number;
  metadataRebuilt: boolean;
  unreachableRelocated: number;
  unreachableCleared: number;
  missingLinesPruned: number;
  duplicateLinesMerged: number;
  emptyOrdersFilled: number;
  ordersRegenerated: boolean;
  orderCount: number;
}

export function emptyReport(): CorrectorReport {
  return {
    dedupedBinIds: 0,
    primaryFixed: 0,
    outOfBoundsRelocated: 0,
    metadataRebuilt: false,
    unreachableRelocated: 0,
    unreachableCleared: 0,
    missingLinesPruned: 0,
    duplicateLinesMerged: 0,
    emptyOrdersFilled: 0,
    ordersRegenerated: false,
    orderCount: 0,
  };
}

// ── 5. Duplicate bin ids ───────────────────────────────────────────────────

/**
 * Deduplicate StorageLocation ids that collide on a single shelf cell.
 * The first occurrence wins; colliding duplicates get a deterministic
 * regenerated id (`sku@x,y,z#n`) so every id is unique again. Duplicate
 * SKUs within the same cell keep their own entries (they occupy different
 * z-levels / slots) - only the id string is repaired.
 */
export function dedupeBinIds(warehouse: Warehouse): { warehouse: Warehouse; fixed: number } {
  let fixed = 0;
  const seen = new Set<string>();
  const grid = warehouse.grid.map((row) =>
    row.map((cell) => {
      if (cell.locations.length === 0) return cell;
      const locations = cell.locations.map((loc) => {
        if (!seen.has(loc.id)) {
          seen.add(loc.id);
          return loc;
        }
        let n = 2;
        let next = `${loc.sku}@${loc.x},${loc.y},${loc.z}#${n}`;
        while (seen.has(next)) {
          n++;
          next = `${loc.sku}@${loc.x},${loc.y},${loc.z}#${n}`;
        }
        seen.add(next);
        fixed++;
        return { ...loc, id: next };
      });
      return { ...cell, locations };
    }),
  );
  return { warehouse: { ...warehouse, grid }, fixed };
}

// ── 6. Primary-bin violations ──────────────────────────────────────────────

/**
 * Enforce the invariant "at most one primary per SKU, and a multi-bin SKU
 * must have exactly one primary". The primary is chosen as the bin nearest
 * to the dispatch point (workerStart), falling back to the first bin.
 */
export function fixPrimaryBins(warehouse: Warehouse): { warehouse: Warehouse; fixed: number } {
  let fixed = 0;
  const binsBySku = new Map<string, { x: number; y: number; z: number; id: string; primary?: boolean }[]>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const loc of cell.locations) {
        const arr = binsBySku.get(loc.sku);
        if (arr) arr.push(loc);
        else binsBySku.set(loc.sku, [loc]);
      }
    }
  }

  const start = warehouse.workerStart ?? { x: 0, y: warehouse.height - 1 };
  const dist = (l: { x: number; y: number; z: number }) =>
    Math.abs(l.x - start.x) + Math.abs(l.y - start.y);

  const primaryIds = new Set<string>();
  for (const [sku, bins] of binsBySku) {
    if (bins.length === 1) continue; // single-bin SKU: primary irrelevant
    const primaries = bins.filter((b) => b.primary);
    const pick = primaries.length === 1 ? primaries[0] : [...bins].sort((a, b) => dist(a) - dist(b))[0];
    primaryIds.add(pick.id);
    if (primaries.length !== 1) fixed++;
  }

  const grid = warehouse.grid.map((row) =>
    row.map((cell) => {
      if (cell.locations.length === 0) return cell;
      const locations = cell.locations.map((loc) => {
        const shouldBePrimary = primaryIds.has(loc.id);
        return shouldBePrimary !== Boolean(loc.primary)
          ? { ...loc, primary: shouldBePrimary }
          : loc;
      });
      return { ...cell, locations };
    }),
  );
  return { warehouse: { ...warehouse, grid }, fixed };
}

// ── 7/8. Out-of-bounds bins + cell-type promotion ──────────────────────────

interface StorageLocationLike {
  id: string;
  x: number;
  y: number;
  z: number;
  sku: string;
  quantity: number;
  primary?: boolean;
  demandScore?: number;
  affinityGroup?: number;
  locationId: string;
}

/**
 * Fix bins whose coordinates are out of the grid bounds or sit on a cell
 * not typed `shelf` (ghost inventory - the resolver finds them but the
 * renderer cannot draw them). Out-of-bounds bins are relocated to the
 * nearest shelf cell; bins on non-shelf cells promote the cell to `shelf`.
 * The worker-start cell is never demoted to a storage cell (it keeps its
 * type and its locations are moved off it).
 */
export function fixOutOfBoundsBins(warehouse: Warehouse): { warehouse: Warehouse; fixed: number } {
  let fixed = 0;
  const grid = warehouse.grid.map((row) =>
    row.map((cell) => ({ ...cell, locations: [...cell.locations] as StorageLocationLike[] })),
  );

  // 1. Relocate bins that are out of bounds or on the worker-start cell.
  const stranded: StorageLocationLike[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = grid[y][x];
      if (cell.locations.length === 0) continue;
      const keep: StorageLocationLike[] = [];
      for (const loc of cell.locations) {
        const inBounds = loc.x >= 0 && loc.x < warehouse.width && loc.y >= 0 && loc.y < warehouse.height;
        if (!inBounds || cell.type === 'worker-start') {
          stranded.push(loc);
          fixed++;
        } else {
          keep.push(loc);
        }
      }
      cell.locations = keep;
    }
  }

  // 2. Find every shelf cell (candidate destinations), nearest-first.
  const shelfCells: { x: number; y: number; cell: StorageLocationLike[] }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = grid[y][x];
      if (cell.type === 'shelf') shelfCells.push({ x, y, cell: cell.locations });
    }
  }
  const start = warehouse.workerStart ?? { x: 0, y: warehouse.height - 1 };
  shelfCells.sort(
    (a, b) =>
      Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)),
  );

  // 3. Place each stranded bin onto the nearest shelf cell with room.
  for (const loc of stranded) {
    const reloc = { ...loc };
    let placed = false;
    for (const shelf of shelfCells) {
      if (shelf.cell.length >= 4) continue;
      reloc.x = shelf.x;
      reloc.y = shelf.y;
      reloc.id = `${loc.sku}@${shelf.x},${shelf.y},${loc.z}`;
      reloc.locationId = getShelfLocationId(shelf.x, shelf.y);
      shelf.cell.push(reloc);
      placed = true;
      break;
    }
    if (!placed) {
      // No room anywhere - drop it (order reconciliation will prune its SKU).
      fixed++;
    }
  }

  // 4. Promote cells holding locations to `shelf` type (cell-type sync).
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = grid[y][x];
      if (cell.type === 'worker-start') continue;
      if (cell.locations.length > 0 && cell.type !== 'shelf') {
        cell.type = 'shelf';
        fixed++;
      } else if (cell.locations.length === 0 && cell.type === 'shelf') {
        // Empty shelf stays a shelf - legitimate (a rack with no stock).
      }
    }
  }

  return { warehouse: { ...warehouse, grid }, fixed };
}

// ── 8b. Metadata rebuild (shelves + locations) ─────────────────────────────

/**
 * Rebuild `warehouse.shelves` and `warehouse.locations[].binIds` from the
 * grid, so they can never drift out of sync after manual drawing/erasing.
 * `buildCoordinateLocations` does the binIds part; shelves are derived from
 * cell types.
 */
export function rebuildMetadata(warehouse: Warehouse): { warehouse: Warehouse; rebuilt: boolean } {
  const shelves: { x: number; y: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (warehouse.grid[y][x].type === 'shelf') shelves.push({ x, y });
    }
  }
  const locations = buildCoordinateLocations(warehouse);
  const rebuilt =
    shelves.length !== warehouse.shelves.length || locations.length !== warehouse.locations.length;
  return { warehouse: { ...warehouse, shelves, locations }, rebuilt };
}

// ── 11. Unreachable pick bins ──────────────────────────────────────────────

const ADJ_OFFSETS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;

/**
 * Flood-fill reachability. Computes the set of (x,y) walkable cells reachable
 * from the worker start in a single BFS pass over the grid. This is the exact
 * equivalent of running `findPath` from the start to every walkable cell, but
 * O(grid) instead of O(cells × A*). A walkable cell is any non-shelf cell
 * (`isWalkable`); shelf cells are the walls. The returned set is used to judge
 * each shelf's reachability by checking its orthogonal walkable neighbours.
 */
function computeReachableWalkableCells(warehouse: Warehouse): Set<string> {
  const reachable = new Set<string>();
  const start = warehouse.workerStart;
  if (!start) return reachable;

  const queue: Array<[number, number]> = [[start.x, start.y]];
  reachable.add(`${start.x},${start.y}`);

  let head = 0;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (const [dx, dy] of ADJ_OFFSETS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(warehouse, nx, ny)) continue;
      const key = `${nx},${ny}`;
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push([nx, ny]);
    }
  }
  return reachable;
}

/**
 * A shelf cell is REACHABLE iff the worker can path to a walkable cell
 * orthogonally adjacent to it. With a single flood-fill from the start we can
 * answer this for every shelf in O(1) each: a shelf is reachable iff at least
 * one of its adjacent walkable neighbours was flooded. (Pathing directly TO the
 * shelf cell would incorrectly succeed for a fully enclosed shelf, so the
 * adjacent-cell test is used, identical to the previous A* behaviour.)
 */
function isShelfReachableFromStart(
  reachable: Set<string>,
  warehouse: Warehouse,
  x: number,
  y: number,
): boolean {
  if (!warehouse.workerStart) return false;
  for (const [dx, dy] of ADJ_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isWalkable(warehouse, nx, ny)) continue;
    if (reachable.has(`${nx},${ny}`)) return true;
  }
  return false;
}

/**
 * Find every shelf bin that is unreachable from the worker start (fully
 * walled off by shelves). Bins on reachable shelves are left untouched.
 */
export function findUnreachableBins(warehouse: Warehouse): StorageLocationLike[] {
  if (!warehouse.workerStart) return [];
  const reachable = computeReachableWalkableCells(warehouse);
  const unreachable: StorageLocationLike[] = [];
  for (const row of warehouse.grid) {
    for (const cell of row) {
      if (cell.type !== 'shelf' || cell.locations.length === 0) continue;
      if (!isShelfReachableFromStart(reachable, warehouse, cell.x, cell.y)) {
        unreachable.push(...cell.locations);
      }
    }
  }
  return unreachable;
}

/**
 * Relocate unreachable SKUs to reachable empty bins. Each unreachable SKU is
 * moved (quantity preserved) to the nearest reachable shelf cell with fewer
 * than 4 bins. SKUs that cannot be relocated are cleared, and the caller is
 * told how many bins were cleared so order reconciliation can drop those
 * SKUs from every order.
 */
export function fixUnreachableBins(
  warehouse: Warehouse,
): { warehouse: Warehouse; relocated: number; cleared: number; clearedSkus: Set<string> } {
  if (!warehouse.workerStart) return { warehouse, relocated: 0, cleared: 0, clearedSkus: new Set() };

  const grid = warehouse.grid.map((row) => row.map((cell) => ({ ...cell, locations: [...cell.locations] })));

  // One flood-fill from the start answers reachability for every shelf in O(1)
  // each (see computeReachableWalkableCells). A shelf is reachable iff one of
  // its orthogonal walkable neighbours is flooded.
  const reachable = computeReachableWalkableCells(warehouse);
  const isShelfReachable = (x: number, y: number): boolean =>
    isShelfReachableFromStart(reachable, warehouse, x, y);

  // Candidate destinations: reachable shelf cells with room.
  const reachableShelfCells: { x: number; y: number; count: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = grid[y][x];
      if (cell.type !== 'shelf' || cell.locations.length >= 4) continue;
      if (!isShelfReachable(x, y)) continue;
      reachableShelfCells.push({ x, y, count: cell.locations.length });
    }
  }
  const start = warehouse.workerStart;
  reachableShelfCells.sort(
    (a, b) =>
      Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)),
  );

  let relocated = 0;
  let cleared = 0;
  const clearedSkus = new Set<string>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = grid[y][x];
      if (cell.type !== 'shelf' || cell.locations.length === 0) continue;
      if (isShelfReachable(x, y)) continue;

      const keep: StorageLocationLike[] = [];
      for (const loc of cell.locations) {
        const dest = reachableShelfCells.find((d) => d.count < 4);
        if (dest) {
          const reloc = { ...loc, x: dest.x, y: dest.y, id: `${loc.sku}@${dest.x},${dest.y},${loc.z}` };
          dest.count++;
          grid[dest.y][dest.x].locations.push(reloc);
          relocated++;
        } else {
          clearedSkus.add(loc.sku);
          cleared++;
        }
      }
      cell.locations = [];
    }
  }

  return {
    warehouse: { ...warehouse, grid },
    relocated,
    cleared,
    clearedSkus,
  };
}

// ── 1/12. Order reconciliation ─────────────────────────────────────────────

/**
 * Make the order set consistent with the warehouse:
 *  - Prune lines whose SKU is missing from the warehouse (or was cleared).
 *  - Merge duplicate lines within a single order (sum quantities).
 *  - Drop orders that became empty.
 *  - When the catalogue changed materially (≥ 25% of lines pruned) or the
 *    order set is empty, silently regenerate the orders.
 */
export function reconcileOrders(
  orders: Order[],
  warehouse: Warehouse,
  opts: { forceRegenerate?: boolean } = {},
): { orders: Order[]; pruned: number; merged: number; emptiedOrders: number; regenerated: boolean } {
  const available = new Set(collectSkuIds(warehouse));

  if (opts.forceRegenerate || orders.length === 0) {
    return {
      orders: orders.length === 0 ? [] : generateRandomOrders(warehouse, orders.length, 5),
      pruned: 0,
      merged: 0,
      emptiedOrders: 0,
      regenerated: true,
    };
  }

  let pruned = 0;
  let merged = 0;
  let emptiedOrders = 0;
  let totalLines = 0;

  const cleaned: Order[] = [];
  for (const order of orders) {
    const items: Order['items'] = [];
    const seen = new Map<string, number>();
    for (const item of order.items) {
      totalLines++;
      if (!available.has(item.skuId)) {
        pruned++;
        continue;
      }
      seen.set(item.skuId, (seen.get(item.skuId) ?? 0) + (item.quantity ?? 1));
    }
    for (const [skuId, quantity] of seen) items.push({ skuId, quantity });
    if (items.length > 0) {
      cleaned.push({ ...order, items });
    } else {
      emptiedOrders++;
    }
  }
  merged = 0; // duplicate merge happens in the map above (no extra counter per line)

  const prunedRatio = totalLines > 0 ? pruned / totalLines : 0;
  if (prunedRatio >= 0.25 || emptiedOrders >= Math.max(1, orders.length / 2)) {
    return {
      orders: generateRandomOrders(warehouse, orders.length, 5),
      pruned,
      merged,
      emptiedOrders,
      regenerated: true,
    };
  }

  return { orders: cleaned, pruned, merged, emptiedOrders, regenerated: false };
}

// ── Orchestration ──────────────────────────────────────────────────────────

export interface ReconciliationResult {
  warehouse: Warehouse;
  orders: Order[];
  report: CorrectorReport;
}

/**
 * Full fixpoint pass. Order of operations matters:
 *   1. Warehouse structural repairs (dedupe, primaries, bounds, metadata).
 *   2. Unreachable-bin relocation (needs a valid workerStart).
 *   3. Order reconciliation against the repaired catalog.
 *
 * All steps are idempotent, so a second call on the result is a no-op.
 */
export function reconcile(
  warehouse: Warehouse,
  orders: Order[],
): ReconciliationResult {
  const report = emptyReport();
  report.orderCount = orders.length;

  // Warehouse pass.
  let w = warehouse;
  const d = dedupeBinIds(w);
  report.dedupedBinIds = d.fixed;
  w = d.warehouse;

  const p = fixPrimaryBins(w);
  report.primaryFixed = p.fixed;
  w = p.warehouse;

  const b = fixOutOfBoundsBins(w);
  report.outOfBoundsRelocated = b.fixed;
  w = b.warehouse;

  const m = rebuildMetadata(w);
  report.metadataRebuilt = m.rebuilt;
  w = m.warehouse;

  // Unreachable pass (requires a workerStart).
  if (w.workerStart) {
    const u = fixUnreachableBins(w);
    report.unreachableRelocated = u.relocated;
    report.unreachableCleared = u.cleared;
    w = u.warehouse;
    if (u.relocated > 0 || u.cleared > 0) {
      // Relocation changed the catalog - rebuild metadata once more.
      const m2 = rebuildMetadata(w);
      report.metadataRebuilt = m2.rebuilt;
      w = m2.warehouse;
    }
  }

  // Order pass.
  const skipSkuSet = new Set<string>();
  const o = reconcileOrders(orders, w, { forceRegenerate: false });
  report.missingLinesPruned = o.pruned;
  report.duplicateLinesMerged = o.merged;
  report.emptyOrdersFilled = o.emptiedOrders;
  report.ordersRegenerated = o.regenerated;

  return { warehouse: w, orders: o.orders, report };
}