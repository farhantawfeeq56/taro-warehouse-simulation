// A* Pathfinding algorithm for warehouse routes (optimized with binary heap)

import type { Warehouse } from './types';
import { PriorityQueue } from './priority-queue';
import { calculateOctileDistance, calculateEuclideanDistance, calculateManhattanDistance } from './distance';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

interface Neighbor {
  x: number;
  y: number;
  cost: number;
}

function heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return calculateOctileDistance(a, b);
}

export function isWalkable(warehouse: Warehouse, x: number, y: number): boolean {
  if (x < 0 || x >= warehouse.width || y < 0 || y >= warehouse.height) {
    return false;
  }
  const cell = warehouse.grid[y][x];
  return cell.type !== 'shelf';
}

function getNeighborGraph(warehouse: Warehouse): Map<string, Neighbor[]> {
  const walkable: { x: number; y: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (isWalkable(warehouse, x, y)) {
        walkable.push({ x, y });
      }
    }
  }

  const walkableSet = new Set(walkable.map(loc => `${loc.x},${loc.y}`));
  const neighbors = new Map<string, Neighbor[]>();

  for (const loc of walkable) {
    const list: Neighbor[] = [];
    
    // Cardinal moves
    const cardinals = [
      { x: loc.x, y: loc.y - 1 },
      { x: loc.x, y: loc.y + 1 },
      { x: loc.x - 1, y: loc.y },
      { x: loc.x + 1, y: loc.y },
    ];
    for (const cand of cardinals) {
      if (walkableSet.has(`${cand.x},${cand.y}`)) {
        list.push({ ...cand, cost: 1 });
      }
    }

    // Diagonal moves
    const diagonals = [
      { x: loc.x - 1, y: loc.y - 1, cx1: loc.x - 1, cy1: loc.y, cx2: loc.x, cy2: loc.y - 1 },
      { x: loc.x + 1, y: loc.y - 1, cx1: loc.x + 1, cy1: loc.y, cx2: loc.x, cy2: loc.y - 1 },
      { x: loc.x - 1, y: loc.y + 1, cx1: loc.x - 1, cy1: loc.y, cx2: loc.x, cy2: loc.y + 1 },
      { x: loc.x + 1, y: loc.y + 1, cx1: loc.x + 1, cy1: loc.y, cx2: loc.x, cy2: loc.y + 1 },
    ];

    for (const d of diagonals) {
      if (walkableSet.has(`${d.x},${d.y}`)) {
        // Corner-cutting prevention: both adjacent cardinal cells must be walkable
        if (walkableSet.has(`${d.cx1},${d.cy1}`) && walkableSet.has(`${d.cx2},${d.cy2}`)) {
          list.push({ x: d.x, y: d.y, cost: Math.SQRT2 });
        }
      }
    }

    neighbors.set(`${loc.x},${loc.y}`, list);
  }

  return neighbors;
}

function getNeighbors(graph: Map<string, Neighbor[]>, node: Node): Neighbor[] {
  const neighbors = graph.get(`${node.x},${node.y}`);
  return neighbors || [];
}

export function findPath(
  warehouse: Warehouse,
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number }[] {
  const neighborGraph = getNeighborGraph(warehouse);
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

    for (const neighbor of getNeighbors(neighborGraph, current)) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;

      if (closedSet.has(neighborKey)) {
        continue;
      }

      const g = current.g + neighbor.cost;
      const h = heuristic(neighbor, actualEnd);
      const f = g + h;

      const existingNode = openSetNodes.get(neighborKey);

      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
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
    const distance = calculateOctileDistance(node, pos);
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
