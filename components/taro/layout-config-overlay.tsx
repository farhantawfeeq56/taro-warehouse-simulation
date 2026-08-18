'use client';

/**
 * vartest5 — Warehouse Layout Config screen.
 *
 * The control sidebar is now rendered by one of five radical layout variants
 * (see layout-config-variants.tsx). A floating segmented control in the
 * bottom-right corner + keys 1–5 switch between them.
 *
 * Non-negotiable constraints implemented here:
 *   • Fishbone is gone entirely (no tab, no preview, no controls, no config).
 *   • Parallel & Cross Aisle share one geometry group; the cross-aisle slider
 *     is the only survivor — default 1, can go to 0 (plain parallel).
 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { X, Layout, Grid3X3, Thermometer, Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Item } from '@/lib/taro/types';
import type { ShelfPlacementPreview } from '@/lib/taro/inventory-placement';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import {
  computePlacementPreview,
  PREVIEW_MAX_ITEMS,
} from '@/lib/taro/inventory-placement';
import {
  generateCrossAisleLayout,
} from '@/lib/taro/layout-generator';
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
import {
  LAYOUT_VARIANTS,
  VariantToolbar,
  useVariantKeyboard,
  PreviewInsights,
  type LayoutConfigVariantProps,
  type PreviewMode,
} from './layout-config-variants';

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
  /**
   * When provided, the overlay pre-populates all controls from this
   * configuration and behaves as an editor (edit header & update button).
   */
  initialConfig?: WarehouseConfiguration;
  /**
   * When true, the Apply button is disabled and shows a spinner —
   * indicates a warehouse generation is in-flight.
   */
  isGenerating?: boolean;
}

/** Piecewise‑adaptive step for Grid Height (4–60):
 *  1 at ≤20, 2 at ≤50, 5 at ≤60. */
function getHeightStep(v: number): number {
  if (v <= 20) return 1;
  if (v <= 50) return 2;
  return 5;
}

/** Piecewise‑adaptive step for Rack Count (5–60):
 *  1 at ≤20, 2 at ≤50, 5 at ≤60. */
function getRackStep(v: number): number {
  if (v <= 20) return 1;
  if (v <= 50) return 2;
  return 5;
}

export function LayoutConfigOverlay({ onClose, onApply, canClose = true, initialConfig, isGenerating = false }: LayoutConfigOverlayProps) {
  const isEditing = initialConfig != null;

  // ── Active variant (vartest5) ──────────────────────────────────────────
  // ── Active variant (vartest5) — ids are 6-10; default to the first. ─────
  const [activeVariant, setActiveVariant] = useState<number>(() => LAYOUT_VARIANTS[0].id);
  useVariantKeyboard(activeVariant, setActiveVariant);

  // ── Adaptive sliders for Grid Height & Rack Count ──────────────────────
  const [gridHeight,          setGridHeight]          = useState(initialConfig?.layout.gridHeight ?? 30);
  const [debouncedGridHeight, setDebouncedGridHeight] = useState(initialConfig?.layout.gridHeight ?? 30);
  const [rackCount,           setRackCount]           = useState(initialConfig?.layout.rackCount ?? 30);
  const [debouncedRackCount,  setDebouncedRackCount]  = useState(initialConfig?.layout.rackCount ?? 30);

  // 200 ms debounce while dragging: preview updates after a brief pause.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedGridHeight(gridHeight), 200);
    return () => clearTimeout(t);
  }, [gridHeight]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRackCount(rackCount), 200);
    return () => clearTimeout(t);
  }, [rackCount]);

  // Other params (no adaptive step needed — narrow ranges)
  const [aisleWidth, setAisleWidth] = useState(initialConfig?.layout.aisleWidth ?? 2);
  // Cross-aisle slider: DEFAULT 1, may go to 0 (plain parallel).
  const [crossAisleCount, setCrossAisleCount] = useState(initialConfig?.layout.crossAisleCount ?? 1);

  // A SKU identity before any enrichment is assigned.
  type BaseItem = Pick<Item, 'id'>;

  const generateItems = useCallback((count: number): BaseItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `SKU_${String(i + 1).padStart(3, '0')}`,
    }));
  }, []);

  const assignDemandDistribution = useCallback(
    (items: BaseItem[], distribution: number): Item[] => {
      if (items.length === 0) return [];
      const scores = generateDemandScores({
        count: items.length,
        distribution,
      });
      const minQty = 10;
      const maxQty = 250;
      return items.map((item, i) => {
        const demandScore = scores[i];
        const totalQuantity =
          minQty + Math.round((demandScore / 10) * (maxQty - minQty));
        return { ...item, demandScore, totalQuantity };
      });
    },
    []
  );

  const assignProductAffinity = useCallback(
    (items: Item[], affinity: number): Item[] => {
      if (items.length === 0) return items;
      const groups = generateAffinityGroups({
        count: items.length,
        affinity,
      });
      return items.map((item, i) => ({ ...item, affinityGroup: groups[i] }));
    },
    []
  );

  const assignStorageFootprint = useCallback(
    (items: Item[], footprint: number): Item[] => {
      if (items.length === 0) return items;
      const footprints = generateFootprints({
        count: items.length,
        footprint,
      });
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

  // Which inventory view to overlay on the grid.
  const [previewMode, setPreviewMode] = useState<PreviewMode>('layout');

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

  const demandSummary = useMemo(
    () =>
      summarizeDemandScores(
        inventory.map((i) => i.demandScore ?? 0),
        0.2
      ),
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

  // Callback ref so the ResizeObserver re-attaches whenever the preview node
  // remounts (e.g. switching between screen-layout variants).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const setPreviewRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect any observer still attached to a previous node (variant switch).
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

  // The only layout generator left: cross-aisle handles 0 cross aisles
  // (i.e. plain parallel) naturally.
  const previewWarehouse = useMemo(
    () =>
      generateCrossAisleLayout(debouncedGridHeight, debouncedRackCount, aisleWidth, crossAisleCount),
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

    const padding = 24; // 12px on each side
    const availableWidth = Math.max(1, containerSize.width - padding);
    const availableHeight = Math.max(1, containerSize.height - padding);

    // Fit the ENTIRE warehouse regardless of size: no 4px floor, no 40px cap
    // beyond a sensible readability ceiling.
    const optimalWidth = (availableWidth - (fullWidth - 1)) / fullWidth;
    const optimalHeight = (availableHeight - (fullHeight - 1)) / fullHeight;
    const fit = Math.min(optimalWidth, optimalHeight);
    // Never below 1px so the grid still renders; cap at 40px for readability.
    return Math.max(1, Math.min(40, Math.floor(fit)));
  }, [containerSize, fullWidth, fullHeight]);

  const shelfLookup = useMemo(() => {
    const map = new Map<string, ShelfPlacementPreview>();
    for (const s of placementPreview.shelves) {
      map.set(`${s.x},${s.y}`, s);
    }
    return map;
  }, [placementPreview.shelves]);

  const maxPlacedDemand = placementPreview.maxDemand;

  const placedAffinityIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of placementPreview.shelves) {
      if (s.affinityGroup != null && s.affinityGroup > 0) {
        ids.add(s.affinityGroup);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [placementPreview.shelves]);

  const affinityColor = useCallback(
    (groupId: number | undefined): string => {
      if (groupId == null || groupId <= 0) return '#64748b';
      const hue =
        ((groupId * 137.508 + 20) % 360) | 0;
      return `hsl(${hue}, 65%, 50%)`;
    },
    []
  );

  const getShelfColor = useCallback(
    (x: number, y: number): string => {
      const sp = shelfLookup.get(`${x},${y}`);
      if (!sp || !sp.active) return '#94a3b8';

      if (previewMode === 'demand') {
        const t = maxPlacedDemand > 0 ? Math.min(1, sp.demand / maxPlacedDemand) : 0;
        const h = (1 - t) * 217 + t * 0;
        const s = 65;
        const l = 50 + t * 5;
        return `hsl(${h | 0}, ${s}%, ${l}%)`;
      }

      if (previewMode === 'affinity') {
        return affinityColor(sp.affinityGroup);
      }

      return '#1e293b';
    },
    [shelfLookup, previewMode, maxPlacedDemand, affinityColor]
  );

  // ── Live insight metrics (layout / demand / affinity) ──────────────────
  const layoutInsights = useMemo(() => {
    let shelfCells = 0;
    let totalCells = 0;
    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        totalCells++;
        if (previewWarehouse.grid[y][x].type === 'shelf') shelfCells++;
      }
    }
    return {
      shelfCells,
      totalCells,
      binCapacity: placementPreview.binCount,
      crossAisles: crossAisleCount,
      segments: Math.max(1, crossAisleCount + 1),
    };
  }, [fullWidth, fullHeight, previewWarehouse, placementPreview.binCount, crossAisleCount]);

  const demandInsights = useMemo(() => {
    // Pearson correlation between shelf proximity (0 = near dispatch) and demand.
    // Negative r → high demand sits near dispatch (slotting working).
    const pairs = placementPreview.shelves
      .filter((s) => s.active && s.demand > 0)
      .map((s) => ({ p: s.proximity, d: s.demand }));
    const n = pairs.length;
    let r = 0;
    if (n > 2) {
      const mx = pairs.reduce((a, b) => a + b.p, 0) / n;
      const my = pairs.reduce((a, b) => a + b.d, 0) / n;
      let num = 0;
      let dx2 = 0;
      let dy2 = 0;
      for (const { p, d } of pairs) {
        const dx = p - mx;
        const dy = d - my;
        num += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
      }
      if (dx2 > 0 && dy2 > 0) r = num / Math.sqrt(dx2 * dy2);
    }
    return {
      topShare: demandSummary.topShare,
      demandProximityCorrelation: Number.isFinite(r) ? r : 0,
      slottingBias,
    };
  }, [placementPreview.shelves, demandSummary.topShare, slottingBias]);

  const affinityInsights = useMemo(() => {
    const active = placementPreview.shelves.filter((s) => s.active);
    const placedGroups = new Map<number, number>();
    for (const s of active) {
      if (s.affinityGroup != null && s.affinityGroup > 0) {
        placedGroups.set(s.affinityGroup, (placedGroups.get(s.affinityGroup) ?? 0) + 1);
      }
    }
    const largest = Math.max(0, ...placedGroups.values());
    return {
      placedGroupCount: placedGroups.size,
      largestGroupShare: active.length > 0 ? largest / active.length : 0,
      categoryCount: placementPreview.categoryCount,
      clustering: categoryClustering,
    };
  }, [placementPreview.shelves, placementPreview.categoryCount, categoryClustering]);

  const renderGrid = () => {
    const cells = [];

    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        const cell = previewWarehouse.grid[y][x];
        const key = `${x}-${y}`;

        if (cell.type === 'worker-start') {
          cells.push(
            <div
              key={key}
              style={{ width: cellSize, height: cellSize }}
              className="relative transition-colors duration-200 bg-warning"
            />
          );
        } else if (cell.type === 'shelf') {
          const isLayoutMode = previewMode === 'layout';
          const shelfColor = isLayoutMode ? undefined : getShelfColor(x, y);
          cells.push(
            <div
              key={key}
              style={{
                width: cellSize,
                height: cellSize,
                ...(shelfColor ? { backgroundColor: shelfColor } : {}),
              }}
              className={`relative ${isLayoutMode ? 'bg-accent' : ''}`}
            />
          );
        } else {
          cells.push(
            <div
              key={key}
              style={{ width: cellSize, height: cellSize }}
              className="relative transition-colors duration-200 bg-muted"
            />
          );
        }
      }
    }
    return cells;
  };

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

  // ── Props shared with all variants ─────────────────────────────────────
  const onGeometryChange = useCallback((patch: Partial<{ gridHeight: number; rackCount: number; aisleWidth: number; crossAisleCount: number }>) => {
    if (patch.gridHeight != null) setGridHeight(patch.gridHeight);
    if (patch.rackCount != null) setRackCount(patch.rackCount);
    if (patch.aisleWidth != null) setAisleWidth(patch.aisleWidth);
    if (patch.crossAisleCount != null) setCrossAisleCount(patch.crossAisleCount);
  }, []);

  const onGeometryCommit = useCallback((patch: Partial<{ gridHeight: number; rackCount: number; aisleWidth: number; crossAisleCount: number }>) => {
    if (patch.gridHeight != null) setDebouncedGridHeight(patch.gridHeight);
    if (patch.rackCount != null) setDebouncedRackCount(patch.rackCount);
  }, []);

  // Raster of the warehouse for the Field Map variant (clamped for perf).
  const layoutRaster = useMemo(() => {
    const MAX_RASTER = 80;
    const rh = Math.min(fullHeight, MAX_RASTER);
    const rw = Math.min(fullWidth, MAX_RASTER);
    const raster: ('empty' | 'shelf' | 'worker')[][] = [];
    for (let y = 0; y < rh; y++) {
      const row: ('empty' | 'shelf' | 'worker')[] = [];
      for (let x = 0; x < rw; x++) {
        const cell = previewWarehouse.grid[y]?.[x];
        row.push(cell?.type === 'shelf' ? 'shelf' : cell?.type === 'worker-start' ? 'worker' : 'empty');
      }
      raster.push(row);
    }
    return raster;
  }, [previewWarehouse, fullWidth, fullHeight]);

  // Placement-shelf lookup for the Field Map variant (downsampled to raster).
  const fieldMapShelfMeta = useMemo(() => {
    const map = new Map<string, { active: boolean; demand: number; affinity?: number }>();
    for (const s of placementPreview.shelves) {
      if (s.x < 80 && s.y < 80) {
        map.set(`${s.x},${s.y}`, { active: s.active, demand: s.demand, affinity: s.affinityGroup });
      }
    }
    return map;
  }, [placementPreview.shelves]);

  const variantProps: Omit<LayoutConfigVariantProps, 'renderPreview' | 'renderFooter'> = {
    geometry: { gridHeight, rackCount, aisleWidth, crossAisleCount },
    onGeometryChange,
    onGeometryCommit,
    skuCount,
    onSkuCountChange: setSkuCount,
    demandDistribution,
    onDemandDistributionChange: setDemandDistribution,
    productAffinity,
    onProductAffinityChange: setProductAffinity,
    storageFootprint,
    onStorageFootprintChange: setStorageFootprint,
    slottingBias,
    onSlottingBiasChange: setSlottingBias,
    categoryClustering,
    onCategoryClusteringChange: setCategoryClustering,
    demandSummary,
    affinitySummary,
    footprintSummary,
    placementSummary: {
      placed: inventory.length - placementPreview.unplacedCount,
      total: inventory.length,
      placedBins: placementPreview.placedBinCount,
      totalBins: placementPreview.binCount,
      unplaced: placementPreview.unplacedCount,
      categoryCount: placementPreview.categoryCount,
    },
    previewSize: { width: fullWidth, height: fullHeight },
    layoutRaster,
    shelfMeta: fieldMapShelfMeta,
    previewMode,
    onPreviewModeChange: setPreviewMode,
    maxPlacedDemand,
  };

  const ActiveVariantComponent = LAYOUT_VARIANTS.find((v) => v.id === activeVariant)?.Component ?? LAYOUT_VARIANTS[0].Component;

  const renderFooter = () => (
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
  );

  const renderPreview = () => (
    <div ref={setPreviewRef} className="flex flex-col items-center justify-center gap-4 w-full h-full">
      <div
        className="grid gap-px border border-border bg-border shadow-inner p-px rounded-sm"
        style={{
          gridTemplateColumns: `repeat(${fullWidth}, ${cellSize}px)`,
          width: "max-content",
        }}
      >
        {renderGrid()}
      </div>

      {/* Live insight strip — layout / demand / affinity */}
      <PreviewInsights
        mode={previewMode}
        layout={layoutInsights}
        demand={demandInsights}
        affinity={affinityInsights}
      />

      {/* Preview mode selector */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
        {([
          ['layout', Grid3X3, 'Layout'],
          ['demand', Thermometer, 'Demand'],
          ['affinity', Tag, 'Affinity'],
        ] as const).map(([mode, Icon, label]) => (
          <button
            key={mode}
            onClick={() => setPreviewMode(mode)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
              previewMode === mode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Legend — adapts to the active preview mode */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
        {previewMode === 'layout' && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-accent inline-block rounded-sm" />
              <span>Shelf</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-muted-foreground inline-block rounded-sm" />
              <span>Empty Shelf</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-warning inline-block rounded-sm" />
              <span>Dispatch</span>
            </span>
          </>
        )}
        {previewMode === 'demand' && (
          <>
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 inline-block rounded-sm"
                style={{ backgroundColor: 'hsl(217, 65%, 55%)' }}
              />
              <span>Low demand</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 inline-block rounded-sm"
                style={{ backgroundColor: 'hsl(0, 65%, 55%)' }}
              />
              <span>High demand</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-muted-foreground inline-block rounded-sm" />
              <span>No item placed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-warning inline-block rounded-sm" />
              <span>Dispatch</span>
            </span>
          </>
        )}
        {previewMode === 'affinity' && (
          <>
            {placedAffinityIds.slice(0, 8).map((gid) => (
              <span key={gid} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 inline-block rounded-sm"
                  style={{ backgroundColor: affinityColor(gid) }}
                />
                <span>Group {gid}</span>
              </span>
            ))}
            {placedAffinityIds.length > 8 && (
              <span className="text-muted-foreground/70">
                +{placedAffinityIds.length - 8} more
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-muted-foreground inline-block rounded-sm" />
              <span>No item</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-warning inline-block rounded-sm" />
              <span>Dispatch</span>
            </span>
          </>
        )}
      </div>
    </div>
  );

  // Rebuild variantProps with the render props (renderPreview/renderFooter are
  // stable enough to be passed once — they close over current state).
  const screenProps: LayoutConfigVariantProps = {
    ...variantProps,
    renderPreview,
    renderFooter,
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card">
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
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {LAYOUT_VARIANTS.find((v) => v.id === activeVariant)?.name}
          </span>
          {canClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      {/* Main Content — the active screen-layout variant arranges controls + preview */}
      <ActiveVariantComponent {...screenProps} />

      {/* Floating variant toolbar (bottom-right, keys 1-5) */}
      <VariantToolbar activeVariant={activeVariant} onSelect={setActiveVariant} />
    </div>
  );
}
