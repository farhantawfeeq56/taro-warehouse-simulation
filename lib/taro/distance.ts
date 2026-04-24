export interface Point2D {
  x: number;
  y: number;
}

export const SQRT2 = Math.sqrt(2);

export function calculateManhattanDistance(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function calculateOctileDistance(a: Point2D, b: Point2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

export function calculateEuclideanDistance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
