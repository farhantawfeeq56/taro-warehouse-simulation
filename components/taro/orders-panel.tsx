'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, Warehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Shuffle, Trash2, X, AlertTriangle, Upload, Download } from 'lucide-react';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { collectSkuIds, getBinForSku, getShelfIdForSku } from '@/lib/taro/inventory';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  workerCount: number;
  highlightedMissingSkuIds?: Set<string> | null;
  onClearHighlights?: () => void;
}

interface ParsedOrderRow {
  rowNumber: number;
  orderId: string;
  skuId: string;
  quantity: number;
  sourceValue: string;
  isValid: boolean;
  error?: string;
}

interface ParsedOrdersState {
  rows: ParsedOrderRow[];
}

const REQUIRED_SKU_HEADERS = ['order_id', 'sku_id'] as const;
const REQUIRED_ITEM_HEADERS = ['order_id', 'item_id'] as const;
const INVALID_CSV_FORMAT_MESSAGE = 'Invalid CSV format. Please use sample format.';
const LOCATION_CSV_NOT_SUPPORTED_MESSAGE = 'Location-based CSV is not supported. Please use order_id,sku_id.';
const SKU_NOT_FOUND_ERROR_MESSAGE = 'SKU not found in warehouse. Please add the SKU to the layout before importing orders.';
const SAMPLE_ORDERS_CSV = ['order_id,sku_id,quantity', 'A,SKU_001,2', 'A,SKU_004,1', 'B,SKU_011,3'].join('\n');

export function OrdersPanel({
  orders,
  onOrdersChange,
  warehouse,
  workerCount,
  highlightedMissingSkuIds,
  onClearHighlights,
}: OrdersPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newItemInput, setNewItemInput] = useState<Record<string, string>>({});
  const [parsedCsv, setParsedCsv] = useState<ParsedOrdersState | null>(null);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const orderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const getLocationLabelForSku = (skuId: string): string => {
    if (!warehouse) return 'Unknown location';
    const bin = getBinForSku(warehouse, skuId);
    if (!bin) return 'Unknown location';
    return `shelf-${bin.x}-${bin.y}, Z${bin.z}`;
  };

  // Check if an SKU is highlighted (missing)
  const isSkuHighlighted = (skuId: string): boolean => {
    return highlightedMissingSkuIds?.has(skuId) ?? false;
  };

  const availableSkus = useMemo(() => {
    if (!warehouse) return [];

    return collectSkuIds(warehouse)
      .map(sku => ({
        skuId: sku,
        label: `${sku} — ${getLocationLabelForSku(sku)}`,
      }))
      .sort((a, b) => a.skuId.localeCompare(b.skuId));
  }, [warehouse]);
  const availableSkuSet = useMemo(() => new Set(availableSkus.map(item => item.skuId)), [availableSkus]);

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

  const addSkuToOrder = (orderId: string, skuId: string) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId ? { ...o, items: [...o.items, { skuId }] } : o
      )
    );
    setNewItemInput(prev => ({ ...prev, [orderId]: '' }));
    // Clear highlights when user adds items
    if (onClearHighlights && highlightedMissingSkuIds) {
      onClearHighlights();
    }
  };

  const removeItemFromOrder = (orderId: string, itemIndex: number) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId
          ? { ...o, items: o.items.filter((_, i) => i !== itemIndex) }
          : o
      )
    );
    // Clear highlights when user removes items
    if (onClearHighlights && highlightedMissingSkuIds) {
      onClearHighlights();
    }
  };

  const generateRandom = () => {
    if (!warehouse || availableSkus.length === 0) return;
    const randomOrders = generateRandomOrders(warehouse, Math.min(5, Math.max(3, Math.floor(availableSkus.length / 3))));
    // Preserve assignedWorkerId=null on generated orders
    onOrdersChange(randomOrders.map(o => ({ ...o, assignedWorkerId: null })));
  };

  const parseOrdersCsv = (csvText: string): ParsedOrdersState => {
    const lines = csvText.split(/\r?\n/);
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);

    if (!firstNonEmptyLine) {
      throw new Error(INVALID_CSV_FORMAT_MESSAGE);
    }

    const headers = firstNonEmptyLine.split(',').map(part => part.trim().toLowerCase());
    const hasSkuHeaders =
      headers.length >= REQUIRED_SKU_HEADERS.length &&
      headers.slice(0, REQUIRED_SKU_HEADERS.length).every((header, idx) => header === REQUIRED_SKU_HEADERS[idx]);
    const hasLegacyItemHeaders =
      headers.length === REQUIRED_ITEM_HEADERS.length &&
      headers.every((header, idx) => header === REQUIRED_ITEM_HEADERS[idx]);
    const hasLocationHeaders = headers.length === 2 && headers[0] === 'order_id' && headers[1] === 'location_id';
    const hasQuantityColumn = headers[headers.length - 1] === 'quantity';

    if (hasLocationHeaders) {
      throw new Error(LOCATION_CSV_NOT_SUPPORTED_MESSAGE);
    }

    if (!hasSkuHeaders && !hasLegacyItemHeaders) {
      throw new Error(INVALID_CSV_FORMAT_MESSAGE);
    }

    const headerIndex = lines.findIndex(line => line.trim().length > 0);
    const dataLines = lines.slice(headerIndex + 1);

    const rows: ParsedOrderRow[] = [];

    dataLines.forEach((line, index) => {
      if (line.trim().length === 0) {
        return;
      }

      const parts = line.split(',').map(part => part.trim());
      const rawOrderId = parts[0] ?? '';
      const rawSkuId = parts[1] ?? '';
      const rawQuantity = hasQuantityColumn ? (parts[2] ?? '') : '';
      const extras = hasQuantityColumn ? parts.slice(3) : parts.slice(2);
      const rowNumber = headerIndex + index + 2;
      const orderId = rawOrderId;
      const sourceValue = rawSkuId;
      let skuId = '';
      let quantity = 1;

      let error: string | undefined;
      if (extras.length > 0) {
        error = 'Too many columns';
      } else if (!orderId) {
        error = 'Missing order_id';
      } else if (!sourceValue) {
        error = 'Missing sku_id';
      } else if (!availableSkuSet.has(sourceValue)) {
        error = SKU_NOT_FOUND_ERROR_MESSAGE;
      } else if (rawQuantity) {
        const parsed = parseInt(rawQuantity, 10);
        if (isNaN(parsed) || parsed <= 0) {
          error = 'Invalid quantity (must be a positive integer)';
        } else {
          quantity = parsed;
        }
      }

      if (!error) {
        skuId = sourceValue;
      }

      rows.push({
        rowNumber,
        orderId,
        skuId,
        quantity,
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
      items.push({ skuId: row.skuId, quantity: row.quantity });
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
    const uniqueLocations = new Set(validRowsData.map(row => getLocationLabelForSku(row.skuId))).size;
    return { totalRows, validRows, invalidRows, totalOrders, totalItems, uniqueLocations };
  }, [parsedCsv]);

  const WORKER_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

  useEffect(() => {
    if (!highlightedMissingSkuIds || highlightedMissingSkuIds.size === 0) {
      return;
    }

    const firstAffectedOrder = orders.find((order) => order.items.some((item) => highlightedMissingSkuIds.has(item.skuId)));
    if (!firstAffectedOrder) {
      return;
    }

    orderRefs.current[firstAffectedOrder.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [orders, highlightedMissingSkuIds]);

  return (
    <div className="w-72 border-r border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-xs text-muted-foreground">{orders.length} orders</span>
        </div>

        {/* Highlight info banner */}
        {highlightedMissingSkuIds && highlightedMissingSkuIds.size > 0 && (
          <div className="mb-2 flex items-center justify-between px-2 py-1.5 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-300/70 dark:border-amber-800/50 rounded text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              ⚠️ {highlightedMissingSkuIds.size} missing sku{highlightedMissingSkuIds.size !== 1 ? 's' : ''} highlighted
            </span>
            <button
              onClick={onClearHighlights}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 transition-colors font-medium"
            >
              Clear
            </button>
          </div>
        )}
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={addOrder}
            disabled={availableSkus.length === 0}
            className="flex-1 h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={generateRandom}
            disabled={availableSkus.length === 0}
            className="h-7 text-xs px-2"
            title="Generate random orders"
          >
            <Shuffle className="h-3 w-3" />
          </Button>
        </div>
        {/* CSV Import */}
        <div className="flex gap-1.5 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUploadCsvClick}
            className="h-7 text-xs px-2"
          >
            <Upload className="h-3 w-3 mr-1" />
            Upload CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadSampleCsv}
            className="h-7 text-xs px-2"
          >
            <Download className="h-3 w-3 mr-1" />
            Sample
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsvSelected}
          className="hidden"
        />
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
                      <td className="px-2 py-1 font-mono">{row.skuId || row.sourceValue || '—'}</td>
                      <td className="px-2 py-1 font-mono">
                        {row.isValid && row.skuId ? getLocationLabelForSku(row.skuId) : '—'}
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
            <div className="text-xs">Create orders manually or generate random ones</div>
          </div>
        ) : (
          orders.map(order => {
            const isOrderAffected = Boolean(
              highlightedMissingSkuIds && order.items.some((item) => highlightedMissingSkuIds.has(item.skuId))
            );

            return (
            <div
              key={order.id}
              ref={(element) => {
                orderRefs.current[order.id] = element;
              }}
              className={`border rounded-lg bg-card p-3 space-y-2 hover:border-muted-foreground/50 transition-colors ${
                isOrderAffected
                  ? 'border-amber-400/70 dark:border-amber-700/70 ring-1 ring-amber-300/40 dark:ring-amber-800/50'
                  : 'border-border'
              }`}
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
                {order.items.map((item, idx) => {
                  const isHighlighted = isSkuHighlighted(item.skuId);
                  return (
                    <div
                      key={`${item.skuId}-${idx}`}
                      className={`flex items-center justify-between text-xs rounded px-2 py-1 ${
                        isHighlighted
                          ? 'bg-amber-100/80 dark:bg-amber-900/30 border border-amber-400/50 dark:border-amber-700/50'
                          : 'bg-muted/30'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`font-mono truncate ${isHighlighted ? 'text-amber-900 dark:text-amber-100 font-semibold' : 'text-foreground'}`}>
                          {item.skuId}
                          {item.quantity && item.quantity > 1 && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">×{item.quantity}</span>
                          )}
                          {isHighlighted && <span className="ml-1.5 text-[10px] text-amber-700 dark:text-amber-300">(not found)</span>}
                        </div>
                        <div className={`font-mono text-[10px] truncate ${isHighlighted ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {getLocationLabelForSku(item.skuId)}
                        </div>
                      </div>
                      <button
                        onClick={() => removeItemFromOrder(order.id, idx)}
                        className={`transition-colors ${
                          isHighlighted
                            ? 'text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200'
                            : 'text-muted-foreground hover:text-destructive'
                        }`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add SKU input */}
              <div className="flex gap-1">
                <select
                  value={newItemInput[order.id] || ''}
                  onChange={e => setNewItemInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                  disabled={availableSkus.length === 0}
                  className="h-7 text-xs flex-1 rounded border border-border bg-background text-foreground px-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">{availableSkus.length === 0 ? 'No SKUs available' : 'Select SKU…'}</option>
                  {availableSkus.map(itemOption => (
                    <option key={itemOption.skuId} value={itemOption.skuId}>
                      {itemOption.label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => {
                    const value = newItemInput[order.id] || '';
                    const isValidSku = availableSkuSet.has(value);
                    if (value.trim() !== '' && isValidSku) {
                      addSkuToOrder(order.id, value);
                    }
                  }}
                  disabled={availableSkus.length === 0 || !newItemInput[order.id] || !availableSkuSet.has(newItemInput[order.id])}
                  className="h-7 px-2"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {availableSkus.length === 0 && (
                <div className="text-[11px] text-amber-700">No SKUs available. Place items on shelves first.</div>
              )}
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}
