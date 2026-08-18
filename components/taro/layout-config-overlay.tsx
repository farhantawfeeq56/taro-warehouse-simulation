'use client';

/**
 * Warehouse Layout Config — final design (vartest5, variant 4: Split Deck).
 *
 * Left sidebar: three stacked cards (Geometry / Inventory / Placement).
 * Only ONE card is open at a time — opening one closes the others.
 * Each card contains plain sliders with small descriptions — no fancy
 * graphics. Right side: the live warehouse preview, which ALWAYS fits the
 * screen regardless of warehouse size.
 *
 * Constraints:
 *   • Fishbone is removed entirely.
 *   • No layout types — just a single geometry config.
 *   • Cross-aisle slider: default 1, range 0–4 (0 = plain parallel).
 */

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { X, Layout, Loader2, ChevronRight, Warehouse, Package, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Item } from '@/lib/taro/types';
import type { ShelfPlacementPreview } from '@/lib/taro/inventory-placement';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import {
  computePlacementPreview,
  PREVIEW_MAX_ITEMS,
} from '@/lib/taro/inventory-placement';
import { generateCrossAisleLayout } from '@/lib/taro/layout-generator';
import {
  generateDemandScores,
  summarizeDemandScores,
} from '@/lib/taro/demand';
import {
  generateAffinityGroups,
  summarizeAffinityGroups,
} from '@/lib/taro/affinity';
import { assignProductCategory } from '@/lib/taro/categories';
import {
  generateFootprints,
  summarizeFootprints,
} from '@/lib/taro/footprint';
import { PreviewStats } from './layout-config-variants';
import { AffinityView, affinityColor, type AffinityColorVariant } from './affinity-view-variants';

export interface LayoutConfig {
  gridHeight: number;
  rackCount: number;
  aisleWidth: number;
  crossAisleCount: number;
  /** Generated inventory (one Item per SKU, with demandScore). */
  inventory: Item[];
  /** Slotting Bias slider value, 0 (Random) .. 100 (Demand-Based). */
  slottingBias: number;
  /** Category Clustering slider value, 0 (Scattered) .. 100 (Clustered). */
  categoryClustering: number;
  /** Storage Footprint slider value, 0 (Compact) .. 100 (Bulky). */
  storageFootprint: number;
  /** Demand Distribution slider value, 0 (Uniform) .. 100 (Pareto). */
  demandDistribution: number;
  /** Product Affinity slider value, 0 (Independent) .. 100 (Highly Related). */
  productAffinity: number;
}

interface LayoutConfigOverlayProps {
  onClose: () => void;
  onApply?: (config: LayoutConfig) => void;
  /** When false, the close button is hidden — user must generate a warehouse. */
  canClose?: boolean;
  /** When provided, the overlay pre-populates all controls from this config. */
  initialConfig?: WarehouseConfiguration;
  /** When true, the Apply button is disabled and shows a spinner. */
  isGenerating?: boolean;
}

type CardId = 'geometry' | 'inventory' | 'placement';

/** Piecewise-adaptive step for Grid Height (4–60). */
function getHeightStep(v: number): number {
  if (v <= 20) return 1;
  if (v <= 50) return 2;
  return 5;
}

/** Piecewise-adaptive step for Rack Count (5–60). */
function getRackStep(v: number): number {
  if (v <= 20) return 1;
  if (v <= 50) return 2;
  return 5;
}

/** A plain labeled slider with a small description. */
function PlainSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  low,
  high,
  description,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  low?: string;
  high?: string;
  description?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
        <span className="text-xs font-mono text-text-primary bg-muted px-1.5 py-0.5 rounded">
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
        className="layout-variant-range"
      />
      {(low || high) && (
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
      {description && (
        <p className="text-[11px] text-text-muted leading-snug">{description}</p>
      )}
    </div>
  );
}

export function LayoutConfigOverlay({ onClose, onApply, canClose = true, initialConfig, isGenerating = false }: LayoutConfigOverlayProps) {
  const isEditing = initialConfig != null;

  // ── Geometry state ─────────────────────────────────────────────────────
  const [gridHeight, setGridHeight] = useState(initialConfig?.layout.gridHeight ?? 30);
  const [debouncedGridHeight, setDebouncedGridHeight] = useState(initialConfig?.layout.gridHeight ?? 30);
  const [rackCount, setRackCount] = useState(initialConfig?.layout.rackCount ?? 30);
  const [debouncedRackCount, setDebouncedRackCount] = useState(initialConfig?.layout.rackCount ?? 30);
  const [aisleWidth, setAisleWidth] = useState(initialConfig?.layout.aisleWidth ?? 2);
  const [crossAisleCount, setCrossAisleCount] = useState(initialConfig?.layout.crossAisleCount ?? 1);

  // 200 ms debounce while dragging.
  const gridTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGridChange = (v: number) => {
    setGridHeight(v);
    if (gridTimer.current) clearTimeout(gridTimer.current);
    gridTimer.current = setTimeout(() => setDebouncedGridHeight(v), 200);
  };
  const handleRackChange = (v: number) => {
    setRackCount(v);
    if (rackTimer.current) clearTimeout(rackTimer.current);
    rackTimer.current = setTimeout(() => setDebouncedRackCount(v), 200);
  };

  // ── Inventory pipeline ─────────────────────────────────────────────────
  type BaseItem = Pick<Item, 'id'>;

  const generateItems = useCallback((count: number): BaseItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `SKU_${String(i + 1).padStart(3, '0')}`,
    }));
  }, []);

  const assignDemandDistribution = useCallback(
    (items: BaseItem[], distribution: number): Item[] => {
      if (items.length === 0) return [];
      const scores = generateDemandScores({ count: items.length, distribution });
      const minQty = 10;
      const maxQty = 250;
      return items.map((item, i) => {
        const demandScore = scores[i];
        const totalQuantity = minQty + Math.round((demandScore / 10) * (maxQty - minQty));
        return { ...item, demandScore, totalQuantity };
      });
    },
    []
  );

  const assignProductAffinity = useCallback(
    (items: Item[], affinity: number): Item[] => {
      if (items.length === 0) return items;
      const groups = generateAffinityGroups({ count: items.length, affinity });
      return items.map((item, i) => ({ ...item, affinityGroup: groups[i] }));
    },
    []
  );

  const assignStorageFootprint = useCallback(
    (items: Item[], footprint: number): Item[] => {
      if (items.length === 0) return items;
      const footprints = generateFootprints({ count: items.length, footprint });
      return items.map((item, i) => ({ ...item, storageFootprint: footprints[i] }));
    },
    []
  );

  const [skuCount, setSkuCount] = useState(initialConfig?.inventory.skuCount ?? 2500);
  const [demandDistribution, setDemandDistribution] = useState(initialConfig?.inventory.demandDistribution ?? 0);
  const [productAffinity, setProductAffinity] = useState(initialConfig?.inventory.productAffinity ?? 0);
  const [storageFootprint, setStorageFootprint] = useState(initialConfig?.inventory.storageFootprint ?? 0);
  const [slottingBias, setSlottingBias] = useState(initialConfig?.placement.slottingBias ?? 0);
  const [categoryClustering, setCategoryClustering] = useState(initialConfig?.placement.categoryClustering ?? 0);
  const [inventory, setInventory] = useState<Item[]>(() => {
    const initCount = initialConfig?.inventory.skuCount ?? 2500;
    const initDD = initialConfig?.inventory.demandDistribution ?? 0;
    const initPA = initialConfig?.inventory.productAffinity ?? 0;
    const initSF = initialConfig?.inventory.storageFootprint ?? 0;
    return assignStorageFootprint(
      assignProductCategory(
        assignProductAffinity(assignDemandDistribution(generateItems(initCount), initDD), initPA)
      ),
      initSF
    );
  });


  useEffect(() => {
    setInventory(
      assignStorageFootprint(
        assignProductCategory(
          assignProductAffinity(
            assignDemandDistribution(generateItems(skuCount), demandDistribution),
            productAffinity
          )
        ),
        storageFootprint
      )
    );
  }, [skuCount, demandDistribution, productAffinity, storageFootprint, generateItems, assignDemandDistribution, assignProductAffinity, assignStorageFootprint]);

  const [affinityVariant, setAffinityVariant] = useState<AffinityColorVariant>(1);

  const demandSummary = useMemo(
    () => summarizeDemandScores(inventory.map((i) => i.demandScore ?? 0), 0.2),
    [inventory]
  );

  const affinitySummary = useMemo(
    () => summarizeAffinityGroups(inventory.map((i) => i.affinityGroup ?? 0)),
    [inventory]
  );

  const footprintSummary = useMemo(
    () => summarizeFootprints(inventory.map((i) => i.storageFootprint ?? 1)),
    [inventory]
  );

  // ── Preview measurement (callback ref re-attaches on remount) ──────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const setPreviewRef = useCallback((node: HTMLDivElement | null) => {
    const prev = containerRef.current as (HTMLDivElement & { __layoutObserver?: ResizeObserver }) | null;
    prev?.__layoutObserver?.disconnect();
    prev?.__layoutObserver && delete (prev as { __layoutObserver?: ResizeObserver }).__layoutObserver;

    containerRef.current = node;
    if (!node) return;
    const measure = () => {
      setContainerSize({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    (node as HTMLDivElement & { __layoutObserver?: ResizeObserver }).__layoutObserver = observer;
  }, []);

  // ── Warehouse + placement previews ─────────────────────────────────────
  const previewWarehouse = useMemo(
    () => generateCrossAisleLayout(debouncedGridHeight, debouncedRackCount, aisleWidth, crossAisleCount),
    [debouncedGridHeight, debouncedRackCount, aisleWidth, crossAisleCount]
  );

  const fullWidth = previewWarehouse.width;
  const fullHeight = previewWarehouse.height;

  const placementPreview = useMemo(
    () =>
      computePlacementPreview(previewWarehouse, {
        items: inventory,
        slottingBias,
        categoryClustering,
        previewMaxItems: PREVIEW_MAX_ITEMS,
      }),
    [previewWarehouse, inventory, slottingBias, categoryClustering]
  );

  const cellSize = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return 16;
    const padding = 24;
    const availableWidth = Math.max(1, containerSize.width - padding);
    const availableHeight = Math.max(1, containerSize.height - padding);
    const optimalWidth = (availableWidth - (fullWidth - 1)) / fullWidth;
    const optimalHeight = (availableHeight - (fullHeight - 1)) / fullHeight;
    const fit = Math.min(optimalWidth, optimalHeight);
    return Math.max(1, Math.min(40, Math.floor(fit)));
  }, [containerSize, fullWidth, fullHeight]);

  const shelfLookup = useMemo(() => {
    const map = new Map<string, ShelfPlacementPreview>();
    for (const s of placementPreview.shelves) {
      map.set(`${s.x},${s.y}`, s);
    }
    return map;
  }, [placementPreview.shelves]);

  const handleApply = async () => {
    const config: LayoutConfig = {
      gridHeight: debouncedGridHeight,
      rackCount: debouncedRackCount,
      aisleWidth,
      crossAisleCount,
      inventory,
      slottingBias,
      categoryClustering,
      storageFootprint,
      demandDistribution,
      productAffinity,
    };
    await onApply?.(config);
    onClose();
  };

  // ── One-card-open accordion state (may be fully closed) ───────────────
  const [openCard, setOpenCard] = useState<CardId | null>('geometry');

  const cards: { id: CardId; title: string; icon: typeof Warehouse; subtitle: string }[] = [
    { id: 'geometry', title: 'Geometry', icon: Warehouse, subtitle: 'Racks, aisles & thoroughfares' },
    { id: 'inventory', title: 'Inventory', icon: Package, subtitle: 'Catalogue, demand & affinity' },
    { id: 'placement', title: 'Placement', icon: Boxes, subtitle: 'Slotting & zoning' },
  ];

  const renderCardBody = (id: CardId) => {
    switch (id) {
      case 'geometry':
        return (
          <div className="space-y-4">
            <PlainSlider
              label="Grid Height"
              value={gridHeight}
              min={4}
              max={60}
              step={getHeightStep(gridHeight)}
              description={`Vertical height of the storage area (4–60). Step ${getHeightStep(gridHeight)}.`}
              onChange={handleGridChange}
              onCommit={(v) => setDebouncedGridHeight(v)}
            />
            <PlainSlider
              label="Rack Count"
              value={rackCount}
              min={5}
              max={60}
              step={getRackStep(rackCount)}
              description={`Number of double-row racks (5–60). Step ${getRackStep(rackCount)}.`}
              onChange={handleRackChange}
              onCommit={(v) => setDebouncedRackCount(v)}
            />
            <PlainSlider
              label="Aisle Width"
              value={aisleWidth}
              min={1}
              max={5}
              step={1}
              description="Spacing between rack columns."
              onChange={setAisleWidth}
            />
            <PlainSlider
              label="Cross Aisles"
              value={crossAisleCount}
              min={0}
              max={4}
              step={1}
              low="0 · Parallel"
              high="4 · Thoroughfares"
              description={
                crossAisleCount === 0
                  ? 'No cross aisles — a plain parallel layout.'
                  : `${crossAisleCount} horizontal thoroughfare${crossAisleCount === 1 ? '' : 's'} cutting across the racks.`
              }
              onChange={setCrossAisleCount}
            />
          </div>
        );
      case 'inventory':
        return (
          <div className="space-y-4">
            <PlainSlider
              label="SKU Count"
              value={skuCount}
              min={500}
              max={10000}
              step={1}
              display={skuCount.toLocaleString()}
              description="Number of unique products to generate."
              onChange={setSkuCount}
            />
            <PlainSlider
              label="Demand Distribution"
              value={demandDistribution}
              min={0}
              max={100}
              step={1}
              display={`${demandDistribution}%`}
              low="Uniform"
              high="Pareto"
              description={`How demand spreads across SKUs. Top 20% hold ${Math.round(demandSummary.topShare * 100)}% of demand.`}
              onChange={setDemandDistribution}
            />
            <PlainSlider
              label="Product Affinity"
              value={productAffinity}
              min={0}
              max={100}
              step={1}
              display={`${productAffinity}%`}
              low="Independent"
              high="Highly Related"
              description={`Which products get bought together. ${affinitySummary.groupCount} groups · largest ${affinitySummary.largestGroupSize}.`}
              onChange={setProductAffinity}
            />
            <PlainSlider
              label="Storage Footprint"
              value={storageFootprint}
              min={0}
              max={100}
              step={1}
              display={`${storageFootprint}%`}
              low="Compact"
              high="Bulky"
              description={`Bins per product. ${footprintSummary.multiBinCount} multi-bin · needs ${footprintSummary.totalBins} bins.`}
              onChange={setStorageFootprint}
            />
          </div>
        );
      case 'placement':
        return (
          <div className="space-y-4">
            <PlainSlider
              label="Slotting Bias"
              value={slottingBias}
              min={0}
              max={100}
              step={1}
              display={`${slottingBias}%`}
              low="Random"
              high="Demand-Based"
              description={`How strongly demand drives location. ${inventory.length - placementPreview.unplacedCount} / ${inventory.length} SKUs placed.`}
              onChange={setSlottingBias}
            />
            <PlainSlider
              label="Category Clustering"
              value={categoryClustering}
              min={0}
              max={100}
              step={1}
              display={`${categoryClustering}%`}
              low="Scattered"
              high="Clustered"
              description={`How strongly same-category products are zoned together. ${placementPreview.categoryCount} categories.`}
              onChange={setCategoryClustering}
            />
            {placementPreview.unplacedCount > 0 && (
              <p className="text-[11px] text-warning font-medium">
                ⚠ {placementPreview.unplacedCount} SKUs overflow (not enough bins).
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Layout className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEditing ? 'Edit Warehouse Layout' : 'Configure Warehouse Layout'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? 'Adjust parameters and update your existing warehouse.'
                : 'Shape the warehouse, its inventory, and how inventory is distributed'}
            </p>
          </div>
        </div>
        {canClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        )}
      </header>

      {/* Main — Split Deck: left cards, right preview */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left sidebar — one card open at a time */}
        <aside className="w-[340px] shrink-0 border-r bg-card overflow-y-auto p-3 space-y-2">
          {cards.map((c) => {
            const Icon = c.icon;
            const isOpen = openCard === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-xl border bg-surface transition-all',
                  isOpen ? 'border-accent/60 shadow-md' : 'border-border-default hover:border-accent/40'
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenCard(isOpen ? null : c.id)}
                  className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left"
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isOpen ? 'bg-accent text-primary-foreground' : 'bg-accent-soft text-accent')}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={cn('block text-xs font-bold truncate', isOpen ? 'text-text-primary' : 'text-text-secondary')}>{c.title}</span>
                    {!isOpen && <span className="block text-[9px] text-text-muted truncate">{c.subtitle}</span>}
                  </span>
                  <ChevronRight className={cn('h-3.5 w-3.5 text-text-muted transition-transform shrink-0', isOpen && 'rotate-90')} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-4 border-t border-border-default pt-2.5">
                    {renderCardBody(c.id)}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2">
            <Button className="w-full" onClick={handleApply} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isEditing ? 'Updating…' : 'Generating…'}
                </>
              ) : isEditing ? (
                'Update Warehouse'
              ) : (
                'Generate Warehouse'
              )}
            </Button>
          </div>
        </aside>

        {/* Right — live preview, always fits */}
        <main ref={setPreviewRef} className="flex-1 bg-muted/20 overflow-auto min-h-0">
          <div className="flex flex-col items-center justify-center min-h-full min-w-full p-6 gap-4">
            {/* Affinity floorplan — the only preview view now */}
            <AffinityView
              grid={previewWarehouse.grid}
              shelfLookup={shelfLookup}
              cellSize={cellSize}
              fullWidth={fullWidth}
              fullHeight={fullHeight}
              variant={affinityVariant}
              onVariantChange={setAffinityVariant}
            />

            <PreviewStats />

            {/* Affinity legend — adapts to the active variant */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 inline-block rounded-sm"
                  style={{ backgroundColor: affinityColor(affinityVariant, 1) }}
                />
                <span>Each color = an affinity group</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-muted-foreground inline-block rounded-sm" />
                <span>No item</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-warning inline-block rounded-sm" />
                <span>Dispatch</span>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

