'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, Warehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Shuffle, SlidersHorizontal } from 'lucide-react';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { collectSkuIds, getBinForSku, buildSkuToBinIndex } from '@/lib/taro/inventory';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  highlightedMissingSkuIds?: Set<string> | null;
  onClearHighlights?: () => void;
  orderCount: number;
  avgOrderSize: number;
  onOrderCountChange: (value: number) => void;
  onAvgOrderSizeChange: (value: number) => void;
}

export function OrdersPanel({
  orders,
  onOrdersChange,
  warehouse,
  highlightedMissingSkuIds,
  onClearHighlights,
  orderCount,
  avgOrderSize,
  onOrderCountChange,
  onAvgOrderSizeChange,
}: OrdersPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [draftOrderCount, setDraftOrderCount] = useState(500);
  const [draftAvgOrderSize, setDraftAvgOrderSize] = useState(5);
  const orderRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Build the SKU → bin index once per warehouse change so every
  // `getLocationLabelForSku` lookup is O(1) instead of a full grid scan.
  const skuToBinIndex = useMemo(() => {
    if (!warehouse) return null;
    return buildSkuToBinIndex(warehouse);
  }, [warehouse]);

  const getLocationLabelForSku = (skuId: string): string => {
    if (!warehouse) return 'Unknown location';
    const bin = getBinForSku(warehouse, skuId, skuToBinIndex);
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

  const generateRandom = () => {
    if (!warehouse || availableSkus.length === 0) return;
    const randomOrders = generateRandomOrders(warehouse, orderCount, avgOrderSize);
    onOrdersChange(randomOrders.map(o => ({ ...o, assignedWorkerId: null })));
  };

  useEffect(() => {
    if (!highlightedMissingSkuIds || highlightedMissingSkuIds.size === 0) {
      return;
    }

    const firstAffectedOrder = orders.find((order) =>
      order.items.some((item) => highlightedMissingSkuIds.has(item.skuId))
    );
    if (!firstAffectedOrder) {
      return;
    }

    orderRefs.current[firstAffectedOrder.id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
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
              ⚠️ {highlightedMissingSkuIds.size} missing sku
              {highlightedMissingSkuIds.size !== 1 ? 's' : ''} highlighted
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
            onClick={generateRandom}
            disabled={availableSkus.length === 0}
            className="flex-1 h-7 text-xs"
            title="Generate random orders"
          >
            <Shuffle className="h-3 w-3 mr-1" />
            Generate Random Orders
          </Button>
          <Popover
            open={showSettings}
            onOpenChange={(open) => {
              if (!open) {
                // Reset drafts when popover closes without applying
                setDraftOrderCount(orderCount);
                setDraftAvgOrderSize(avgOrderSize);
              }
              setShowSettings(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                title="Order generation settings"
              >
                <SlidersHorizontal className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4" align="end" side="bottom">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Order Generation Settings</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Order Count</label>
                    <span className="text-xs font-medium text-foreground">
                      {draftOrderCount.toLocaleString()} orders
                    </span>
                  </div>
                  <Slider
                    value={[draftOrderCount]}
                    onValueChange={([value]) => setDraftOrderCount(value)}
                    min={100}
                    max={1000}
                    step={100}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>100</span>
                    <span>1,000</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="text-xs text-muted-foreground">Average Order Size</label>
                    <span className="text-xs font-medium text-foreground">{draftAvgOrderSize} SKUs</span>
                  </div>
                  <Slider
                    value={[draftAvgOrderSize]}
                    onValueChange={([value]) => setDraftAvgOrderSize(value)}
                    min={1}
                    max={20}
                    step={1}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraftOrderCount(orderCount);
                      setDraftAvgOrderSize(avgOrderSize);
                      setShowSettings(false);
                    }}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onOrderCountChange(draftOrderCount);
                      onAvgOrderSizeChange(draftAvgOrderSize);
                      setShowSettings(false);
                    }}
                    className="h-7 text-xs"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {orders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
            <div className="text-sm text-foreground">No orders yet</div>
            <div className="text-xs">Generate random orders to begin</div>
          </div>
        ) : (
          orders.map((order) => {
            const isOrderAffected = Boolean(
              highlightedMissingSkuIds &&
                order.items.some((item) => highlightedMissingSkuIds.has(item.skuId))
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
                {/* Header row — read-only */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{order.id}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Items list — read-only */}
                <div className="space-y-1">
                  {order.items.map((item, idx) => {
                    const isHighlighted = isSkuHighlighted(item.skuId);
                    return (
                      <div
                        key={`${item.skuId}-${idx}`}
                        className={`flex items-center text-xs rounded px-2 py-1 ${
                          isHighlighted
                            ? 'bg-amber-100/80 dark:bg-amber-900/30 border border-amber-400/50 dark:border-amber-700/50'
                            : 'bg-muted/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <div
                            className={`font-mono truncate ${
                              isHighlighted
                                ? 'text-amber-900 dark:text-amber-100 font-semibold'
                                : 'text-foreground'
                            }`}
                          >
                            {item.skuId}
                            {item.quantity && item.quantity > 1 && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground">
                                ×{item.quantity}
                              </span>
                            )}
                            {isHighlighted && (
                              <span className="ml-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                                (not found)
                              </span>
                            )}
                          </div>
                          <div
                            className={`font-mono text-[10px] truncate ${
                              isHighlighted
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {getLocationLabelForSku(item.skuId)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
