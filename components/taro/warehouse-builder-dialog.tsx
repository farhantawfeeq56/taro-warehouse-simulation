'use client';

import { useState } from 'react';
import type { Warehouse } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { X, Wand2, Upload } from 'lucide-react';

interface WarehouseBuilderDialogProps {
  onGenerate: (warehouse: Warehouse) => void;
  onClose: () => void;
}

type Tab = 'guided' | 'csv';

function buildWarehouseFromParams(
  aisles: number,
  racksPerAisle: number,
  binsPerRack: number
): Warehouse {
  // Layout: each aisle is a horizontal row of shelf cells
  // Spacing: 2 empty columns between aisles (walking paths)
  // Grid width = racksPerAisle * 2 (shelf + gap)
  // Grid height = aisles * 3 (shelf row + 2 path rows)

  const RACK_SPACING = 2;  // cells per rack slot (shelf + aisle gap)
  const AISLE_HEIGHT = 3;  // rows per aisle (1 shelf + 2 path)

  const width = Math.max(racksPerAisle * RACK_SPACING + 2, 10);
  const height = Math.max(aisles * AISLE_HEIGHT + 2, 10);

  const grid: Warehouse['grid'] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'empty' as const }))
  );

  const items: Warehouse['items'] = [];
  let itemId = 1;
  let shelfCount = 0;

  for (let a = 0; a < aisles; a++) {
    const row = 1 + a * AISLE_HEIGHT; // shelf row

    for (let r = 0; r < racksPerAisle; r++) {
      const col = 1 + r * RACK_SPACING;
      if (col >= width) break;

      // Place shelf block
      grid[row][col] = { type: 'shelf' };
      shelfCount++;

      // Place items (one per bin slot) on adjacent accessible cell
      const itemRow = row; // items placed on shelf cell itself
      for (let b = 0; b < binsPerRack; b++) {
        if (itemId > aisles * racksPerAisle * binsPerRack) break;
        if (b === 0) {
          // First bin: item on the shelf cell
          grid[itemRow][col] = { type: 'item', itemId };
          items.push({ id: itemId, x: col, y: itemRow });
          itemId++;
        }
      }
    }
  }

  // Worker start at bottom-left accessible cell
  const workerStart = { x: 0, y: height - 1 };
  grid[workerStart.y][workerStart.x] = { type: 'worker-start' };

  return {
    width,
    height,
    grid,
    items,
    shelves: [],
    workerStart,
  };
}

function parseCSVWarehouse(csvText: string): Warehouse | null {
  try {
    const lines = csvText.trim().split('\n');
    const dataLines = lines[0].toLowerCase().includes('aisle') ? lines.slice(1) : lines;

    interface BinEntry { aisle: string; rack: number; bin: number; sku: string }
    const entries: BinEntry[] = dataLines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => {
        const parts = l.split(',');
        return {
          aisle: parts[0]?.trim() ?? 'A',
          rack: parseInt(parts[1] ?? '1', 10),
          bin: parseInt(parts[2] ?? '1', 10),
          sku: parts[3]?.trim() ?? 'Item',
        };
      })
      .filter(e => !isNaN(e.rack) && !isNaN(e.bin));

    if (entries.length === 0) return null;

    const aisles = Array.from(new Set(entries.map(e => e.aisle))).sort();
    const maxRack = Math.max(...entries.map(e => e.rack));

    const RACK_SPACING = 2;
    const AISLE_HEIGHT = 3;
    const width = Math.max(maxRack * RACK_SPACING + 2, 10);
    const height = Math.max(aisles.length * AISLE_HEIGHT + 2, 10);

    const grid: Warehouse['grid'] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ type: 'empty' as const }))
    );
    const items: Warehouse['items'] = [];
    let itemId = 1;

    for (let ai = 0; ai < aisles.length; ai++) {
      const aisleEntries = entries.filter(e => e.aisle === aisles[ai]);
      const row = 1 + ai * AISLE_HEIGHT;

      for (const entry of aisleEntries) {
        const col = 1 + (entry.rack - 1) * RACK_SPACING;
        if (col >= width || row >= height) continue;
        grid[row][col] = { type: 'item', itemId };
        items.push({ id: itemId, x: col, y: row });
        itemId++;
      }
    }

    const workerStart = { x: 0, y: height - 1 };
    grid[workerStart.y][workerStart.x] = { type: 'worker-start' };

    return { width, height, grid, items, shelves: [], workerStart };
  } catch {
    return null;
  }
}

export function WarehouseBuilderDialog({ onGenerate, onClose }: WarehouseBuilderDialogProps) {
  const [tab, setTab] = useState<Tab>('guided');
  const [aisles, setAisles] = useState(4);
  const [racks, setRacks] = useState(6);
  const [bins, setBins] = useState(3);
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState('');

  const handleGenerate = () => {
    const wh = buildWarehouseFromParams(aisles, racks, bins);
    onGenerate(wh);
    onClose();
  };

  const handleCSVImport = () => {
    if (!csvText.trim()) {
      setCsvError('Please paste CSV data first.');
      return;
    }
    const wh = parseCSVWarehouse(csvText);
    if (!wh) {
      setCsvError('Could not parse CSV. Expected columns: Aisle, Rack, Bin, SKU');
      return;
    }
    onGenerate(wh);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-bold">Setup Warehouse</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Define your warehouse layout to get started</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['guided', 'csv'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
                tab === t
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'guided' ? 'Guided Builder' : 'Import from CSV'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'guided' ? (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your warehouse dimensions and the system will auto-generate the layout with aisles, racks, and item locations.
              </p>

              {[
                { label: 'Number of Aisles', desc: 'Rows of shelving in your warehouse', value: aisles, min: 1, max: 12, set: setAisles },
                { label: 'Racks per Aisle', desc: 'Shelf units along each aisle', value: racks, min: 1, max: 16, set: setRacks },
                { label: 'Bins per Rack', desc: 'Storage slots per rack unit', value: bins, min: 1, max: 8, set: setBins },
              ].map(({ label, desc, value, min, max, set }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">{label}</label>
                    <span className="text-xs font-mono text-muted-foreground">{value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={e => set(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground/60">
                    <span>{min}</span><span>{max}</span>
                  </div>
                </div>
              ))}

              <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-0.5">
                <div className="font-medium text-foreground">Preview</div>
                <div>{aisles} aisles × {racks} racks = {aisles * racks} rack units</div>
                <div>{aisles * racks * bins} total bin slots</div>
              </div>

              <button
                onClick={handleGenerate}
                className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Wand2 className="h-4 w-4" />
                Generate Layout
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Paste your warehouse location data as CSV. Expected columns: <span className="font-mono text-foreground">Aisle, Rack, Bin, SKU</span>
              </p>
              <div className="bg-muted/30 rounded p-3 font-mono text-xs text-muted-foreground space-y-0.5">
                <div className="text-foreground font-medium mb-1">Example format:</div>
                <div>Aisle,Rack,Bin,SKU</div>
                <div>A1,1,1,ITEM-001</div>
                <div>A1,1,2,ITEM-002</div>
                <div>A2,3,1,ITEM-015</div>
              </div>
              <textarea
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setCsvError(''); }}
                rows={6}
                placeholder="Paste your warehouse CSV here..."
                className="w-full text-xs font-mono border border-border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
              />
              {csvError && <p className="text-xs text-red-500">{csvError}</p>}
              <button
                onClick={handleCSVImport}
                className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Import Layout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
