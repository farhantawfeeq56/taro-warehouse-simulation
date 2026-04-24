'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LayoutConfigOverlayProps {
  onClose: () => void;
  onApply?: (config: { gridHeight: number; rackCount: number; aisleWidth: number }) => void;
}

type CellType = 'rack' | 'aisle';

export function LayoutConfigOverlay({ onClose, onApply }: LayoutConfigOverlayProps) {
  const [gridHeight, setGridHeight] = useState(12);
  const [rackCount, setRackCount] = useState(10);
  const [aisleWidth, setAisleWidth] = useState(2);

  const totalWidth = useMemo(() => {
    return rackCount + (rackCount - 1) * aisleWidth;
  }, [rackCount, aisleWidth]);

  const grid = useMemo(() => {
    const newGrid: CellType[][] = Array.from({ length: gridHeight }, () =>
      Array.from({ length: totalWidth }, () => 'aisle')
    );

    for (let rackIndex = 0; rackIndex < rackCount; rackIndex++) {
      const x = rackIndex * (1 + aisleWidth);
      for (let y = 0; y < gridHeight; y++) {
        if (x < totalWidth) {
          newGrid[y][x] = 'rack';
        }
      }
    }
    return newGrid;
  }, [gridHeight, totalWidth, rackCount, aisleWidth]);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card">
        <h1 className="text-xl font-bold tracking-tight">Configure Layout</h1>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <aside className="w-[320px] border-r bg-card flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              {/* Grid Height Control */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gridHeight" className="text-sm font-semibold text-foreground">
                    Grid Height
                  </Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {gridHeight}
                  </span>
                </div>
                <Slider
                  id="gridHeight"
                  min={4}
                  max={40}
                  step={1}
                  value={[gridHeight]}
                  onValueChange={(val) => setGridHeight(val[0])}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The vertical height of the warehouse grid.
                </p>
              </div>

              {/* Rack Count Control */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rackCount" className="text-sm font-semibold text-foreground">
                    Rack Count
                  </Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {rackCount}
                  </span>
                </div>
                <Slider
                  id="rackCount"
                  min={4}
                  max={20}
                  step={1}
                  value={[rackCount]}
                  onValueChange={(val) => setRackCount(val[0])}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The number of parallel rack columns in the warehouse.
                </p>
              </div>

              {/* Aisle Width Control */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="aisleWidth" className="text-sm font-semibold text-foreground">
                    Aisle Width
                  </Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {aisleWidth}
                  </span>
                </div>
                <Slider
                  id="aisleWidth"
                  min={1}
                  max={4}
                  step={1}
                  value={[aisleWidth]}
                  onValueChange={(val) => setAisleWidth(val[0])}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Number of aisle cells between rack columns.
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="p-6 border-t bg-card/50">
            <Button 
              className="w-full" 
              onClick={() => {
                onApply?.({ gridHeight, rackCount, aisleWidth });
                onClose();
              }}
            >
              Apply Configuration
            </Button>
          </div>
        </aside>

        {/* Right Panel - Live Preview */}
        <main className="flex-1 bg-muted/20 overflow-auto flex items-center justify-center p-8">
          <div 
            className="grid gap-px border border-border bg-border shadow-inner p-px rounded-sm"
            style={{
              gridTemplateColumns: `repeat(${totalWidth}, 1fr)`,
              width: 'max-content',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            {grid.map((row, y) => (
              row.map((cell, x) => (
                <div
                  key={`${x}-${y}`}
                  className={`
                    w-6 h-6 sm:w-8 sm:h-8 transition-colors duration-200
                    ${cell === 'rack' ? 'bg-slate-800' : 'bg-slate-100'}
                  `}
                  title={`${cell} at (${x}, ${y})`}
                />
              ))
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
