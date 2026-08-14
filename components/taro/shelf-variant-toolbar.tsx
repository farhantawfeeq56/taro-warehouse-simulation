'use client';

/**
 * Shelf visual variant — how shelves (and their stock) are drawn on the
 * warehouse canvas. The segmented control below lets the user flip between
 * render proposals right from the main warehouse screen.
 */
export type ShelfVariant = 'current' | 'filled' | 'stacked' | 'isometric' | 'topdown';

export const SHELF_VARIANTS: { id: ShelfVariant; label: string }[] = [
  { id: 'current', label: 'Current' },
  { id: 'filled', label: 'Filled' },
  { id: 'stacked', label: 'Stacked' },
  { id: 'isometric', label: 'Isometric' },
  { id: 'topdown', label: 'Top-down' },
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
          title={`Shelf variant: ${variant.label}`}
          className={`
            px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap
            ${value === variant.id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }
          `}
        >
          {variant.label}
        </button>
      ))}
    </div>
  );
}
