'use client';

import { useState } from 'react';
import type { Warehouse, StorageLocation } from '@/lib/taro/types';
import { cn } from '@/lib/utils';
import { X, Wand2, Upload } from 'lucide-react';
import { buildCoordinateLocations, getShelfLocationId } from '@/lib/taro/layout';

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
  const width = Math.max(racksPerAisle * 3 + 6, 10);
  const height = Math.max(aisles * 3 + 6, 10);

  const grid: Warehouse['grid'] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({ type: 'empty' as const, x, y, locations: [] }))
  );

  const shelves: Warehouse['shelves'] = [];
  let itemId = 1;

  for (let a = 0; a < aisles; a++) {
    const row = 2 + a * 3 + (a % 2); // intentionally irregular row offsets

    for (let r = 0; r < racksPerAisle; r++) {
      const col = 2 + r * 3 + ((a + r) % 2); // intentionally irregular rack spacing
      if (col >= width) break;

      // Place shelf block with storage locations
      const locations: StorageLocation[] = [];

      for (let b = 0; b < binsPerRack; b++) {
        if (itemId > aisles * racksPerAisle * binsPerRack) break;

        // Create z-levels for this bin (1-3 levels per bin)
        const numZLevels = Math.min(3, Math.floor(Math.random() * 3) + 1);

        for (let z = 1; z <= numZLevels; z++) {
          const sku = `SKU_${String(itemId).padStart(3, '0')}`;
          const quantity = Math.floor(Math.random() * 90) + 10;
          locations.push({
            id: `${sku}@${col},${row},${z}`,
            locationId: getShelfLocationId(col, row),
            x: col,
            y: row,
            z,
            sku,
            quantity,
          });
        }
        itemId++;
      }

      grid[row][col] = { type: 'shelf', x: col, y: row, locations };
      shelves.push({ x: col, y: row });
    }
  }

  // Worker start at bottom-left accessible cell
  const workerStart = { x: 0, y: height - 1 };
  grid[workerStart.y][workerStart.x] = { type: 'worker-start', x: 0, y: height - 1, locations: [] };

  const warehouse: Warehouse = {
    width,
    height,
    grid,
    shelves,
    workerStart,
    locations: [],
  };
  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

function parseCSVWarehouse(csvText: string): Warehouse | null {
  try {
    const lines = csvText.trim().split('\n');
    const dataLines = lines[0].toLowerCase().includes('aisle') ? lines.slice(1) : lines;

    interface BinEntry { aisle: string; rack: number; bin: number; sku: string; z?: number }
    const entries: BinEntry[] = dataLines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => {
        const parts = l.split(',');
        // Support: Aisle,Rack,Bin,SKU or Aisle,Rack,Bin,Level,SKU
        const hasLevel = parts.length >= 5;
        return {
          aisle: parts[0]?.trim().toUpperCase() ?? 'A1',
          rack: parseInt(parts[1] ?? '1', 10),
          bin: parseInt(parts[2] ?? '1', 10),
          z: hasLevel ? parseInt(parts[3] ?? '1', 10) : undefined,
          sku: hasLevel ? parts[4]?.trim() : parts[3]?.trim() ?? 'Item',
        };
      })
      .filter(e => !isNaN(e.rack) && !isNaN(e.bin));

    if (entries.length === 0) return null;

    // Step 1: Determine unique sorted aisle labels and max rack index
    const aisleLabels = Array.from(new Set(entries.map(e => e.aisle))).sort();
    const aisleIndex = new Map(aisleLabels.map((a, i) => [a, i]));
    const maxRack = Math.max(...entries.map(e => e.rack));

    const width = Math.max(maxRack * 3 + 6, 10);
    const height = Math.max(aisleLabels.length * 3 + 6, 10);

    const grid: Warehouse['grid'] = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => ({ type: 'empty' as const, x, y, locations: [] }))
    );

    const shelves: Warehouse['shelves'] = [];
    let itemId = 1;

    // Step 2: Group entries by (aisle, rack) to create one shelf per unique pair
    const shelfMap = new Map<string, BinEntry[]>();
    for (const entry of entries) {
      const key = `${entry.aisle}:${entry.rack}`;
      if (!shelfMap.has(key)) shelfMap.set(key, []);
      shelfMap.get(key)!.push(entry);
    }

    // Step 3: Create shelves first, then place locations inside them
    for (const [key, binEntries] of shelfMap) {
      const [aisleLabel, rackStr] = key.split(':');
      const ai = aisleIndex.get(aisleLabel) ?? 0;
      const rackNum = parseInt(rackStr, 10);

      // Shelf cell position
      const shelfRow = 2 + ai * 3 + (ai % 2);
      const shelfCol = 2 + (rackNum - 1) * 3 + ((ai + rackNum) % 2);

      if (shelfRow >= height || shelfCol >= width) continue;

      // Build storage locations for this shelf
      const locations: StorageLocation[] = [];

      for (const entry of binEntries) {
        // Default to z=1 if not specified
        const zLevel = entry.z ?? 1;
        const sku = entry.sku || `SKU_${String(itemId).padStart(3, '0')}`;
        locations.push({
          id: `${sku}@${shelfCol},${shelfRow},${zLevel}`,
          locationId: getShelfLocationId(shelfCol, shelfRow),
          x: shelfCol,
          y: shelfRow,
          z: zLevel,
          sku,
          quantity: Math.floor(Math.random() * 90) + 10,
        });
        itemId++;
      }

      // Place the shelf block with locations
      grid[shelfRow][shelfCol] = { type: 'shelf', x: shelfCol, y: shelfRow, locations };
      shelves.push({ x: shelfCol, y: shelfRow });
    }

    // Worker start at bottom-left corner
    const workerStart = { x: 0, y: height - 1 };
    grid[workerStart.y][workerStart.x] = { type: 'worker-start', x: 0, y: height - 1, locations: [] };

    const warehouse: Warehouse = { width, height, grid, shelves, workerStart, locations: [] };
    warehouse.locations = buildCoordinateLocations(warehouse);
    return warehouse;
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
      setCsvError('Could not parse CSV. Expected columns: Aisle, Rack, Bin, [Level], SKU');
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
                Enter your warehouse dimensions and the system will auto-generate the layout with aisles, racks, and storage locations at multiple z-levels.
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
                <div>{aisles * racks * bins} bin slots with z-levels</div>
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
                Paste your warehouse location data as CSV. Expected columns: <span className="font-mono text-foreground">Aisle, Rack, Bin, [Level], SKU</span>
              </p>
              <div className="bg-muted/30 rounded p-3 font-mono text-xs text-muted-foreground space-y-0.5">
                <div className="text-foreground font-medium mb-1">Example format:</div>
                <div>Aisle,Rack,Bin,SKU</div>
                <div>A1,1,1,ITEM-001</div>
                <div>A1,1,2,ITEM-002</div>
                <div>A2,3,1,LEVEL,ITEM-015</div>
                <div className="text-xs text-muted-foreground/70 mt-2">Level column is optional (defaults to 1)</div>
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
