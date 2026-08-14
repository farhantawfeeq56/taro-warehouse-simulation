'use client';

import { useState } from 'react';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  FEAT123 — Shelf visual variants (test screen)
 *
 *  The snippet below is the CURRENT warehouse-shelf render, lifted verbatim
 *  from Paper. Each "variant" is a proposal for how a single shelf should
 *  look on the warehouse canvas. Use the segmented control to flip between
 *  them and judge which reads best at a glance.
 * ─────────────────────────────────────────────────────────────────────────
 */

type VariantId = 'current' | 'filled' | 'stacked' | 'isometric' | 'topdown';

interface VariantDef {
  id: VariantId;
  label: string;
  description: string;
  idea?: boolean;
}

const VARIANTS: VariantDef[] = [
  {
    id: 'current',
    label: 'Current',
    description: 'The exact render we ship today — a vertical 2×2 shelf with the dark bay + colored SKU tiles.',
  },
  {
    id: 'filled',
    label: 'Filled',
    description: 'Same shelf geometry, but tiles fill bottom-up like stock on a real shelf.',
  },
  {
    id: 'stacked',
    label: 'Stacked',
    description: 'One shelf column per SKU, stacked up to 4 deep — reads like a pick-face at a glance.',
  },
  {
    id: 'isometric',
    label: 'Isometric',
    description: 'A 3D-ish shelf; each level drawn as its own face with depth.',
    idea: true,
  },
  {
    id: 'topdown',
    label: 'Top-down',
    description: 'A top-down bay view — like looking into a tote from above.',
    idea: true,
  },
];

// Palette used by the Paper render and shared by all variants.
const C = {
  dark: '#1C2118',
  gold: '#D6A83D',
  purple: '#8A70A8',
  blue: '#5B8DB8',
  orange: '#C87555',
} as const;

/**
 * Current render — verbatim from Paper (with structural comments).
 * Each bay is a 2×2 grid; empty slots are left as the dark bay color.
 */
function ShelfCurrent() {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      <div className="w-3 h-4 left-4.75 top-4.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118]">
        <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#D6A83D]" />
        <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#8A70A8]" />
        <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#5B8DB8]" />
        <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#C87555]" />
      </div>
      <div className="w-3 h-4 left-4.75 top-22.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118]">
        <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#D6A83D]" />
        <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#8A70A8]" />
        <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
      </div>
      <div className="w-3 h-4 left-4.75 top-40.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118]">
        <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
      </div>
      <div className="w-3 h-4 left-4.75 top-13.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118]">
        <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#D6A83D]" />
        <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#8A70A8]" />
        <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#5B8DB8]" />
        <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
      </div>
      <div className="w-3 h-4 left-4.75 top-31.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118]">
        <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#D6A83D]" />
        <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
        <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs bg-[#1C2118]" />
      </div>
    </div>
  );
}

/** Reusable 2×2 bay with explicit per-slot colors. */
function Bay({ slots, className = '' }: { slots: [string, string, string, string]; className?: string }) {
  return (
    <div
      className={`w-3 h-4 left-4.75 grid grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] py-1 px-0.5 rounded-xs overflow-clip gap-0.5 absolute bg-[#1C2118] ${className}`}
    >
      <div className="h-full col-start-1 col-end-auto row-start-1 row-end-auto rounded-xs" style={{ backgroundColor: slots[0] }} />
      <div className="h-full col-start-2 col-end-auto row-start-1 row-end-auto rounded-xs" style={{ backgroundColor: slots[1] }} />
      <div className="h-full col-start-1 col-end-auto row-start-2 row-end-auto rounded-xs" style={{ backgroundColor: slots[2] }} />
      <div className="h-full col-start-2 col-end-auto row-start-2 row-end-auto rounded-xs" style={{ backgroundColor: slots[3] }} />
    </div>
  );
}

/** Filled — same bay grid, but stock sits at the BOTTOM (like a real shelf). */
function ShelfFilled() {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      {/* Bay 1 (top): bottom row full, top row empty */}
      <Bay slots={[C.dark, C.dark, C.gold, C.purple]} className="top-4.75" />
      {/* Bay 2: single SKU in the bottom-left slot */}
      <Bay slots={[C.dark, C.dark, C.blue, C.dark]} className="top-22.75" />
      {/* Bay 3 (bottom): fully empty */}
      <Bay slots={[C.dark, C.dark, C.dark, C.dark]} className="top-40.75" />
      {/* Bay 4: two SKUs bottom, one top-left */}
      <Bay slots={[C.gold, C.dark, C.blue, C.orange]} className="top-13.75" />
      {/* Bay 5: one SKU bottom-left */}
      <Bay slots={[C.dark, C.dark, C.gold, C.dark]} className="top-31.75" />
    </div>
  );
}

/**
 * Stacked — each bay is a single SKU column 4 levels deep (2×2 per level).
 * Reads as a pick-face: tall = more stock.
 */
function StackedBay({ sku, count, className = '' }: { sku: string; count: number; className?: string }) {
  return (
    <div className={`w-3 h-16 left-4.75 grid grid-rows-4 gap-0.5 rounded-xs overflow-clip absolute bg-[#1C2118] ${className}`}>
      {[0, 1, 2, 3].map((level) => (
        <div key={level} className="grid grid-cols-2 gap-0.5 px-0.5 py-0.5">
          <div className="rounded-xs" style={{ backgroundColor: level < count ? sku : C.dark }} />
          <div className="rounded-xs" style={{ backgroundColor: level < count ? sku : C.dark }} />
        </div>
      ))}
    </div>
  );
}

function ShelfStacked() {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      {/* Two SKU columns, stacked 4 deep */}
      <StackedBay sku={C.gold} count={4} className="top-4.75" />
      <StackedBay sku={C.purple} count={2} className="top-22.75" />
      <StackedBay sku={C.blue} count={3} className="top-40.75" />
    </div>
  );
}

/**
 * Isometric-ish — each shelf level is its own extruded face with a side for
 * depth, giving a pseudo-3D rack look.
 */
function IsometricBay({ sku, count, className = '' }: { sku: string; count: number; className?: string }) {
  return (
    <div className={`w-9 h-5 left-3 top-3 flex absolute ${className}`}>
      <div className="flex flex-col gap-0.5 h-5 w-6 rounded-l-[3px] overflow-hidden bg-[#1C2118] p-0.5">
        {[0, 1, 2].map((level) => (
          <div key={level} className="flex-1 rounded-[2px]" style={{ backgroundColor: level < count ? sku : C.dark }} />
        ))}
      </div>
      <div className="h-5 w-3 bg-[#14181a] rounded-r-[3px] ml-0.5" style={{ transform: 'skewY(18deg)', transformOrigin: 'bottom' }} />
    </div>
  );
}

function ShelfIsometric() {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      <IsometricBay sku={C.gold} count={3} className="top-1.5 left-1.5" />
      <IsometricBay sku={C.purple} count={1} className="top-12 left-1.5" />
      <IsometricBay sku={C.blue} count={2} className="top-22.5 left-1.5" />
      <IsometricBay sku={C.orange} count={2} className="top-33 left-1.5" />
      <IsometricBay sku={C.gold} count={1} className="top-43.5 left-1.5" />
    </div>
  );
}

/** Top-down — a bay as a 2×2 grid of totes with a subtle inner shadow. */
function TopDownBay({ slots, className = '' }: { slots: [string, string, string, string]; className?: string }) {
  return (
    <div className={`w-10 h-10 left-1.5 grid grid-cols-2 grid-rows-2 gap-0.5 rounded-[6px] p-0.5 absolute bg-[#14181a] ${className}`}>
      {slots.map((color, i) => (
        <div
          key={i}
          className="rounded-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ShelfTopDown() {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      <TopDownBay slots={[C.gold, C.purple, C.blue, C.orange]} className="top-1.5" />
      <TopDownBay slots={[C.gold, C.purple, C.dark, C.dark]} className="top-14" />
      <TopDownBay slots={[C.dark, C.dark, C.dark, C.dark]} className="top-26.5" />
      <TopDownBay slots={[C.gold, C.dark, C.blue, C.orange]} className="top-39" />
    </div>
  );
}

export function ShelfVisualVariantsTest() {
  const [active, setActive] = useState<VariantId>('current');

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#009966] mb-2">
            <span>feat123</span>
            <span className="text-[#C7C7C7]">/</span>
            <span>shelf visual variants</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#0A0A0A] mb-1.5">Warehouse Shelf — visual variants</h1>
          <p className="text-sm text-[#6B6B6B]">
            The snippet below is the current shelf render. Test 5 proposals — pick what reads best on the canvas.
          </p>
        </div>

        {/* Segmented control */}
        <div
          className="flex gap-1 p-1 w-full rounded-[10px] border border-[#E7E8EC] bg-white mb-8"
          role="tablist"
          aria-label="Shelf variant"
        >
          {VARIANTS.map((variant) => (
            <button
              key={variant.id}
              role="tab"
              aria-selected={active === variant.id}
              onClick={() => setActive(variant.id)}
              className={`
                flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-[8px] text-[12px] font-medium
                transition-colors cursor-pointer
                ${active === variant.id
                  ? 'bg-[#0A0A0A] text-white'
                  : 'bg-transparent text-[#6B6B6B] hover:bg-[#F3F3F0] hover:text-[#0A0A0A]'
                }
              `}
            >
              <span>{variant.label}</span>
              {variant.idea && (
                <span
                  className={`
                    text-[9px] uppercase tracking-wide font-semibold px-1.5 py-px rounded-full
                    ${active === variant.id
                      ? 'bg-white/20 text-white'
                      : 'bg-[#009966]/10 text-[#009966]'
                    }
                  `}
                >
                  idea
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Preview card */}
        <div className="rounded-[12px] border border-[#E7E8EC] bg-white p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-semibold text-[#0A0A0A]">
              {VARIANTS.find((v) => v.id === active)?.label}
            </h2>
            <span className="text-[11px] text-[#B0B0B0] font-mono">5 options</span>
          </div>

          <div className="flex items-start justify-center gap-8">
            <div
              key={active}
              className="p-6 rounded-[10px] border border-[#F0F0ED] bg-[#FAFAF7] shadow-sm"
            >
              {active === 'current' && <ShelfCurrent />}
              {active === 'filled' && <ShelfFilled />}
              {active === 'stacked' && <ShelfStacked />}
              {active === 'isometric' && <ShelfIsometric />}
              {active === 'topdown' && <ShelfTopDown />}
            </div>
            <p className="text-sm text-[#6B6B6B] max-w-[220px] leading-relaxed pt-2">
              {VARIANTS.find((v) => v.id === active)?.description}
            </p>
          </div>
        </div>

        {/* Raw current code, verbatim */}
        <details className="rounded-[12px] border border-[#E7E8EC] bg-white overflow-hidden">
          <summary className="px-4 py-3 text-[12px] font-medium text-[#0A0A0A] cursor-pointer select-none hover:bg-[#FAFAF7]">
            Current shelf render — source snippet
          </summary>
          <pre className="text-[11px] leading-relaxed text-[#4A4A4A] overflow-x-auto p-4 bg-[#FAFAF7] border-t border-[#F0F0ED] font-mono">
{`/**
 * from Paper
 * https://app.paper.design/file/01KY9SN984078K9G5ZGWSAVFJ2/1-0/5L6-0
 * on Aug 14, 2026
 */
export default function () {
  return (
    <div className="w-13 h-50 relative rounded-[5px] overflow-clip">
      ... (2×2 bays, 4 SKU tiles, dark bay bg)
    </div>
  );
}`}
          </pre>
        </details>
      </div>
    </div>
  );
}
