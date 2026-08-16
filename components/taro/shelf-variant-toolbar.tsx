'use client';

/**
 * Shelf visual variant — how shelves (and their stock) are drawn on the
 * warehouse canvas. The segmented control below lets the user flip between
 * render proposals right from the main warehouse screen.
 *
 * - 'current'  — the existing shelf rendering (dark cell + colored z-level
 *                dots / level-mode labels)
 * - 'paper'    — the new Paper mock: a dark #1C2118 bay holding 2×2 rounded
 *                tiles in 4 SKU colors (gold / purple / blue / orange)
 * - 'filled'   — Paper bay, stock rises from the floor (bottom row fills first)
 * - 'stacked'  — Paper bay, one column per SKU (pick-face stacks)
 * - 'isometric'— Paper bay, pseudo-3D extruded faces
 *
 * Keyboard shortcuts 1-5 switch between them (handled in TaroApp).
 */
export type ShelfVariant = 'current' | 'paper' | 'filled' | 'stacked' | 'isometric';

export const SHELF_VARIANTS: { id: ShelfVariant; label: string; shortcut: string }[] = [
  { id: 'current', label: 'Current', shortcut: '1' },
  { id: 'paper', label: 'Paper', shortcut: '2' },
  { id: 'filled', label: 'Filled', shortcut: '3' },
  { id: 'stacked', label: 'Stacked', shortcut: '4' },
  { id: 'isometric', label: 'Isometric', shortcut: '5' },
];

interface ShelfVariantToolbarProps {
  value: ShelfVariant;
  onChange: (variant: ShelfVariant) => void;
}

/**
 * Floating bottom-left segmented control. Sits on top of the React Flow
 * canvas; `nodrag nopan` keeps it clickable while panning/drawing.
 */
export function ShelfVariantToolbar({ value, onChange }: ShelfVariantToolbarProps) {
  return (
    <div
      className="
        nodrag nopan
        absolute bottom-4 left-4 z-50
        flex items-center gap-1 p-1
        bg-white/90 backdrop-blur-sm border border-border rounded-lg shadow-lg
      "
      role="tablist"
      aria-label="Shelf visual variant"
    >
      {SHELF_VARIANTS.map((variant) => (
        <button
          key={variant.id}
          role="tab"
          aria-selected={value === variant.id}
          onClick={() => onChange(variant.id)}
          title={`Shelf variant: ${variant.label} (${variant.shortcut})`}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium
            transition-colors cursor-pointer whitespace-nowrap
            ${value === variant.id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }
          `}
        >
          <kbd
            className={`
              inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[9px] font-semibold
              ${value === variant.id
                ? 'bg-background/20 text-background'
                : 'bg-muted text-muted-foreground'
              }
            `}
          >
            {variant.shortcut}
          </kbd>
          {variant.label}
        </button>
      ))}
    </div>
  );
}
