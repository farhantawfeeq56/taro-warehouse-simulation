export interface Point2D {
  x: number;
  y: number;
}

// 4-directional (Manhattan) distance helpers.
// All legal moves are orthogonal, so every step costs exactly 1.

/** Manhattan distance - admissible heuristic for 4-directional A*. */
export function calculateManhattanDistance(a: Point2D, b: Point2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy;
}

/** Cost of a single grid step. Always 1 for orthogonal movement. */
export function calculateStepEdgeCost(a: Point2D, b: Point2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy;
}
