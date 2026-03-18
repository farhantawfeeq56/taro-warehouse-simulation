'use client';

import { useState } from 'react';
import type { Order, Item } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Shuffle, X } from 'lucide-react';
import { generateRandomOrders } from '@/lib/taro/demo-generator';

interface OrdersPanelProps {
  orders: Order[];
  onOrdersChange: (orders: Order[]) => void;
  availableItems: Item[];
}

export function OrdersPanel({ orders, onOrdersChange, availableItems }: OrdersPanelProps) {
  const [newItemInput, setNewItemInput] = useState<Record<string, string>>({});

  const addOrder = () => {
    const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextLabel = orderLabels[orders.length] || `${orders.length + 1}`;
    const newOrder: Order = {
      id: `Order ${nextLabel}`,
      items: [],
    };
    onOrdersChange([...orders, newOrder]);
  };

  const deleteOrder = (orderId: string) => {
    onOrdersChange(orders.filter(o => o.id !== orderId));
  };

  const addItemToOrder = (orderId: string, itemId: number) => {
    onOrdersChange(
      orders.map(o => 
        o.id === orderId 
          ? { ...o, items: [...o.items, itemId] }
          : o
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
      const value = parseInt(newItemInput[orderId] || '', 10);
      if (!isNaN(value) && value > 0) {
        addItemToOrder(orderId, value);
      }
    }
  };

  const generateRandom = () => {
    if (availableItems.length === 0) return;
    const randomOrders = generateRandomOrders(availableItems, Math.min(5, Math.max(3, Math.floor(availableItems.length / 3))));
    onOrdersChange(randomOrders);
  };

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
            <div>No orders yet</div>
            <div className="text-xs">Click &apos;Add Order&apos; to get started</div>
          </div>
        ) : (
          orders.map(order => (
            <div 
              key={order.id} 
              className="border border-border rounded-lg bg-card p-3 space-y-2 hover:border-muted-foreground/50 transition-colors"
            >
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

              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Items ({order.items.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {order.items.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No items</span>
                  ) : (
                    order.items.map((itemId, index) => (
                      <span
                        key={`${order.id}-${index}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-mono font-medium rounded border border-primary/20 group"
                      >
                        {itemId}
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

              <div className="flex gap-1.5 pt-1">
                <Input
                  type="number"
                  placeholder="Item #"
                  value={newItemInput[order.id] || ''}
                  onChange={(e) => setNewItemInput(prev => ({ ...prev, [order.id]: e.target.value }))}
                  onKeyDown={(e) => handleItemInputKeyDown(order.id, e)}
                  className="h-7 text-xs flex-1"
                  min={1}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const value = parseInt(newItemInput[order.id] || '', 10);
                    if (!isNaN(value) && value > 0) {
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
            <span className="font-mono font-semibold text-foreground">{orders.reduce((sum, o) => sum + o.items.length, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Unique Items:</span>
            <span className="font-mono font-semibold text-foreground">{new Set(orders.flatMap(o => o.items)).size}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
