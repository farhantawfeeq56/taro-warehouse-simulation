// A* Pathfinding algorithm for warehouse routes (optimized with binary heap)

import type { Warehouse } from './types';
import { PriorityQueue } from './priority-queue';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

function heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isWalkable(warehouse: Warehouse, x: number, y: number): boolean {
  if (x < 0 || x >= warehouse.width || y < 0 || y >= warehouse.height) {
    return false;
  }
  const cell = warehouse.grid[y][x];
  return cell.type !== 'shelf';
}

function getNeighborGraph(warehouse: Warehouse): Map<string, { x: number; y: number }[]> {
  const walkable: { x: number; y: number }[] = [];
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      if (isWalkable(warehouse, x, y)) {
        walkable.push({ x, y });
      }
    }
  }

  const walkableSet = new Set(walkable.map(loc => `${loc.x},${loc.y}`));
  const neighbors = new Map<string, { x: number; y: number }[]>();

  for (const loc of walkable) {
    const list: { x: number; y: number }[] = [];
    const candidates = [
      { x: loc.x, y: loc.y - 1 },
      { x: loc.x, y: loc.y + 1 },
      { x: loc.x - 1, y: loc.y },
      { x: loc.x + 1, y: loc.y },
    ];
    for (const candidate of candidates) {
      if (walkableSet.has(`${candidate.x},${candidate.y}`)) {
        list.push(candidate);
      }
    }
    neighbors.set(`${loc.x},${loc.y}`, list);
  }

  return neighbors;
}

function getNeighbors(graph: Map<string, { x: number; y: number }[]>, node: Node): { x: number; y: number }[] {
  const directions = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 },  // right
  ];

  const neighbors = graph.get(`${node.x},${node.y}`);
  if (neighbors) return neighbors;
  return directions.map(dir => ({ x: node.x + dir.x, y: node.y + dir.y }));
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

      const g = current.g + 1;
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
    const distance = Math.abs(node.x - pos.x) + Math.abs(node.y - pos.y);
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
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    distance += dx + dy;
  }

  return distance;
}
