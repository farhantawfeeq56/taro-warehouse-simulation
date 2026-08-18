'use client';

/**
 * Affinity preview — vartest10.
 *
 * The layout-config preview is now affinity-only (the layout & demand views
 * were removed). This module renders the affinity floorplan in TEN visual
 * directions — each a different encoding of the same affinity-group data:
 *
 *   1. Flat     — solid group-color fill per shelf (baseline).
 *   2. Zones    — pale wash + inset hue ring, contiguous zones pop.
 *   3. Weight   — intensity scales with group size (bigger = bolder).
 *   4. Dots     — each shelf becomes a colored dot on a quiet grid.
 *   5. Diamonds — shelves render as rotated diamonds.
 *   6. Blobs    — soft radial glow around each group's centroid.
 *   7. Rings    — topo-style contour rings around group centroids.
 *   8. Pulse    — staggered breathing animation per group.
 *   9. Chips    — rounded chips on a tray, shelf gaps emphasized.
 *  10. Links    — nearest-neighbour lines tie each group together.
 *
 * A floating segmented toolbar sits bottom-right of the preview.
 * Keys 1–9 switch variants, 0 switches to variant 10 (ignored while typing).
 */

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Cell } from '@/lib/taro/types';
import type { ShelfPlacementPreview } from '@/lib/taro/inventory-placement';

export type AffinityVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const VARIANT_LABELS: { id: AffinityVariant; label: string }[] = [
  { id: 1, label: 'Flat' },
  { id: 2, label: 'Zones' },
  { id: 3, label: 'Weight' },
  { id: 4, label: 'Dots' },
  { id: 5, label: 'Diamonds' },
  { id: 6, label: 'Blobs' },
  { id: 7, label: 'Rings' },
  { id: 8, label: 'Pulse' },
  { id: 9, label: 'Chips' },
  { id: 10, label: 'Links' },
];

/* ------------------------------------------------------------------------ */
/* Group colors + stats                                                      */
/* ------------------------------------------------------------------------ */

/** Stable hue for an affinity group id. */
export function groupHue(groupId: number): number {
  return ((groupId * 137.508 + 20) % 360) | 0;
}

/** Solid group color — also used by the legend below the preview. */
export function affinityColor(groupId: number | undefined): string {
  if (groupId == null || groupId <= 0) return '#64748b';
  return `hsl(${groupHue(groupId)}, 65%, 50%)`;
}

interface GroupStats {
  id: number;
  hue: number;
  size: number;
  cx: number;
  cy: number;
  shelves: { x: number; y: number }[];
  maxRadius: number;
}

function buildGroupStats(shelfLookup: Map<string, ShelfPlacementPreview>): GroupStats[] {
  const byId = new Map<number, GroupStats>();
  for (const sp of shelfLookup.values()) {
    if (!sp.active || sp.affinityGroup == null || sp.affinityGroup <= 0) continue;
    let g = byId.get(sp.affinityGroup);
    if (!g) {
      g = {
        id: sp.affinityGroup,
        hue: groupHue(sp.affinityGroup),
        size: 0,
        cx: 0,
        cy: 0,
        shelves: [],
        maxRadius: 0,
      };
      byId.set(sp.affinityGroup, g);
    }
    g.size += 1;
    g.cx += sp.x;
    g.cy += sp.y;
    g.shelves.push({ x: sp.x, y: sp.y });
  }
  const groups = [...byId.values()];
  for (const g of groups) {
    g.cx /= g.size;
    g.cy /= g.size;
    let maxR = 0;
    for (const s of g.shelves) {
      const r = Math.hypot(s.x - g.cx, s.y - g.cy);
      if (r > maxR) maxR = r;
    }
    g.maxRadius = maxR;
  }
  return groups;
}

/* ------------------------------------------------------------------------ */
/* Affinity grid                                                             */
/* ------------------------------------------------------------------------ */

export interface AffinityViewProps {
  grid: Cell[][];
  shelfLookup: Map<string, ShelfPlacementPreview>;
  cellSize: number;
  fullWidth: number;
  fullHeight: number;
  variant: AffinityVariant;
}

const EMPTY_SHELF = '#94a3b8';
const NO_ITEM = '#e2e8f0';

export function AffinityGrid({
  grid,
  shelfLookup,
  cellSize,
  fullWidth,
  fullHeight,
  variant,
}: AffinityViewProps) {
  const groups = useMemo(() => buildGroupStats(shelfLookup), [shelfLookup]);
  const sizeByGroup = useMemo(() => new Map(groups.map((g) => [g.id, g.size])), [groups]);
  const maxSize = useMemo(() => Math.max(1, ...groups.map((g) => g.size)), [groups]);

  // Grid box geometry (border 1px + padding 1px each side, 1px gaps).
  const step = cellSize + 1;
  const boxOffset = 2;
  const gridW = fullWidth * step + 3;
  const gridH = fullHeight * step + 3;
  const center = (x: number, y: number) => ({
    x: boxOffset + x * step + cellSize / 2,
    y: boxOffset + y * step + cellSize / 2,
  });

  const cells = [];
  for (let y = 0; y < fullHeight; y++) {
    for (let x = 0; x < fullWidth; x++) {
      const cell = grid[y][x];
      const key = `${x}-${y}`;
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
      const color = group ? affinityColor(group) : undefined;
      const hue = group ? groupHue(group) : 210;

      switch (variant) {
        case 1:
          cells.push(
            <div
              key={key}
              style={{ ...style, backgroundColor: color ?? EMPTY_SHELF }}
              className="relative transition-colors duration-200"
            />
          );
          break;
        case 2:
          cells.push(
            <div
              key={key}
              style={{
                ...style,
                backgroundColor: group ? `hsl(${hue}, 60%, 90%)` : NO_ITEM,
                boxShadow: color ? `inset 0 0 0 1.5px ${color}` : undefined,
              }}
              className="relative transition-colors duration-200"
            />
          );
          break;
        case 3: {
          const t = group ? (sizeByGroup.get(group) ?? 0) / maxSize : 0;
          cells.push(
            <div
              key={key}
              style={{
                ...style,
                backgroundColor: group ? `hsl(${hue}, ${40 + t * 35}%, ${64 - t * 24}%)` : NO_ITEM,
              }}
              className="relative transition-colors duration-200"
            />
          );
          break;
        }
        case 4:
          cells.push(
            <div
              key={key}
              style={{ ...style, backgroundColor: NO_ITEM }}
              className="relative flex items-center justify-center transition-colors duration-200"
            >
              {color && (
                <div
                  className="rounded-full"
                  style={{ width: cellSize * 0.55, height: cellSize * 0.55, backgroundColor: color }}
                />
              )}
            </div>
          );
          break;
        case 5:
          cells.push(
            <div
              key={key}
              style={{ ...style, backgroundColor: NO_ITEM }}
              className="relative flex items-center justify-center transition-colors duration-200"
            >
              {color && (
                <div
                  className="rounded-sm"
                  style={{
                    width: cellSize * 0.6,
                    height: cellSize * 0.6,
                    backgroundColor: color,
                    transform: 'rotate(45deg)',
                  }}
                />
              )}
            </div>
          );
          break;
        case 8:
          cells.push(
            <div
              key={key}
              style={{
                ...style,
                backgroundColor: color ?? EMPTY_SHELF,
                animationDelay: group ? `${((group % 10) * 0.18).toFixed(2)}s` : '0s',
              }}
              className={`relative transition-colors duration-200 ${group ? 'animate-pulse' : ''}`}
            />
          );
          break;
        case 9:
          cells.push(
            <div
              key={key}
              style={{ ...style, backgroundColor: NO_ITEM }}
              className="relative flex items-center justify-center transition-colors duration-200"
            >
              {color && (
                <div
                  className="rounded-[4px]"
                  style={{
                    width: cellSize - Math.max(2, Math.round(cellSize * 0.16)) * 2,
                    height: cellSize - Math.max(2, Math.round(cellSize * 0.16)) * 2,
                    backgroundColor: color,
                  }}
                />
              )}
            </div>
          );
          break;
        default: // 6, 7, 10 — quiet floor, the SVG overlay carries the encoding
          cells.push(
            <div
              key={key}
              style={{ ...style, backgroundColor: group ? `hsl(${hue}, 60%, 93%)` : NO_ITEM }}
              className="relative transition-colors duration-200"
            />
          );
          break;
      }
    }
  }

  const svg =
    groups.length > 0 && (variant === 6 || variant === 7 || variant === 10) ? (
      <svg className="pointer-events-none absolute inset-0" viewBox={`0 0 ${gridW} ${gridH}`}>
        {variant === 6 &&
          groups.map((g) => {
            const c = center(g.cx, g.cy);
            const r = Math.max(cellSize * 1.4, g.maxRadius * step + cellSize);
            const id = `av-blob-${g.id}`;
            return (
              <g key={g.id}>
                <defs>
                  <radialGradient id={id}>
                    <stop offset="0%" stopColor={`hsl(${g.hue}, 70%, 55%)`} stopOpacity="0.6" />
                    <stop offset="65%" stopColor={`hsl(${g.hue}, 70%, 55%)`} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={`hsl(${g.hue}, 70%, 55%)`} stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx={c.x} cy={c.y} r={r} fill={`url(#${id})`} />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={Math.max(2, cellSize * 0.9)}
                  fill={`hsl(${g.hue}, 70%, 48%)`}
                />
              </g>
            );
          })}
        {variant === 7 &&
          groups.map((g) => {
            const c = center(g.cx, g.cy);
            const rings = Math.max(2, Math.ceil(g.maxRadius / 2));
            return (
              <g key={g.id}>
                {Array.from({ length: rings }, (_, i) => (
                  <circle
                    key={i}
                    cx={c.x}
                    cy={c.y}
                    r={(i + 1) * step * 1.4}
                    fill="none"
                    stroke={`hsl(${g.hue}, 65%, 45%)`}
                    strokeWidth={1.4}
                    strokeOpacity={Math.max(0.08, 0.55 - i * 0.09)}
                  />
                ))}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={Math.max(2, cellSize * 0.7)}
                  fill={`hsl(${g.hue}, 65%, 45%)`}
                />
              </g>
            );
          })}
        {variant === 10 &&
          groups.map((g) => (
            <g
              key={g.id}
              fill="none"
              stroke={`hsl(${g.hue}, 60%, 48%)`}
              strokeWidth={1.5}
              strokeOpacity={0.85}
            >
              {g.shelves.map((s, i) => {
                let best: { x: number; y: number } | null = null;
                let bestD = Infinity;
                for (const t of g.shelves) {
                  if (t === s) continue;
                  const d = (t.x - s.x) ** 2 + (t.y - s.y) ** 2;
                  if (d < bestD) {
                    bestD = d;
                    best = t;
                  }
                }
                if (!best) return null;
                const a = center(s.x, s.y);
                const b = center(best.x, best.y);
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
              {g.shelves.map((s, i) => {
                const c = center(s.x, s.y);
                return (
                  <circle
                    key={`dot${i}`}
                    cx={c.x}
                    cy={c.y}
                    r={Math.max(1.5, cellSize * 0.32)}
                    fill={`hsl(${g.hue}, 70%, 48%)`}
                    stroke="none"
                  />
                );
              })}
            </g>
          ))}
      </svg>
    ) : null;

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
      {svg}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Floating toolbar + view (variant state, keyboard 1–9, 0 = 10)             */
/* ------------------------------------------------------------------------ */

/** Floating segmented toolbar — bottom-right, keyboard-driven (1–9, 0 = 10). */
function AffinityToolbar({
  active,
  onSelect,
}: {
  active: AffinityVariant;
  onSelect: (v: AffinityVariant) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-0.5 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
      {VARIANT_LABELS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onSelect(v.id)}
          title={`${v.label} (${v.id})`}
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold transition-colors ${
            active === v.id
              ? 'bg-accent text-accent-soft'
              : 'text-text-muted hover:bg-muted hover:text-text-primary'
          }`}
        >
          {v.id === 10 ? '0' : v.id}
        </button>
      ))}
    </div>
  );
}

export function AffinityView(props: Omit<AffinityViewProps, 'variant'>) {
  const [variant, setVariant] = useState<AffinityVariant>(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === '0' || e.key === ')') {
        setVariant(10);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setVariant(n as AffinityVariant);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-1">
      <AffinityGrid {...props} variant={variant} />
      <AffinityToolbar active={variant} onSelect={setVariant} />
    </div>
  );
}
