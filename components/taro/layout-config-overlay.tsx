'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LayoutConfigOverlayProps {
  onClose: () => void;
  onApply?: (config: { rows: number; rowLength: number; aisleWidth: number }) => void;
}

type CellType = 'rack' | 'aisle';

export function LayoutConfigOverlay({ onClose, onApply }: LayoutConfigOverlayProps) {
  const [rows, setRows] = useState(12);
  const [rowLength, setRowLength] = useState(30);
  const [aisleWidth, setAisleWidth] = useState(2);

  const grid = useMemo(() => {
    const newGrid: CellType[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: CellType[] = [];
      for (let x = 0; x < rowLength; x++) {
        // Parallel layout: 1 rack column followed by aisleWidth aisle columns
        const cycleWidth = 1 + aisleWidth;
        if (x % cycleWidth === 0) {
          row.push('rack');
        } else {
          row.push('aisle');
        }
      }
      newGrid.push(row);
    }
    return newGrid;
  }, [rows, rowLength, aisleWidth]);

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
              {/* Rows Control */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rows" className="text-sm font-semibold text-foreground">
                    Rows
                  </Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {rows}
                  </span>
                </div>
                <Slider
                  id="rows"
                  min={4}
                  max={20}
                  step={1}
                  value={[rows]}
                  onValueChange={(val) => setRows(val[0])}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The vertical height of the warehouse grid.
                </p>
              </div>

              {/* Row Length Control */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rowLength" className="text-sm font-semibold text-foreground">
                    Row Length
                  </Label>
                  <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    {rowLength}
                  </span>
                </div>
                <Slider
                  id="rowLength"
                  min={10}
                  max={50}
                  step={1}
                  value={[rowLength]}
                  onValueChange={(val) => setRowLength(val[0])}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The horizontal width of the warehouse grid.
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
                onApply?.({ rows, rowLength, aisleWidth });
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
              gridTemplateColumns: `repeat(${rowLength}, 1fr)`,
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
