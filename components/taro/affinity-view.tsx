'use client';

/**
 * Affinity preview — final (variant 10, Mono).
 *
 * The layout-config preview is affinity-only (layout & demand views were
 * removed). Shelves are solid squares colored by their affinity group;
 * empty shelves stay grey. The chosen color direction is MONO: a single
 * hue (violet) with lightness stepping with the group id, so distinct
 * groups read as distinct shades rather than a rainbow.
 *
 *   hue        → fixed 260°
 *   lightness  → 34% + (group % 5) × 13  (34, 47, 60, 73, 86%)
 *   saturation → 55%
 */

import type { CSSProperties } from 'react';
import type { Cell } from '@/lib/taro/types';
import type { ShelfPlacementPreview } from '@/lib/taro/inventory-placement';

/** Color for an affinity group under the Mono scheme (0/undefined → grey). */
export function affinityColor(groupId: number | undefined): string {
  if (groupId == null || groupId <= 0) return '#64748b';
  const lightness = 34 + (groupId % 5) * 13;
  return `hsl(260, 55%, ${lightness}%)`;
}

const EMPTY_SHELF = '#94a3b8';
const NO_ITEM = '#e2e8f0';

export interface AffinityGridProps {
  grid: Cell[][];
  shelfLookup: Map<string, ShelfPlacementPreview>;
  cellSize: number;
  fullWidth: number;
  fullHeight: number;
}

export function AffinityGrid({
  grid,
  shelfLookup,
  cellSize,
  fullWidth,
  fullHeight,
}: AffinityGridProps) {
  const cells = [];
  for (let y = 0; y < fullHeight; y++) {
    for (let x = 0; x < fullWidth; x++) {
      const cell = grid[y][x];
      const key = `${x},${y}`;
      const style: CSSProperties = { width: cellSize, height: cellSize };
      if (cell.type === 'worker-start') {
        cells.push(<div key={key} style={style} className="relative bg-warning" />);
        continue;
      }
      if (cell.type !== 'shelf') {
        cells.push(<div key={key} style={style} className="relative bg-muted" />);
        continue;
      }
      const sp = shelfLookup.get(key);
      const group = sp && sp.active ? sp.affinityGroup : undefined;
      const color = group && group > 0 ? affinityColor(group) : undefined;
      cells.push(
        <div
          key={key}
          style={{ ...style, backgroundColor: color ?? (group == null ? EMPTY_SHELF : NO_ITEM) }}
          className="relative transition-colors duration-200"
        />
      );
    }
  }

  return (
    <div className="relative w-max">
      <div
        className="grid gap-px border border-border bg-border shadow-inner p-px rounded-sm"
        style={{
          gridTemplateColumns: `repeat(${fullWidth}, ${cellSize}px)`,
          width: 'max-content',
        }}
      >
        {cells}
      </div>
    </div>
  );
}
