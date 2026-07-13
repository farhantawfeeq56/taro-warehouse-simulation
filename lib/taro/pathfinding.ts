// A* Pathfinding algorithm for warehouse routes (optimized with binary heap)

import type { Warehouse, Neighbor, NeighborGraph } from './types';
import { PriorityQueue } from './priority-queue';
import { calculateOctileDistance, calculateStepEdgeCost, SQRT2 } from './distance';

interface OpenNode {
  x: number;
  y: number;
}

interface NeighborGraphCacheEntry {
  walkabilitySignature: string;
  graph: NeighborGraph;
}

const ORTHOGONAL_OFFSETS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
] as const;

const DIAGONAL_OFFSETS = [
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 1 },
] as const;

const neighborGraphCache = new WeakMap<Warehouse, NeighborGraphCacheEntry>();

function makeCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseCellKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function createWalkabilitySignature(warehouse: Warehouse): string {
  let signature = `${warehouse.width}x${warehouse.height}|`;

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      signature += warehouse.grid[y][x].type === 'shelf' ? '1' : '0';
    }
  }

  return signature;
}

export function isWalkable(warehouse: Warehouse, x: number, y: number): boolean {
  if (x < 0 || x >= warehouse.width || y < 0 || y >= warehouse.height) {
    return false;
  }

  return warehouse.grid[y][x].type !== 'shelf';
}

function buildNeighborGraph(warehouse: Warehouse): NeighborGraph {
  const neighbors = new Map<string, Neighbor[]>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (!isWalkable(warehouse, x, y)) continue;

      const list: Neighbor[] = [];

      for (const offset of ORTHOGONAL_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;

        if (isWalkable(warehouse, nx, ny)) {
          list.push({ x: nx, y: ny, edgeCost: 1 });
        }
      }

      for (const offset of DIAGONAL_OFFSETS) {
        const nx = x + offset.dx;
        const ny = y + offset.dy;

        if (!isWalkable(warehouse, nx, ny)) continue;

        const adjacentHorizontalWalkable = isWalkable(warehouse, x + offset.dx, y);
        const adjacentVerticalWalkable = isWalkable(warehouse, x, y + offset.dy);

        if (adjacentHorizontalWalkable && adjacentVerticalWalkable) {
          list.push({ x: nx, y: ny, edgeCost: SQRT2 });
        }
      }

      neighbors.set(makeCellKey(x, y), list);
    }
  }

  return neighbors;
}

export function getNeighborGraph(warehouse: Warehouse): NeighborGraph {
  const walkabilitySignature = createWalkabilitySignature(warehouse);
  const cachedEntry = neighborGraphCache.get(warehouse);

  if (cachedEntry && cachedEntry.walkabilitySignature === walkabilitySignature) {
    return cachedEntry.graph;
  }

  const graph = buildNeighborGraph(warehouse);
  neighborGraphCache.set(warehouse, { walkabilitySignature, graph });
  return graph;
}

export function findPath(
  warehouse: Warehouse,
  start: { x: number; y: number },
  end: { x: number; y: number },
  options: { neighborGraph?: NeighborGraph } = {}
): { x: number; y: number }[] {
  const neighborGraph = options.neighborGraph ?? getNeighborGraph(warehouse);

  const actualStart = findNearestWalkable(warehouse, start);
  const actualEnd = findNearestWalkable(warehouse, end);

  if (!actualStart || !actualEnd) {
    return [];
  }

  const startKey = makeCellKey(actualStart.x, actualStart.y);
  const endKey = makeCellKey(actualEnd.x, actualEnd.y);

  const openSet = new PriorityQueue<OpenNode>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  gScore.set(startKey, 0);
  openSet.enqueue(
    {
      x: actualStart.x,
      y: actualStart.y,
    },
    calculateOctileDistance(actualStart, actualEnd)
  );

  while (!openSet.isEmpty) {
    const current = openSet.dequeue();
    if (!current) break;

    const currentKey = makeCellKey(current.x, current.y);

    if (closedSet.has(currentKey)) {
      continue;
    }

    if (currentKey === endKey) {
      return reconstructPath(cameFrom, currentKey);
    }

    closedSet.add(currentKey);

    const currentGScore = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;
    const neighbors = neighborGraph.get(currentKey) ?? [];

    for (const neighbor of neighbors) {
      const neighborKey = makeCellKey(neighbor.x, neighbor.y);

      if (closedSet.has(neighborKey)) {
        continue;
      }

      const tentativeGScore = currentGScore + neighbor.edgeCost;
      const knownNeighborGScore = gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY;

      if (tentativeGScore < knownNeighborGScore) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeGScore);

        const heuristic = calculateOctileDistance(neighbor, actualEnd);
        const fScore = tentativeGScore + heuristic;

        openSet.enqueue(
          {
            x: neighbor.x,
            y: neighbor.y,
          },
          fScore
        );
      }
    }
  }

  return [];
}

function reconstructPath(cameFrom: Map<string, string>, endKey: string): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  let currentKey: string | undefined = endKey;

  while (currentKey) {
    path.unshift(parseCellKey(currentKey));
    currentKey = cameFrom.get(currentKey);
  }

  return path;
}

function findNearestWalkable(
  warehouse: Warehouse,
  pos: { x: number; y: number }
): { x: number; y: number } | null {
  if (isWalkable(warehouse, pos.x, pos.y)) {
    return pos;
  }

  let nearest: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (!isWalkable(warehouse, x, y)) continue;

      const candidate = { x, y };
      const distance = calculateOctileDistance(candidate, pos);

      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = candidate;
      }
    }
  }

  return nearest;
}

export function calculatePathDistance(path: { x: number; y: number }[]): number {
  if (path.length < 2) return 0;

  let distance = 0;

  for (let i = 1; i < path.length; i++) {
    distance += calculateStepEdgeCost(path[i - 1], path[i]);
  }

  return distance;
}
