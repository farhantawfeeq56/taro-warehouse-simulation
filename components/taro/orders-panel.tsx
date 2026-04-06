'use client';

import { useMemo, useRef, useState } from 'react';
import type { Order, Warehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Shuffle, X, Upload } from 'lucide-react';
import { generateRandomOrders } from '@/lib/taro/demo-generator';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  workerCount: number;
}

interface ParsedOrderRow {
  rowNumber: number;
  orderId: string;
  locationId: string;
  isValid: boolean;
  error?: string;
}

interface ParsedOrdersState {
  rows: ParsedOrderRow[];
  orders: Order[];
}

export function OrdersPanel({ orders, onOrdersChange, warehouse, workerCount }: OrdersPanelProps) {
  const [newItemInput, setNewItemInput] = useState<Record<string, string>>({});
  const [parsedCsv, setParsedCsv] = useState<ParsedOrdersState | null>(null);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get all available shelf locations that contain items.
  const availableLocations = useMemo(() => {
    if (!warehouse) return [];

    return warehouse.locations.filter(location => location.items.length > 0);
  }, [warehouse]);
  const allLocationIds = useMemo(
    () => new Set((warehouse?.locations ?? []).map(location => location.id)),
    [warehouse]
  );

  const addOrder = () => {
    const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextLabel = orderLabels[orders.length] || `${orders.length + 1}`;
    const newOrder: Order = {
      id: `Order ${nextLabel}`,
      items: [],
      assignedWorkerId: null,
    };
    onOrdersChange([...orders, newOrder]);
  };

  const deleteOrder = (orderId: string) => {
    onOrdersChange(orders.filter(o => o.id !== orderId));
  };

  const setAssignment = (orderId: string, value: string) => {
    const assignedWorkerId = value === 'auto' ? null : parseInt(value, 10);
    onOrdersChange(
      orders.map(o => o.id === orderId ? { ...o, assignedWorkerId } : o)
    );
  };

  const addItemToOrder = (orderId: string, locationId: string) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId ? { ...o, items: [...o.items, locationId] } : o
      )
    );
    setNewItemInput(prev => ({ ...prev, [orderId]: '' }));
  };

  const removeItemFromOrder = (orderId: string, itemIndex: number) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId
          ? { ...o, items: o.items.filter((_, i) => i !== itemIndex) }
          : o
      )
    );
  };

  const handleItemInputKeyDown = (orderId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = newItemInput[orderId] || '';
      const isValidLocationId = availableLocations.some(location => location.id === value);
      if (value.trim() !== '' && isValidLocationId) {
        addItemToOrder(orderId, value);
      }
    }
  };

  const generateRandom = () => {
    if (!warehouse || availableLocations.length === 0) return;
    const randomOrders = generateRandomOrders(warehouse, Math.min(5, Math.max(3, Math.floor(availableLocations.length / 3))));
    // Preserve assignedWorkerId=null on generated orders
    onOrdersChange(randomOrders.map(o => ({ ...o, assignedWorkerId: null })));
  };

  const parseOrdersCsv = (csvText: string): ParsedOrdersState => {
    const lines = csvText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new Error('CSV is empty.');
    }

    const [header, ...dataLines] = lines;
    if (header.toLowerCase() !== 'order_id,location_id') {
      throw new Error('CSV header must be exactly: order_id,location_id');
    }

    const rows: ParsedOrderRow[] = [];
    const groupedValidLocations = new Map<string, string[]>();

    dataLines.forEach((line, index) => {
      const [rawOrderId = '', rawLocationId = '', ...extras] = line.split(',').map(part => part.trim());
      const rowNumber = index + 2;
      const orderId = rawOrderId;
      const locationId = rawLocationId;

      let error: string | undefined;
      if (extras.length > 0) {
        error = 'Too many columns';
      } else if (!orderId) {
        error = 'Missing order_id';
      } else if (!locationId) {
        error = 'Missing location_id';
      } else if (!allLocationIds.has(locationId)) {
        error = `Location not found: ${locationId}`;
      }

      const isValid = !error;
      rows.push({ rowNumber, orderId, locationId, isValid, error });

      if (isValid) {
        const current = groupedValidLocations.get(orderId) ?? [];
        current.push(locationId);
        groupedValidLocations.set(orderId, current);
      }
    });

    const parsedOrders: Order[] = Array.from(groupedValidLocations.entries()).map(([orderId, items]) => ({
      id: orderId,
      items,
      assignedWorkerId: null,
    }));

    return { rows, orders: parsedOrders };
  };

  const handleUploadCsvClick = () => {
    fileInputRef.current?.click();
  };

  const handleCsvSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const parsed = parseOrdersCsv(csvText);
      setParsedCsv(parsed);
      setCsvParseError(null);
      console.log('Parsed CSV orders (temporary state):', parsed.orders);
    } catch (error) {
      setParsedCsv(null);
      setCsvParseError(error instanceof Error ? error.message : 'Failed to parse CSV');
    } finally {
      event.target.value = '';
    }
  };

  const summary = useMemo(() => {
    const totalRows = parsedCsv?.rows.length ?? 0;
    const validRows = parsedCsv?.rows.filter(row => row.isValid).length ?? 0;
    const invalidRows = totalRows - validRows;
    const uniqueOrders = new Set(parsedCsv?.rows.map(row => row.orderId).filter(Boolean) ?? []).size;
    return { totalRows, validRows, invalidRows, uniqueOrders };
  }, [parsedCsv]);

  const WORKER_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

  return (
    <div className="w-72 border-r border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-xs text-muted-foreground">{orders.length} orders</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={addOrder}
            className="flex-1 h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUploadCsvClick}
            className="h-7 text-xs px-2"
            title="Upload order CSV"
          >
            <Upload className="h-3 w-3 mr-1" />
            Upload CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={generateRandom}
            disabled={availableLocations.length === 0}
            className="h-7 text-xs px-2"
            title="Generate random orders"
          >
            <Shuffle className="h-3 w-3" />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvSelected}
          className="hidden"
        />
        {csvParseError && (
          <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            CSV parse error: {csvParseError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {parsedCsv && (
          <div className="border border-border rounded-lg bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">CSV Preview</div>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setParsedCsv(null)}>
                Close
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <div>Total rows: <span className="font-semibold">{summary.totalRows}</span></div>
              <div>Valid rows: <span className="font-semibold text-emerald-600">{summary.validRows}</span></div>
              <div>Invalid rows: <span className="font-semibold text-destructive">{summary.invalidRows}</span></div>
              <div>Unique orders: <span className="font-semibold">{summary.uniqueOrders}</span></div>
            </div>

            <div className="max-h-52 overflow-auto border border-border rounded">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1 font-medium">Order ID</th>
                    <th className="px-2 py-1 font-medium">Location ID</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedCsv.rows.map(row => (
                    <tr
                      key={`${row.rowNumber}-${row.orderId}-${row.locationId}`}
                      className={row.isValid ? 'border-t border-border' : 'border-t border-destructive/30 bg-destructive/10'}
                    >
                      <td className="px-2 py-1 font-mono">{row.orderId || '—'}</td>
                      <td className="px-2 py-1 font-mono">{row.locationId || '—'}</td>
                      <td className="px-2 py-1">
                        {row.isValid ? '✅ Valid' : `❌ Invalid${row.error ? ` (${row.error})` : ''}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs flex-1"
                disabled={summary.validRows === 0}
                onClick={() => console.log('Import valid orders clicked (hook pending):', parsedCsv.orders)}
              >
                Import valid orders
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setParsedCsv(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
            <div>No orders yet</div>
            <div className="text-xs">Click &apos;Add Order&apos; to get started</div>
          </div>
        ) : (
          orders.map(order => (
            <div
              key={order.id}
              className="border border-border rounded-lg bg-card p-3 space-y-2 hover:border-muted-foreground/50 transition-colors"
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{order.id}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteOrder(order.id)}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                  title="Delete order"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Assignment dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Assigned to</span>
                <div className="relative flex-1">
                  {order.assignedWorkerId !== null && (
                    <span
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                      style={{ backgroundColor: WORKER_COLORS[(order.assignedWorkerId - 1) % WORKER_COLORS.length] }}
                    />
                  )}
                  <select
                    value={order.assignedWorkerId === null ? 'auto' : String(order.assignedWorkerId)}
                    onChange={e => setAssignment(order.id, e.target.value)}
                    className={[
                      'w-full h-7 text-xs rounded border border-border bg-background text-foreground',
                      'focus:outline-none focus:ring-1 focus:ring-primary appearance-none',
                      order.assignedWorkerId !== null ? 'pl-5 pr-2' : 'px-2',
                    ].join(' ')}
                  >
                    <option value="auto">Auto</option>
                    {Array.from({ length: workerCount }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        Worker {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Items ({order.items.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {order.items.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No items</span>
                  ) : (
                    order.items.map((locationId, index) => (
                      <span
                        key={`${order.id}-${index}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-mono font-medium rounded border border-primary/20 group"
                        title={locationId}
                      >
                        {locationId}
                        <button
                          onClick={() => removeItemFromOrder(order.id, index)}
                          className="text-primary/50 hover:text-primary group-hover:opacity-100 opacity-0 transition-opacity"
                          title="Remove item"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Add item */}
              <div className="flex gap-1.5 pt-1">
                <Input
                  type="text"
                  placeholder="Shelf location ID"
                  list="available-locations"
                  value={newItemInput[order.id] || ''}
                  onChange={e => setNewItemInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                  onKeyDown={e => handleItemInputKeyDown(order.id, e)}
                  className="h-7 text-xs flex-1"
                />
                <datalist id="available-locations">
                  {availableLocations.slice(0, 20).map(location => (
                    <option key={location.id} value={location.id} />
                  ))}
                </datalist>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const value = newItemInput[order.id] || '';
                    const isValidLocationId = availableLocations.some(location => location.id === value);
                    if (value.trim() !== '' && isValidLocationId) {
                      addItemToOrder(order.id, value);
                    }
                  }}
                  className="h-7 px-3 text-xs"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border bg-muted/30">
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span className="font-medium">Total Items:</span>
            <span className="font-mono font-semibold text-foreground">
              {orders.reduce((sum, o) => sum + o.items.length, 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Unique Locations:</span>
            <span className="font-mono font-semibold text-foreground">
              {new Set(orders.flatMap(o => o.items)).size}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
