// A* Pathfinding algorithm for warehouse routes

import type { Warehouse } from './types';

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
  // Can walk through empty cells and worker start
  // Cannot walk through shelf cells (they contain storage locations at z-levels)
  return cell.type !== 'shelf';
}

function getNeighbors(warehouse: Warehouse, node: Node): { x: number; y: number }[] {
  const directions = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 },  // right
  ];
  
  const neighbors: { x: number; y: number }[] = [];
  
  for (const dir of directions) {
    const nx = node.x + dir.x;
    const ny = node.y + dir.y;
    if (isWalkable(warehouse, nx, ny)) {
      neighbors.push({ x: nx, y: ny });
    }
  }
  
  return neighbors;
}

export function findPath(
  warehouse: Warehouse,
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number }[] {
  // If start or end is on a shelf, find nearest walkable cell
  const actualStart = findNearestWalkable(warehouse, start);
  const actualEnd = findNearestWalkable(warehouse, end);
  
  if (!actualStart || !actualEnd) {
    return [];
  }
  
  const openSet: Node[] = [];
  const closedSet = new Set<string>();
  
  const startNode: Node = {
    x: actualStart.x,
    y: actualStart.y,
    g: 0,
    h: heuristic(actualStart, actualEnd),
    f: heuristic(actualStart, actualEnd),
    parent: null,
  };
  
  openSet.push(startNode);
  
  while (openSet.length > 0) {
    // Get node with lowest f score
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    
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
    
    closedSet.add(`${current.x},${current.y}`);
    
    for (const neighbor of getNeighbors(warehouse, current)) {
      if (closedSet.has(`${neighbor.x},${neighbor.y}`)) {
        continue;
      }
      
      const g = current.g + 1;
      const h = heuristic(neighbor, actualEnd);
      const f = g + h;
      
      const existingNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);
      
      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      } else {
        openSet.push({
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f,
          parent: current,
        });
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
  
  // Search in expanding squares
  for (let radius = 1; radius < Math.max(warehouse.width, warehouse.height); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
          const nx = pos.x + dx;
          const ny = pos.y + dy;
          if (isWalkable(warehouse, nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
  }
  
  return null;
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
