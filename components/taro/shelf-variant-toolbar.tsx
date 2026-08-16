'use client';

/**
 * Shelf visual variant — how shelves (and their stock) are drawn on the
 * warehouse canvas. The segmented control below lets the user flip between
 * render proposals right from the main warehouse screen.
 *
 * The Paper 2×2 tile bay (dark #1C2118, gold/purple/blue/orange circles)
 * is the base language. The variants are the four render strategies:
 *
 * - 'paper'    — the Paper reference as-is: a dark #1C2118 bay holding a
 *                2×2 grid of colored tiles, one tile per stocked bin.
 * - 'big'      — (A) bigger cells: CELL_SIZE is raised so each tile gets
 *                real pixel resolution instead of mush.
 * - 'multicell'— (B) multi-cell bays: each bay spans several cells so it
 *                reads like the Paper mock's tall 4-level column.
 * - 'vector'   — (D) vector/DOM rendering: tiles are drawn as SVG circles
 *                at display resolution instead of a downsampled canvas.
 *
 * Keyboard shortcuts P/A/B/D switch between them (handled in TaroApp).
 * C (the richer-stock idea) is intentionally not included.
 */
export type ShelfVariant = 'paper' | 'big' | 'multicell' | 'vector';

/** Cell size used by the 'big' (A) variant — 32px vs the base 20px. */
export const BIG_CELL_SIZE = 32;

export const SHELF_VARIANTS: { id: ShelfVariant; label: string; shortcut: string }[] = [
  { id: 'paper', label: 'Paper', shortcut: 'P' },
  { id: 'big', label: 'Big Cells', shortcut: 'A' },
  { id: 'multicell', label: 'Multi-Cell', shortcut: 'B' },
  { id: 'vector', label: 'Vector', shortcut: 'D' },
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
