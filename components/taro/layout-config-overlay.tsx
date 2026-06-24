'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { X, Columns, Layout, Grid, Hash, AlertTriangle, Boxes, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  generateParallelLayout,
  generateSegmentedLayout,
  generateCrossAisleLayout,
  generateFishboneLayout
} from '@/lib/taro/layout-generator';
import {
  applyInventoryPlacement,
  computePlacementPreview,
  DEFAULT_INVENTORY_PLACEMENT,
  type InventoryPlacementConfig
} from '@/lib/taro/inventory-placement';
import type { Warehouse } from '@/lib/taro/types';

export type LayoutType = 'parallel' | 'segmented' | 'cross-aisle' | 'fishbone';

export interface LayoutConfig {
  type: LayoutType;
  gridHeight: number;
  rackCount: number;
  aisleWidth: number;
  segmentCount: number;
  crossAisleCount: number;
  fbWidth: number;
  fbHeight: number;
  fbTheta: number;
  fbI2: number;
  fbS: number;
  fbAp: number;
  inventoryPlacement: InventoryPlacementConfig;
}

interface LayoutConfigOverlayProps {
  onClose: () => void;
  onApply?: (config: LayoutConfig) => void;
}

export function LayoutConfigOverlay({ onClose, onApply }: LayoutConfigOverlayProps) {
  const [layoutType, setLayoutType] = useState<LayoutType>('parallel');

  // Parallel / Segmented / Cross Aisle Params
  const [gridHeight, setGridHeight] = useState(12);
  const [rackCount, setRackCount] = useState(10);
  const [aisleWidth, setAisleWidth] = useState(2);
  const [segmentCount, setSegmentCount] = useState(2);
  const [crossAisleCount, setCrossAisleCount] = useState(1);

  // Fishbone Params
  const [fbWidth, setFbWidth] = useState(30);
  const [fbHeight, setFbHeight] = useState(20);
  const [fbTheta, setFbTheta] = useState(45);
  const [fbI2, setFbI2] = useState(1);
  const [fbS, setFbS] = useState(4);
  const [fbAp, setFbAp] = useState(0.8);

  // Inventory Placement Params
  const [fastMoverPlacement, setFastMoverPlacement] = useState<number>(DEFAULT_INVENTORY_PLACEMENT.fastMoverPlacement);
  const [productGrouping, setProductGrouping] = useState<number>(DEFAULT_INVENTORY_PLACEMENT.productGrouping);
  const [inventorySpread, setInventorySpread] = useState<number>(DEFAULT_INVENTORY_PLACEMENT.inventorySpread);
  const [hotspotIntensity, setHotspotIntensity] = useState<number>(DEFAULT_INVENTORY_PLACEMENT.hotspotIntensity);

  const inventoryConfig: InventoryPlacementConfig = useMemo(
    () => ({
      fastMoverPlacement,
      productGrouping,
      inventorySpread,
      hotspotIntensity,
    }),
    [fastMoverPlacement, productGrouping, inventorySpread, hotspotIntensity]
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
      case 'segmented':
        return generateSegmentedLayout(gridHeight, rackCount, aisleWidth, segmentCount);
      case 'cross-aisle':
        return generateCrossAisleLayout(gridHeight, rackCount, aisleWidth, crossAisleCount);
      case 'fishbone':
        return generateFishboneLayout(fbWidth, fbHeight, fbTheta, fbI2, fbS, fbAp);
      default:
        return generateParallelLayout(gridHeight, rackCount, aisleWidth);
    }
  }, [
    layoutType, gridHeight, rackCount, aisleWidth, segmentCount, crossAisleCount,
    fbWidth, fbHeight, fbTheta, fbI2, fbS, fbAp
  ]);

  const placementPreview = useMemo(
    () => computePlacementPreview(previewWarehouse, inventoryConfig),
    [previewWarehouse, inventoryConfig]
  );

  // Quick lookup of preview data for rendering.
  const previewCellMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePlacementPreview>['shelves'][number]>();
    for (const s of placementPreview.shelves) {
      map.set(`${s.x},${s.y}`, s);
    }
    return map;
  }, [placementPreview]);

  // A small palette for product groups.
  const GROUP_PALETTE = [
    'bg-rose-500/70',
    'bg-amber-500/70',
    'bg-emerald-500/70',
    'bg-sky-500/70',
    'bg-violet-500/70',
    'bg-pink-500/70',
    'bg-lime-500/70',
    'bg-cyan-500/70',
    'bg-orange-500/70',
    'bg-teal-500/70',
  ];

  const fullWidth = previewWarehouse.width;
  const fullHeight = previewWarehouse.height;

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
    const maxGroupIndex = placementPreview.shelves.reduce(
      (m, s) => Math.max(m, s.groupIndex),
      0
    );
    const useGroupColors = productGrouping >= 30 && maxGroupIndex > 0;

    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        const cell = previewWarehouse.grid[y][x];
        const preview = previewCellMap.get(`${x},${y}`);

        let bgColor = 'bg-slate-100';
        let overlay: React.ReactNode = null;

        if (cell.type === 'worker-start') {
          bgColor = 'bg-orange-500';
        } else if (cell.type === 'shelf') {
          bgColor = 'bg-slate-800';

          if (preview && preview.active) {
            // Density-based blue overlay (z-levels filled)
            const alpha = 0.15 + 0.55 * preview.density;
            const groupColor = useGroupColors
              ? GROUP_PALETTE[preview.groupIndex % GROUP_PALETTE.length]
              : null;

            if (groupColor) {
              overlay = (
                <div
                  className={`absolute inset-0 ${groupColor}`}
                  style={{ opacity: alpha.toFixed(2) }}
                />
              );
            } else {
              overlay = (
                <div
                  className="absolute inset-0 bg-sky-400"
                  style={{ opacity: alpha.toFixed(2) }}
                />
              );
            }

            // Hotspot intensity ring (red glow) — strongest on dominant items
            if (preview.fastMoverScore > 0.15) {
              const glowAlpha = Math.min(0.9, preview.fastMoverScore * 1.2);
              overlay = (
                <>
                  {overlay}
                  <div
                    className="absolute inset-0 ring-2 ring-red-500 pointer-events-none"
                    style={{
                      boxShadow: `inset 0 0 ${Math.round(8 * preview.fastMoverScore)}px rgba(239,68,68,${glowAlpha.toFixed(2)})`,
                      borderColor: `rgba(239,68,68,${glowAlpha.toFixed(2)})`,
                    }}
                  />
                </>
              );
            }

            // Z-level indicators — small dots in the bottom-right
            const dotColor = preview.fastMoverScore > 0.4
              ? 'bg-red-300'
              : 'bg-sky-200';
            const dots = [];
            for (let z = 0; z < preview.zLevels; z++) {
              dots.push(
                <div
                  key={z}
                  className={`absolute w-1 h-1 rounded-full ${dotColor}`}
                  style={{
                    right: 1 + z * 3,
                    bottom: 1,
                  }}
                />
              );
            }
            if (dots.length) {
              overlay = (
                <>
                  {overlay}
                  {dots}
                </>
              );
            }
          } else if (preview) {
            // Inactive shelf — show a faint dotted pattern to communicate "empty"
            overlay = (
              <div
                className="absolute inset-0 bg-slate-700/40"
                style={{ opacity: 0.4 }}
              />
            );
          }
        }

        cells.push(
          <div
            key={`${x}-${y}`}
            style={{ width: cellSize, height: cellSize }}
            className={`relative transition-colors duration-200 ${bgColor}`}
          >
            {overlay}
          </div>
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
      segmentCount,
      crossAisleCount,
      fbWidth,
      fbHeight,
      fbTheta,
      fbI2,
      fbS,
      fbAp,
      inventoryPlacement: inventoryConfig,
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
              <TabsList className="grid grid-cols-4 w-full mb-6">
                <TabsTrigger value="parallel" className="text-xs">Parallel</TabsTrigger>
                <TabsTrigger value="segmented" className="text-xs">Segmented</TabsTrigger>
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

                {(layoutType === 'parallel' || layoutType === 'segmented' || layoutType === 'cross-aisle') && (
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

                {layoutType === 'segmented' && (
                  <div className="space-y-4 border-t pt-6">
                    <Alert className="bg-amber-50/50 border-amber-200/50 p-3 mb-4">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800 text-[11px] font-medium">
                        Experimental: Segmented layout algorithm is still being refined.
                      </AlertDescription>
                    </Alert>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Segment Count</Label>
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{segmentCount}</span>
                    </div>
                    <Slider
                      min={1} max={5} step={1}
                      value={[segmentCount]}
                      onValueChange={(val) => setSegmentCount(val[0])}
                    />
                    <p className="text-xs text-muted-foreground">Breaks racks into vertical segments.</p>
                  </div>
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
                        Experimental: Fishbone layout algorithm is still being refined.
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

                {/* Inventory Placement Section */}
                <Separator className="my-6" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory Placement</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shape how SKUs are distributed across the generated warehouse. Affects inventory generation only.
                  </p>
                </div>

                {/* Fast-Mover Placement */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="h-3.5 w-3.5 text-rose-500" />
                      <Label className="text-sm font-semibold">Fast-Mover Placement</Label>
                    </div>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{fastMoverPlacement}</span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[fastMoverPlacement]}
                    onValueChange={(val) => setFastMoverPlacement(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Spread Out</span>
                    <span>Concentrated Near Dispatch</span>
                  </div>
                </div>

                {/* Product Grouping */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PackageSearch className="h-3.5 w-3.5 text-sky-500" />
                      <Label className="text-sm font-semibold">Product Grouping</Label>
                    </div>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{productGrouping}</span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[productGrouping]}
                    onValueChange={(val) => setProductGrouping(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Scattered</span>
                    <span>Strongly Grouped</span>
                  </div>
                </div>

                {/* Inventory Spread */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Grid className="h-3.5 w-3.5 text-emerald-500" />
                      <Label className="text-sm font-semibold">Inventory Spread</Label>
                    </div>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{inventorySpread}</span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[inventorySpread]}
                    onValueChange={(val) => setInventorySpread(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Compact</span>
                    <span>Fully Distributed</span>
                  </div>
                </div>

                {/* Hotspot Intensity */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-amber-500" />
                      <Label className="text-sm font-semibold">Hotspot Intensity</Label>
                    </div>
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{hotspotIntensity}</span>
                  </div>
                  <Slider
                    min={0} max={100} step={1}
                    value={[hotspotIntensity]}
                    onValueChange={(val) => setHotspotIntensity(val[0])}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Even Demand</span>
                    <span>Few Items Dominate</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground italic pt-2">
                  This affects inventory generation patterns only. Order generation, picking strategies, simulation logic, and worker behaviour are not affected.
                </p>
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

        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-sky-400/70 inline-block rounded-sm" />
          <span>Inventory Density</span>
        </span>

        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 inline-block rounded-sm ring-2 ring-red-500"
            style={{
              boxShadow: "inset 0 0 4px rgba(239,68,68,0.8)",
            }}
          />
          <span>Fast-Mover / Hotspot</span>
        </span>

        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-rose-500/70 inline-block rounded-sm" />
          <span>Product Group</span>
        </span>
      </div>
    </div>
  </ScrollArea>
        </main>
      </div>
    </div>
  );
}
