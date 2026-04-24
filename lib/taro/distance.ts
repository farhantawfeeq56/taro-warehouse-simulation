export interface Point2D {
  x: number;
  y: number;
}

export const SQRT2 = Math.sqrt(2);

export function calculateOctileDistance(a: Point2D, b: Point2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

export function calculateStepEdgeCost(a: Point2D, b: Point2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);

  if (dx === 1 && dy === 1) return SQRT2;
  if (dx + dy === 1) return 1;

  return calculateOctileDistance(a, b);
}
