'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { X, Layout, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Item } from '@/lib/taro/types';
import {
  generateParallelLayout,
  generateCrossAisleLayout,
  generateFishboneLayout
} from '@/lib/taro/layout-generator';
import {
  generateDemandScores,
  summarizeDemandScores
} from '@/lib/taro/demand';
import {
  generateAffinityGroups,
  summarizeAffinityGroups
} from '@/lib/taro/affinity';
import { assignProductCategory } from '@/lib/taro/categories';
import {
  computePlacementPreview,
} from '@/lib/taro/inventory-placement';

export type LayoutType = 'parallel' | 'cross-aisle' | 'fishbone';

export interface LayoutConfig {
  type: LayoutType;
  gridHeight: number;
  rackCount: number;
  aisleWidth: number;
  crossAisleCount: number;
  fbWidth: number;
  fbHeight: number;
  fbTheta: number;
  fbI2: number;
  fbS: number;
  fbAp: number;
  /** Generated inventory (one Item per SKU, with demandScore). */
  inventory: Item[];
  /** Slotting Bias slider value, 0 (Random) .. 100 (Demand-Based). */
  slottingBias: number;
  /** Category Clustering slider value, 0 (Scattered) .. 100 (Clustered). */
  categoryClustering: number;
}

interface LayoutConfigOverlayProps {
  onClose: () => void;
  onApply?: (config: LayoutConfig) => void;
}

export function LayoutConfigOverlay({ onClose, onApply }: LayoutConfigOverlayProps) {
  const [layoutType, setLayoutType] = useState<LayoutType>('parallel');

  // Parallel / Cross Aisle Params
  const [gridHeight, setGridHeight] = useState(12);
  const [rackCount, setRackCount] = useState(10);
  const [aisleWidth, setAisleWidth] = useState(2);
  const [crossAisleCount, setCrossAisleCount] = useState(1);

  // Fishbone Params
  const [fbWidth, setFbWidth] = useState(30);
  const [fbHeight, setFbHeight] = useState(20);
  const [fbTheta, setFbTheta] = useState(45);
  const [fbI2, setFbI2] = useState(1);
  const [fbS, setFbS] = useState(4);
  const [fbAp, setFbAp] = useState(0.8);

  // Inventory Generation
  //
  // `generateItems` only handles SKU identity generation; demand assignment
  // is a separate, composable step (`assignDemandDistribution`) so future
  // inventory-generation variables can build on top of the plain item list.
  //
  // `demandDistribution` is the Demand Distribution slider value
  // (0 = Uniform, 100 = Pareto). It controls how customer demand is spread
  // across the generated SKUs. See `lib/taro/demand.ts` for the algorithm.
  const generateItems = useCallback((count: number): Item[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `SKU_${String(i + 1).padStart(3, '0')}`,
    }));
  }, []);

  /** Enrich plain items with `demandScore` values from the demand engine. */
  const assignDemandDistribution = useCallback(
    (items: Item[], distribution: number): Item[] => {
      if (items.length === 0) return items;
      const scores = generateDemandScores({
        count: items.length,
        distribution,
      });
      return items.map((item, i) => ({ ...item, demandScore: scores[i] }));
    },
    []
  );

  /**
   * Enrich plain items with an `affinityGroup` id from the product-affinity
   * engine. This is the third Inventory Generation variable. SKUs sharing a
   * group id are considered related and will be more likely to appear
   * together in customer orders during Order Generation. Every SKU is
   * assigned to exactly one affinity group (singletons get their own id).
   */
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

  const [skuCount, setSkuCount] = useState(10);
  const [demandDistribution, setDemandDistribution] = useState(0);
  const [productAffinity, setProductAffinity] = useState(0);
  // Inventory Placement — Slotting Bias variable.
  // 0 = Random (SKUs placed almost randomly), 100 = Demand-Based
  // (high-demand SKUs placed closest to the dispatch area).
  const [slottingBias, setSlottingBias] = useState(0);
  // Inventory Placement — Category Clustering variable.
  // 0 = Scattered (categories mixed throughout, the pure Slotting Bias plan),
  // 100 = Clustered (each category in a single contiguous zone).
  const [categoryClustering, setCategoryClustering] = useState(0);
  const [inventory, setInventory] = useState<Item[]>(() =>
    // Start demand, affinity and category in their default (independent)
    // state so the preview reflects the full, composable pipeline.
    assignProductCategory(
      assignProductAffinity(assignDemandDistribution(generateItems(10), 0), 0)
    )
  );

  useEffect(() => {
    // The three user-facing inventory-generation variables are composed in
    // sequence: SKU Count (identity) -> Demand Distribution -> Product
    // Affinity. A fourth, AUTOMATIC supporting step (Product Category) is then
    // attached. Category is not user-controlled (no slider) and is generated
    // independently of affinity. Re-run the whole pipeline whenever any slider
    // changes so the preview summary always matches the final item list.
    setInventory(
      assignProductCategory(
        assignProductAffinity(
          assignDemandDistribution(generateItems(skuCount), demandDistribution),
          productAffinity
        )
      )
    );
  }, [skuCount, demandDistribution, productAffinity, generateItems, assignDemandDistribution, assignProductAffinity]);

  // Lightweight summary used to show each slider's effect inline.
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const previewWarehouse = useMemo(() => {
    switch (layoutType) {
      case 'parallel':
        return generateParallelLayout(gridHeight, rackCount, aisleWidth);
      case 'cross-aisle':
        return generateCrossAisleLayout(gridHeight, rackCount, aisleWidth, crossAisleCount);
      case 'fishbone':
        return generateFishboneLayout(fbWidth, fbHeight, fbTheta, fbI2, fbS, fbAp);
      default:
        return generateParallelLayout(gridHeight, rackCount, aisleWidth);
    }
  }, [
    layoutType, gridHeight, rackCount, aisleWidth, crossAisleCount,
    fbWidth, fbHeight, fbTheta, fbI2, fbS, fbAp
  ]);

  const fullWidth = previewWarehouse.width;
  const fullHeight = previewWarehouse.height;

  // Live preview of the placement on the current layout. Recomputed whenever
  // the layout, inventory, slotting bias, or category clustering changes so
  // the summary (overflow, demand near dispatch, zones) always matches apply.
  const placementPreview = useMemo(
    () =>
      computePlacementPreview(previewWarehouse, {
        items: inventory,
        slottingBias,
        categoryClustering,
      }),
    [previewWarehouse, inventory, slottingBias, categoryClustering]
  );

  const cellSize = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return 24;

    const padding = 64; // 32px on each side
    const availableWidth = containerSize.width - padding;
    const availableHeight = containerSize.height - padding;

    const optimalWidth = (availableWidth - (fullWidth - 1)) / fullWidth;
    const optimalHeight = (availableHeight - (fullHeight - 1)) / fullHeight;

    // Constrain cellSize between 4px and 40px
    return Math.floor(Math.min(Math.max(Math.min(optimalWidth, optimalHeight), 4), 40));
  }, [containerSize, fullWidth, fullHeight]);

  const renderGrid = () => {
    const cells = [];

    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        const cell = previewWarehouse.grid[y][x];

        let bgColor = 'bg-slate-100';

        if (cell.type === 'worker-start') {
          bgColor = 'bg-orange-500';
        } else if (cell.type === 'shelf') {
          bgColor = 'bg-slate-800';
        }

        cells.push(
          <div
            key={`${x}-${y}`}
            style={{ width: cellSize, height: cellSize }}
            className={`relative transition-colors duration-200 ${bgColor}`}
          />
        );
      }
    }
    return cells;
  };

  const handleApply = () => {
    onApply?.({
      type: layoutType,
      gridHeight,
      rackCount,
      aisleWidth,
      crossAisleCount,
      fbWidth,
      fbHeight,
      fbTheta,
      fbI2,
      fbS,
      fbAp,
      inventory,
      slottingBias,
      categoryClustering,
    });
    onClose();
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
            <h1 className="text-xl font-bold tracking-tight">Configure Warehouse Layout</h1>
            <p className="text-xs text-muted-foreground">Select a template, customise its parameters, and shape how inventory will be distributed</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Controls */}
        <aside className="w-[360px] border-r bg-card flex flex-col min-h-0">
          <Tabs 
            value={layoutType} 
            onValueChange={(v) => setLayoutType(v as LayoutType)} 
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-6 pt-6">
              <TabsList className="grid grid-cols-3 w-full mb-6">
                <TabsTrigger value="parallel" className="text-xs">Parallel</TabsTrigger>
                <TabsTrigger value="cross-aisle" className="text-xs">Cross Aisle</TabsTrigger>
                <TabsTrigger value="fishbone" className="text-xs">Fishbone</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 pt-0 space-y-8">
                <div className="space-y-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Warehouse Geometry</h2>
                  <p className="text-xs text-muted-foreground">Define the physical rack layout.</p>
                </div>

                {(layoutType === 'parallel' || layoutType === 'cross-aisle') && (
                  <>
                    {/* Grid Height Control */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Grid Height</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{gridHeight}</span>
                      </div>
                      <Slider
                        min={4} max={60} step={1}
                        value={[gridHeight]}
                        onValueChange={(val) => setGridHeight(val[0])}
                      />
                      <p className="text-xs text-muted-foreground">Vertical height of the storage area.</p>
                    </div>

                    {/* Rack Count Control */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Rack Count</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{rackCount}</span>
                      </div>
                      <Slider
                        min={1} max={30} step={1}
                        value={[rackCount]}
                        onValueChange={(val) => setRackCount(val[0])}
                      />
                      <p className="text-xs text-muted-foreground">Number of double-row racks.</p>
                    </div>

                    {/* Aisle Width Control */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Aisle Width</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{aisleWidth}</span>
                      </div>
                      <Slider
                        min={1} max={5} step={1}
                        value={[aisleWidth]}
                        onValueChange={(val) => setAisleWidth(val[0])}
                      />
                      <p className="text-xs text-muted-foreground">Spacing between rack columns.</p>
                    </div>
                  </>
                )}

                {layoutType === 'cross-aisle' && (
                  <div className="space-y-4 border-t pt-8">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Cross Aisles</Label>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{crossAisleCount}</span>
                    </div>
                    <Slider
                      min={1} max={4} step={1}
                      value={[crossAisleCount]}
                      onValueChange={(val) => setCrossAisleCount(val[0])}
                    />
                    <p className="text-xs text-muted-foreground">Number of horizontal thoroughfares.</p>
                  </div>
                )}

                {layoutType === 'fishbone' && (
                  <div className="space-y-6">
                    <Alert className="bg-amber-50/50 border-amber-200/50 p-3 mb-4">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800 text-[11px] font-medium">
                        Experimental: Research-backed Fishbone simulation is under development and is not yet recommended for production comparisons.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Width</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fbWidth}</span>
                      </div>
                      <Slider min={10} max={60} step={1} value={[fbWidth]} onValueChange={(val) => setFbWidth(val[0])} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Height</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fbHeight}</span>
                      </div>
                      <Slider min={10} max={60} step={1} value={[fbHeight]} onValueChange={(val) => setFbHeight(val[0])} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Aisle Angle (Theta)</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fbTheta}°</span>
                      </div>
                      <Slider min={20} max={70} step={5} value={[fbTheta]} onValueChange={(val) => setFbTheta(val[0])} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Aisle Spacing</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fbS}</span>
                      </div>
                      <Slider min={2} max={10} step={1} value={[fbS]} onValueChange={(val) => setFbS(val[0])} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Growth Factor (I2)</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fbI2}</span>
                      </div>
                      <Slider min={1} max={3} step={0.1} value={[fbI2]} onValueChange={(val) => setFbI2(val[0])} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Density</Label>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{Math.round(fbAp * 100)}%</span>
                      </div>
                      <Slider min={0.1} max={1} step={0.05} value={[fbAp]} onValueChange={(val) => setFbAp(val[0])} />
                    </div>
                  </div>
                )}

                {/* Inventory Generation Section */}
                <div className="space-y-1 pt-8 border-t">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory Generation</h2>
                  <p className="text-xs text-muted-foreground">Define what inventory exists.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">SKU Count</Label>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{skuCount}</span>
                  </div>
                  <Slider
                    min={1} max={200} step={1}
                    value={[skuCount]}
                    onValueChange={(val) => setSkuCount(val[0])}
                  />
                  <p className="text-xs text-muted-foreground">Number of unique SKUs to generate.</p>
                </div>

                {/* Demand Distribution slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Demand Distribution</Label>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {demandDistribution}%
                    </span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[demandDistribution]}
                    onValueChange={(val) => setDemandDistribution(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Uniform</span>
                    <span>Pareto</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How customer demand is spread across SKUs.
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Top 20% hold {Math.round(demandSummary.topShare * 100)}% of demand · min {demandSummary.min.toFixed(2)} / max {demandSummary.max.toFixed(2)}
                  </p>
                </div>

                {/* Product Affinity slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Product Affinity</Label>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {productAffinity}%
                    </span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[productAffinity]}
                    onValueChange={(val) => setProductAffinity(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Independent</span>
                    <span>Highly Related</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Which products tend to be bought together.
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {affinitySummary.groupCount} groups · largest {affinitySummary.largestGroupSize} · {Math.round(affinitySummary.groupedShare * 100)}% of SKUs have a group-mate
                  </p>
                </div>

                {/* Inventory Placement Section */}
                <div className="space-y-1 pt-8 border-t">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory Placement</h2>
                  <p className="text-xs text-muted-foreground">Decide where inventory lives.</p>
                </div>

                {/* Slotting Bias slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Slotting Bias</Label>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {slottingBias}%
                    </span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[slottingBias]}
                    onValueChange={(val) => setSlottingBias(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Random</span>
                    <span>Demand-Based</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How strongly product demand influences storage location.
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {inventory.length - placementPreview.unplacedCount} / {inventory.length} SKUs placed · {placementPreview.binCount} bins
                    {placementPreview.unplacedCount > 0 && (
                      <span className="text-amber-600">
                        {' · ⚠'} {placementPreview.unplacedCount} overflow (not enough bins)
                      </span>
                    )}
                  </p>
                </div>

                {/* Category Clustering slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Category Clustering</Label>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {categoryClustering}%
                    </span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[categoryClustering]}
                    onValueChange={(val) => setCategoryClustering(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Scattered</span>
                    <span>Clustered</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How strongly products of the same category are stored together in contiguous zones.
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {placementPreview.categoryCount} categor{placementPreview.categoryCount === 1 ? 'y' : 'ies'} · clustering {categoryClustering}%
                  </p>
                </div>
              </div>
            </ScrollArea>
          </Tabs>

          <div className="p-6 border-t bg-card/50">
            <Button className="w-full" onClick={handleApply}>
              Generate Warehouse
            </Button>
          </div>
        </aside>

        {/* Right Panel - Live Preview */}
<main
  ref={containerRef}
  className="flex-1 bg-muted/20 overflow-hidden min-h-0"
>
  <ScrollArea className="h-full w-full">
    <div className="flex flex-col items-center justify-center min-h-full min-w-full p-8 gap-4">
      <div
        className="grid gap-px border border-border bg-border shadow-inner p-px rounded-sm"
        style={{
          gridTemplateColumns: `repeat(${fullWidth}, ${cellSize}px)`,
          width: "max-content",
        }}
      >
        {renderGrid()}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-slate-800 inline-block rounded-sm" />
          <span>Shelf</span>
        </span>

        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-orange-500 inline-block rounded-sm" />
          <span>Dispatch</span>
        </span>
      </div>
    </div>
  </ScrollArea>
        </main>
      </div>
    </div>
  );
}
