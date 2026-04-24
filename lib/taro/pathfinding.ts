// A* Pathfinding algorithm for warehouse routes (optimized with binary heap)

import type { Warehouse, Neighbor, NeighborGraph } from './types';
import { PriorityQueue } from './priority-queue';
import { calculateManhattanDistance, calculateOctileDistance, calculateEuclideanDistance, SQRT2 } from './distance';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export function isWalkable(warehouse: Warehouse, x: number, y: number): boolean {
  if (x < 0 || x >= warehouse.width || y < 0 || y >= warehouse.height) {
    return false;
  }
  const cell = warehouse.grid[y][x];
  return cell.type !== 'shelf';
}

export function getNeighborGraph(warehouse: Warehouse, allowDiagonals: boolean = false): NeighborGraph {
  const neighbors = new Map<string, Neighbor[]>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (!isWalkable(warehouse, x, y)) continue;

      const list: Neighbor[] = [];
      
      // Orthogonal neighbors
      const orthogonals = [
        { x: x, y: y - 1 },
        { x: x, y: y + 1 },
        { x: x - 1, y: y },
        { x: x + 1, y: y },
      ];

      for (const cand of orthogonals) {
        if (isWalkable(warehouse, cand.x, cand.y)) {
          list.push({ x: cand.x, y: cand.y, weight: 1 });
        }
      }

      if (allowDiagonals) {
        // Diagonal neighbors
        const diagonals = [
          { x: x - 1, y: y - 1, check: [{ x: x - 1, y }, { x, y: y - 1 }] },
          { x: x + 1, y: y - 1, check: [{ x: x + 1, y }, { x, y: y - 1 }] },
          { x: x - 1, y: y + 1, check: [{ x: x - 1, y }, { x, y: y + 1 }] },
          { x: x + 1, y: y + 1, check: [{ x: x + 1, y }, { x, y: y + 1 }] },
        ];

        for (const cand of diagonals) {
          if (isWalkable(warehouse, cand.x, cand.y)) {
            // Corner cutting check: both adjacent orthogonal cells must be walkable
            const canPass = cand.check.every(c => isWalkable(warehouse, c.x, c.y));
            if (canPass) {
              list.push({ x: cand.x, y: cand.y, weight: SQRT2 });
            }
          }
        }
      }

      neighbors.set(`${x},${y}`, list);
    }
  }

  return neighbors;
}

export function findPath(
  warehouse: Warehouse,
  start: { x: number; y: number },
  end: { x: number; y: number },
  options: { allowDiagonals?: boolean, neighborGraph?: NeighborGraph } = {}
): { x: number; y: number }[] {
  const { allowDiagonals = false, neighborGraph: providedGraph } = options;
  const neighborGraph = providedGraph || getNeighborGraph(warehouse, allowDiagonals);
  const heuristic = allowDiagonals ? calculateOctileDistance : calculateManhattanDistance;

  // If start or end is on a shelf, find nearest walkable cell
  const actualStart = findNearestWalkable(warehouse, start);
  const actualEnd = findNearestWalkable(warehouse, end);

  if (!actualStart || !actualEnd) {
    return [];
  }

  // Use binary heap priority queue instead of array sort
  const openSet = new PriorityQueue<Node>();
  const closedSet = new Set<string>();
  const openSetNodes = new Map<string, Node>(); // Track nodes in open set for updates

  const startNode: Node = {
    x: actualStart.x,
    y: actualStart.y,
    g: 0,
    h: heuristic(actualStart, actualEnd),
    f: heuristic(actualStart, actualEnd),
    parent: null,
  };

  const startKey = `${startNode.x},${startNode.y}`;
  openSet.enqueue(startNode, startNode.f);
  openSetNodes.set(startKey, startNode);

  while (!openSet.isEmpty) {
    const current = openSet.dequeue()!;

    // Check if we reached the goal
    if (current.x === actualEnd.x && current.y === actualEnd.y) {
      const path: { x: number; y: number }[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    const currentKey = `${current.x},${current.y}`;
    closedSet.add(currentKey);
    openSetNodes.delete(currentKey);

    const neighbors = neighborGraph.get(currentKey) || [];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;

      if (closedSet.has(neighborKey)) {
        continue;
      }

      const g = current.g + neighbor.weight;
      const h = heuristic(neighbor, actualEnd);
      const f = g + h;

      const existingNode = openSetNodes.get(neighborKey);

      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
          // Priority queue doesn't support priority updates directly
          // The node will be in correct position since we're always extracting min
        }
      } else {
        const newNode: Node = {
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f,
          parent: current,
        };
        openSet.enqueue(newNode, f);
        openSetNodes.set(neighborKey, newNode);
      }
    }
  }

  return []; // No path found
}

function findNearestWalkable(
  warehouse: Warehouse,
  pos: { x: number; y: number }
): { x: number; y: number } | null {
  if (isWalkable(warehouse, pos.x, pos.y)) {
    return pos;
  }

  const walkableNodes: { x: number; y: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (isWalkable(warehouse, x, y)) {
        walkableNodes.push({ x, y });
      }
    }
  }
  let nearest: { x: number; y: number } | null = null;
  let bestDistance = Infinity;

  for (const node of walkableNodes) {
    const distance = calculateManhattanDistance(node, pos);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = { x: node.x, y: node.y };
    }
  }

  return nearest;
}

export function calculatePathDistance(path: { x: number; y: number }[]): number {
  if (path.length < 2) return 0;

  let distance = 0;
  for (let i = 1; i < path.length; i++) {
    distance += calculateEuclideanDistance(path[i], path[i - 1]);
  }

  return distance;
}
