'use client';

/**
 * Affinity preview — vartest10 (colors only).
 *
 * The layout-config preview is affinity-only (layout & demand views were
 * removed). The rendering is always the same: shelves are solid squares
 * colored by their affinity group, empty shelves stay grey. What changes
 * between variants is ONLY the color mapping — ten different color
 * directions for the same data:
 *
 *   1. Rainbow   — classic golden-angle hue spread (baseline).
 *   2. Pastel    — soft, desaturated tints (better shelf differentiation
 *                  at a glance, calmer).
 *   3. Deep      — dark, saturated tones (strong contrast, heavier).
 *   4. Neon      — electric saturated hues on a dark-ink floor.
 *   5. Cool      — blue–green–teal family only.
 *   6. Warm      — red–orange–yellow family only.
 *   7. Spectrum  — strict hue sweep around the wheel (golden angle removed).
 *   8. Gradient  — groups sorted by size, colored across a fixed ramp
 *                  (blue → teal → green → amber → red).
 *   9. Analogous — neighbouring hues around a fixed base.
 *  10. Mono      — single hue; lightness scales with group id.
 *
 * A floating segmented toolbar sits bottom-right of the preview.
 * Keys 1–9 switch variants, 0 switches to variant 10 (ignored while typing).
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Cell } from '@/lib/taro/types';
import type { ShelfPlacementPreview } from '@/lib/taro/inventory-placement';

export type AffinityColorVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const VARIANT_LABELS: { id: AffinityColorVariant; label: string }[] = [
  { id: 1, label: 'Rainbow' },
  { id: 2, label: 'Pastel' },
  { id: 3, label: 'Deep' },
  { id: 4, label: 'Neon' },
  { id: 5, label: 'Cool' },
  { id: 6, label: 'Warm' },
  { id: 7, label: 'Spectrum' },
  { id: 8, label: 'Gradient' },
  { id: 9, label: 'Analogous' },
  { id: 10, label: 'Mono' },
];

/* ------------------------------------------------------------------------ */
/* Color schemes — one function per variant, same signature                 */
/* ------------------------------------------------------------------------ */

type ColorFn = (groupId: number) => string;

/** Stable golden-angle hue for a group id (the pre-vartest baseline). */
export function groupHue(groupId: number): number {
  return ((groupId * 137.508 + 20) % 360) | 0;
}

const colorSchemes: Record<AffinityColorVariant, ColorFn> = {
  // 1. Rainbow — baseline golden-angle spread, mid saturation/lightness.
  1: (g) => `hsl(${groupHue(g)}, 65%, 50%)`,
  // 2. Pastel — soft tints, low-ish saturation, high lightness.
  2: (g) => `hsl(${groupHue(g)}, 55%, 78%)`,
  // 3. Deep — dark saturated tones.
  3: (g) => `hsl(${groupHue(g)}, 72%, 34%)`,
  // 4. Neon — electric hues; the variant overlay paints the floor near-black.
  4: (g) => `hsl(${groupHue(g)}, 100%, 60%)`,
  // 5. Cool — blue → cyan → teal → green band (90°..200°).
  5: (g) => `hsl(${90 + ((g * 137.508) % 110) | 0}, 65%, 50%)`,
  // 6. Warm — red → orange → yellow band (0°..70°).
  6: (g) => `hsl(${((g * 137.508) % 70) | 0}, 65%, 50%)`,
  // 7. Spectrum — strict 360° sweep, evenly spaced by id.
  7: (g) => `hsl(${(g * 36) % 360}, 65%, 50%)`,
  // 8. Gradient — sorted-by-size groups across a blue→red ramp (size-rank
  //    override in the grid; this fallback only guards direct calls).
  8: (g) => `hsl(${(g * 19) % 220 | 0}, 65%, 50%)`,
  // 9. Analogous — neighbouring hues around a fixed base (220°).
  9: (g) => `hsl(${220 + (g % 5) * 12 - 24}, 65%, 50%)`,
  // 10. Mono — single hue, lightness steps up with group id.
  10: (g) => `hsl(260, 55%, ${(34 + (g % 5) * 13) | 0}%)`,
};

/* ------------------------------------------------------------------------ */
/* Affinity grid                                                             */
/* ------------------------------------------------------------------------ */

export interface AffinityGridProps {
  grid: Cell[][];
  shelfLookup: Map<string, ShelfPlacementPreview>;
  cellSize: number;
  fullWidth: number;
  fullHeight: number;
  variant: AffinityColorVariant;
}

/** Color for an affinity group under the given scheme (0/undefined → grey). */
export function affinityColor(variant: AffinityColorVariant, groupId: number | undefined): string {
  if (groupId == null || groupId <= 0) return '#64748b';
  return colorSchemes[variant](groupId);
}

const EMPTY_SHELF = '#94a3b8';
const NO_ITEM = '#e2e8f0';

/** Blue → teal → green → amber → red ramp positions (0..240). */
const SIZE_RAMP = [0, 38, 76, 114, 152, 190, 220, 240];

/** Rank groups by size (largest = 0) so bigger groups get the hottest color. */
function sizeRank(shelfLookup: Map<string, ShelfPlacementPreview>): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const sp of shelfLookup.values()) {
    if (!sp.active || sp.affinityGroup == null || sp.affinityGroup <= 0) continue;
    sizes.set(sp.affinityGroup, (sizes.get(sp.affinityGroup) ?? 0) + 1);
  }
  const sorted = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(sorted.map(([g], i) => [g, i]));
}

export function AffinityGrid({
  grid,
  shelfLookup,
  cellSize,
  fullWidth,
  fullHeight,
  variant,
}: AffinityGridProps) {
  const isNeon = variant === 4;
  const colorFn = colorSchemes[variant];
  const rank = variant === 8 ? sizeRank(shelfLookup) : null;
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
        cells.push(
          <div
            key={key}
            style={{ ...style, backgroundColor: isNeon ? '#10162b' : undefined }}
            className="relative bg-muted transition-colors duration-200"
          />
        );
        continue;
      }
      const sp = shelfLookup.get(key);
      const group = sp && sp.active ? sp.affinityGroup : undefined;
      let color: string | undefined;
      if (group && group > 0) {
        if (variant === 8 && rank) {
          const r = rank.get(group) ?? 0;
          color = `hsl(${SIZE_RAMP[Math.min(r, SIZE_RAMP.length - 1)]}, 70%, 48%)`;
        } else {
          color = colorFn(group);
        }
      }
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
          ...(isNeon ? { backgroundColor: '#0b0f19', borderColor: '#0b0f19' } : {}),
        }}
      >
        {cells}
      </div>
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
  active: AffinityColorVariant;
  onSelect: (v: AffinityColorVariant) => void;
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

export function AffinityView({
  variant: controlledVariant,
  onVariantChange,
  ...props
}: Omit<AffinityGridProps, 'variant'> & {
  variant?: AffinityColorVariant;
  onVariantChange?: (v: AffinityColorVariant) => void;
}) {
  const [internalVariant, setInternalVariant] = useState<AffinityColorVariant>(1);
  const variant = controlledVariant ?? internalVariant;
  const setVariant = (v: AffinityColorVariant) => {
    if (onVariantChange) onVariantChange(v);
    else setInternalVariant(v);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === '0' || e.key === ')') {
        setVariant(10);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setVariant(n as AffinityColorVariant);
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
