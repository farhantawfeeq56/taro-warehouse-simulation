'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, Warehouse } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Plus, Shuffle, Trash2, X } from 'lucide-react';
import { generateRandomOrders } from '@/lib/taro/demo-generator';
import { getItemById, getItems } from '@/lib/taro/items';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  warehouse?: Warehouse;
  workerCount: number;
  highlightedMissingItemIds?: Set<string> | null;
  onClearHighlights?: () => void;
}

export function OrdersPanel({
  orders,
  onOrdersChange,
  warehouse,
  workerCount,
  highlightedMissingItemIds,
  onClearHighlights,
}: OrdersPanelProps) {
  const [newItemInput, setNewItemInput] = useState<Record<string, string>>({});
  const orderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const getLocationIdForItem = (itemId: string): string => getItemById(warehouse ?? { items: [] }, itemId)?.locationId ?? 'Unknown location';

  // Check if an item is highlighted (missing)
  const isItemHighlighted = (itemId: string): boolean => {
    return highlightedMissingItemIds?.has(itemId) ?? false;
  };

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

  const addItemToOrder = (orderId: string, itemId: string) => {
    onOrdersChange(
      orders.map(o =>
        o.id === orderId ? { ...o, items: [...o.items, { itemId }] } : o
      )
    );
    setNewItemInput(prev => ({ ...prev, [orderId]: '' }));
    // Clear highlights when user adds items
    if (onClearHighlights && highlightedMissingItemIds) {
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
    if (onClearHighlights && highlightedMissingItemIds) {
      onClearHighlights();
    }
  };

  const generateRandom = () => {
    if (!warehouse || availableItems.length === 0) return;
    const randomOrders = generateRandomOrders(warehouse, Math.min(5, Math.max(3, Math.floor(availableItems.length / 3))));
    // Preserve assignedWorkerId=null on generated orders
    onOrdersChange(randomOrders.map(o => ({ ...o, assignedWorkerId: null })));
  };

  const WORKER_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];

  useEffect(() => {
    if (!highlightedMissingItemIds || highlightedMissingItemIds.size === 0) {
      return;
    }

    const firstAffectedOrder = orders.find((order) => order.items.some((item) => highlightedMissingItemIds.has(item.itemId)));
    if (!firstAffectedOrder) {
      return;
    }

    orderRefs.current[firstAffectedOrder.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [orders, highlightedMissingItemIds]);

  return (
    <div className="w-72 border-r border-border bg-background flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-xs text-muted-foreground">{orders.length} orders</span>
        </div>

        {/* Highlight info banner */}
        {highlightedMissingItemIds && highlightedMissingItemIds.size > 0 && (
          <div className="mb-2 flex items-center justify-between px-2 py-1.5 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-300/70 dark:border-amber-800/50 rounded text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              ⚠️ {highlightedMissingItemIds.size} missing item{highlightedMissingItemIds.size !== 1 ? 's' : ''} highlighted
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
            disabled={availableItems.length === 0}
            className="flex-1 h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Order
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
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {orders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
            <div className="text-sm text-foreground">No orders yet</div>
            <div className="text-xs">Create orders manually or generate random ones</div>
          </div>
        ) : (
          orders.map(order => {
            const isOrderAffected = Boolean(
              highlightedMissingItemIds && order.items.some((item) => highlightedMissingItemIds.has(item.itemId))
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
                  const isHighlighted = isItemHighlighted(item.itemId);
                  return (
                    <div
                      key={`${item.itemId}-${idx}`}
                      className={`flex items-center justify-between text-xs rounded px-2 py-1 ${
                        isHighlighted
                          ? 'bg-amber-100/80 dark:bg-amber-900/30 border border-amber-400/50 dark:border-amber-700/50'
                          : 'bg-muted/30'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`font-mono truncate ${isHighlighted ? 'text-amber-900 dark:text-amber-100 font-semibold' : 'text-foreground'}`}>
                          {item.itemId}
                          {isHighlighted && <span className="ml-1.5 text-[10px] text-amber-700 dark:text-amber-300">(not found)</span>}
                        </div>
                        <div className={`font-mono text-[10px] truncate ${isHighlighted ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {getLocationIdForItem(item.itemId)}
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
          );
          })
        )}
      </div>
    </div>
  );
}
