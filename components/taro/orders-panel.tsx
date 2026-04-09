'use client';

import { useMemo, useRef, useState } from 'react';
import type { Order, Warehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, Plus, Shuffle, Trash2, Upload, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { getItemById, getItems } from '@/lib/taro/items';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  workerCount: number;
}

interface ParsedOrderRow {
  rowNumber: number;
  orderId: string;
  itemId: string;
  sourceValue: string;
  isValid: boolean;
  error?: string;
}

interface ParsedOrdersState {
  rows: ParsedOrderRow[];
}

const REQUIRED_ITEM_HEADERS = ['order_id', 'item_id'] as const;
const INVALID_CSV_FORMAT_MESSAGE = 'Invalid CSV format. Please use the sample format.';
const LOCATION_CSV_NOT_SUPPORTED_MESSAGE = 'Location-based CSV is not supported. Please use order_id,item_id.';
const ITEM_NOT_FOUND_ERROR_MESSAGE = 'Item not found. Please create items before importing orders.';
const SAMPLE_ORDERS_CSV = ['order_id,item_id', 'A,ITEM_001', 'A,ITEM_004', 'B,ITEM_011'].join('\n');

export function OrdersPanel({ orders, onOrdersChange, warehouse, workerCount }: OrdersPanelProps) {
  const [newItemInput, setNewItemInput] = useState<Record<string, string>>({});
  const [parsedCsv, setParsedCsv] = useState<ParsedOrdersState | null>(null);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getLocationIdForItem = (itemId: string): string => getItemById(warehouse ?? { items: [] }, itemId)?.locationId ?? 'Unknown location';

  const availableItems = useMemo(() => {
    if (!warehouse) return [];

    return getItems(warehouse)
      .map(item => ({
        itemId: item.id,
        locationId: item.locationId,
        label: `${item.id} — ${item.locationId}`,
      }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId));
  }, [warehouse]);
  const availableItemIds = useMemo(() => new Set(availableItems.map(item => item.itemId)), [availableItems]);

  const addOrder = () => {
    const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextLabel = orderLabels[orders.length] || `${orders.length + 1}`;
    const newOrder: Order = {
      id: `Order ${nextLabel}`,
      items: [],
      assignedWorkerId: null,
    };
    onOrdersChange([...orders, newOrder]);
    setImportSuccessMessage(null);
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

  const addItemToOrder = (orderId: string, itemId: string) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId ? { ...o, items: [...o.items, { itemId }] } : o
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

  const generateRandom = () => {
    if (!warehouse || availableItems.length === 0) return;
    const randomOrders = generateRandomOrders(warehouse, Math.min(5, Math.max(3, Math.floor(availableItems.length / 3))));
    // Preserve assignedWorkerId=null on generated orders
    onOrdersChange(randomOrders.map(o => ({ ...o, assignedWorkerId: null })));
    setImportSuccessMessage(null);
  };

  const parseOrdersCsv = (csvText: string): ParsedOrdersState => {
    const lines = csvText.split(/\r?\n/);
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);

    if (!firstNonEmptyLine) {
      throw new Error(INVALID_CSV_FORMAT_MESSAGE);
    }

    const headers = firstNonEmptyLine.split(',').map(part => part.trim().toLowerCase());
    const hasItemHeaders =
      headers.length === REQUIRED_ITEM_HEADERS.length &&
      headers.every((header, idx) => header === REQUIRED_ITEM_HEADERS[idx]);
    const hasLocationHeaders = headers.length === 2 && headers[0] === 'order_id' && headers[1] === 'location_id';

    if (hasLocationHeaders) {
      throw new Error(LOCATION_CSV_NOT_SUPPORTED_MESSAGE);
    }

    if (!hasItemHeaders) {
      throw new Error(INVALID_CSV_FORMAT_MESSAGE);
    }

    const headerIndex = lines.findIndex(line => line.trim().length > 0);
    const dataLines = lines.slice(headerIndex + 1);

    const rows: ParsedOrderRow[] = [];

    dataLines.forEach((line, index) => {
      if (line.trim().length === 0) {
        return;
      }

      const [rawOrderId = '', rawValue = '', ...extras] = line.split(',').map(part => part.trim());
      const rowNumber = headerIndex + index + 2;
      const orderId = rawOrderId;
      const sourceValue = rawValue;
      let itemId = '';

      let error: string | undefined;
      if (extras.length > 0) {
        error = 'Too many columns';
      } else if (!orderId) {
        error = 'Missing order_id';
      } else if (!sourceValue || !availableItemIds.has(sourceValue)) {
        error = ITEM_NOT_FOUND_ERROR_MESSAGE;
      } else {
        itemId = sourceValue;
      }

      rows.push({
        rowNumber,
        orderId,
        itemId,
        sourceValue,
        isValid: !error,
        error,
      });
    });

    return { rows };
  };

  const handleUploadCsvClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_ORDERS_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders-sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsingCsv(true);
    setParsedCsv(null);
    setCsvParseError(null);
    setImportSuccessMessage(null);

    try {
      const csvText = await file.text();
      const parsed = parseOrdersCsv(csvText);
      setParsedCsv(parsed);
      setCsvParseError(null);
      setImportSuccessMessage(null);
    } catch (error) {
      setParsedCsv(null);
      const message = error instanceof Error ? error.message : INVALID_CSV_FORMAT_MESSAGE;
      setCsvParseError(message);
      setImportSuccessMessage(null);
    } finally {
      setIsParsingCsv(false);
      event.target.value = '';
    }
  };

  const importValidOrders = () => {
    if (!parsedCsv) {
      return;
    }

    const groupedValidRows = parsedCsv.rows.reduce<Map<string, Order['items']>>((acc, row) => {
      if (!row.isValid) {
        return acc;
      }

      const items = acc.get(row.orderId) ?? [];
      items.push({ itemId: row.itemId });
      acc.set(row.orderId, items);
      return acc;
    }, new Map<string, Order['items']>());

    const importedOrders: Order[] = Array.from(groupedValidRows.entries()).map(([orderId, items]) => ({
      id: orderId,
      items,
      assignedWorkerId: null,
    }));

    if (importedOrders.length === 0) {
      setImportSuccessMessage('Imported 0 orders successfully');
      setParsedCsv(null);
      return;
    }

    onOrdersChange([...orders, ...importedOrders]);
    setImportSuccessMessage(`Imported ${importedOrders.length} orders successfully`);
    setParsedCsv(null);
    setCsvParseError(null);
  };

  const summary = useMemo(() => {
    const totalRows = parsedCsv?.rows.length ?? 0;
    const validRowsData = parsedCsv?.rows.filter(row => row.isValid) ?? [];
    const validRows = validRowsData.length;
    const invalidRows = totalRows - validRows;
    const totalOrders = new Set(validRowsData.map(row => row.orderId)).size;
    const totalItems = validRows;
    const uniqueLocations = new Set(validRowsData.map(row => getLocationIdForItem(row.itemId))).size;
    return { totalRows, validRows, invalidRows, totalOrders, totalItems, uniqueLocations };
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
            disabled={isParsingCsv}
            className="h-7 text-xs px-2"
            title="Upload order CSV"
          >
            {isParsingCsv ? (
              <>
                <Spinner className="h-3 w-3 mr-1" />
                Parsing CSV...
              </>
            ) : (
              <>
                <Upload className="h-3 w-3 mr-1" />
                Upload CSV
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={generateRandom}
            disabled={availableItems.length === 0}
            className="h-7 text-xs px-2"
            title="Generate random orders"
          >
            <Shuffle className="h-3 w-3" />
          </Button>
        </div>
        <div className="mt-1">
          <Button
            variant="link"
            size="sm"
            onClick={handleDownloadSampleCsv}
            className="h-6 px-0 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Download sample CSV
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
            {csvParseError}
          </div>
        )}
        {importSuccessMessage && (
          <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
            {importSuccessMessage}
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

            {summary.invalidRows > 0 && (
              <Alert className="py-2 px-3 border-amber-300/70 bg-amber-50/80 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-[11px] text-amber-900">
                  Some rows could not be imported
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <div>Total rows: <span className="font-semibold">{summary.totalRows}</span></div>
              <div>Valid rows: <span className="font-semibold text-emerald-600">{summary.validRows}</span></div>
              <div>Total orders: <span className="font-semibold">{summary.totalOrders}</span></div>
              <div>Total items: <span className="font-semibold">{summary.totalItems}</span></div>
              <div>Unique locations: <span className="font-semibold">{summary.uniqueLocations}</span></div>
              <div>Invalid rows: <span className="font-semibold text-destructive">{summary.invalidRows}</span></div>
            </div>

            <div className="max-h-56 overflow-auto border border-border rounded-lg">
              <table className="w-full min-w-[320px] text-[11px]">
                <thead className="bg-muted/70 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-2 py-1 font-medium">Order ID</th>
                    <th className="px-2 py-1 font-medium">Item ID</th>
                    <th className="px-2 py-1 font-medium">Mapped Location</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedCsv.rows.map(row => (
                    <tr
                      key={`${row.rowNumber}-${row.orderId}-${row.sourceValue}`}
                      className={row.isValid ? 'border-t border-border' : 'border-t border-destructive/30 bg-destructive/10'}
                    >
                      <td className="px-2 py-1 font-mono">{row.orderId || '—'}</td>
                      <td className="px-2 py-1 font-mono">{row.itemId || row.sourceValue || '—'}</td>
                      <td className="px-2 py-1 font-mono">
                        {row.isValid && row.itemId ? getLocationIdForItem(row.itemId) : '—'}
                      </td>
                      <td className="px-2 py-1">
                        {row.isValid ? (
                          <div>✅ Valid</div>
                        ) : (
                          <div>❌ Invalid{row.error ? ` (${row.error})` : ''}</div>
                        )}
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
                onClick={importValidOrders}
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
            <div className="text-sm text-foreground">No orders yet</div>
            <div className="text-xs">Upload CSV or create orders manually</div>
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

              {/* Items list */}
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={`${item.itemId}-${idx}`} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                    <div className="min-w-0">
                      <div className="font-mono text-foreground truncate">{item.itemId}</div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate">{getLocationIdForItem(item.itemId)}</div>
                    </div>
                    <button
                      onClick={() => removeItemFromOrder(order.id, idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add item input */}
              <div className="flex gap-1">
                <select
                  value={newItemInput[order.id] || ''}
                  onChange={e => setNewItemInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                  disabled={availableItems.length === 0}
                  className="h-7 text-xs flex-1 rounded border border-border bg-background text-foreground px-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">{availableItems.length === 0 ? 'No items available' : 'Select item…'}</option>
                  {availableItems.map(itemOption => (
                    <option key={itemOption.itemId} value={itemOption.itemId}>
                      {itemOption.label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => {
                    const value = newItemInput[order.id] || '';
                    const isValidItemId = availableItems.some(item => item.itemId === value);
                    if (value.trim() !== '' && isValidItemId) {
                      addItemToOrder(order.id, value);
                    }
                  }}
                  disabled={availableItems.length === 0 || !newItemInput[order.id] || !availableItems.some(item => item.itemId === newItemInput[order.id])}
                  className="h-7 px-2"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {availableItems.length === 0 && (
                <div className="text-[11px] text-amber-700">No items available. Add items to shelves first.</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
