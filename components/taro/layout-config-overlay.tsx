'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { X, Columns, Layout, Grid, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  generateParallelLayout, 
  generateSegmentedLayout, 
  generateCrossAisleLayout, 
  generateFishboneLayout 
} from '@/lib/taro/layout-generator';
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
    for (let y = 0; y < fullHeight; y++) {
      for (let x = 0; x < fullWidth; x++) {
        const cell = previewWarehouse.grid[y][x];
        let bgColor = 'bg-slate-100';
        if (cell.type === 'shelf') bgColor = 'bg-slate-800';
        if (cell.type === 'worker-start') bgColor = 'bg-orange-500';
        
        cells.push(
          <div
            key={`${x}-${y}`}
            style={{ width: cellSize, height: cellSize }}
            className={`transition-colors duration-200 ${bgColor}`}
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
      segmentCount,
      crossAisleCount,
      fbWidth,
      fbHeight,
      fbTheta,
      fbI2,
      fbS,
      fbAp
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
            <p className="text-xs text-muted-foreground">Select a template and customize its parameters</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <aside className="w-[360px] border-r bg-card flex flex-col">
          <Tabs 
            value={layoutType} 
            onValueChange={(v) => setLayoutType(v as LayoutType)} 
            className="flex-1 flex flex-col"
          >
            <div className="px-6 pt-6">
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="parallel" className="text-xs">Parallel</TabsTrigger>
                <TabsTrigger value="segmented" className="text-xs">Segmented</TabsTrigger>
                <TabsTrigger value="cross-aisle" className="text-xs">Cross Aisle</TabsTrigger>
                <TabsTrigger value="fishbone" className="text-xs">Fishbone</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 pt-0 space-y-8">
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
                  <div className="space-y-4 border-t pt-8">
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
        <main ref={containerRef} className="flex-1 bg-muted/20 overflow-auto flex items-center justify-center p-8">
          <div 
            className="grid gap-px border border-border bg-border shadow-inner p-px rounded-sm"
            style={{
              gridTemplateColumns: `repeat(${fullWidth}, ${cellSize}px)`,
              width: 'max-content',
            }}
          >
            {renderGrid()}
          </div>
        </main>
      </div>
    </div>
  );
}
