export interface Point2D {
  x: number;
  y: number;
}

export function calculateManhattanDistance(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
