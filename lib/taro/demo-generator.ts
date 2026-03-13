// Demo data generators for Taro

import type { Warehouse, Cell, Order, Item } from './types';

export function createEmptyWarehouse(width: number, height: number): Warehouse {
  const grid: Cell[][] = [];
  
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, type: 'empty' });
    }
    grid.push(row);
  }
  
  return {
    width,
    height,
    grid,
    items: [],
    workerStart: null,
  };
}

export function generateDemoWarehouse(): Warehouse {
  const width = 30;
  const height = 24;
  const warehouse = createEmptyWarehouse(width, height);
  
  // Create shelf rows with aisles between them
  const shelfRows = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
  const shelfCols: [number, number][] = [
    [3, 10],
    [13, 20],
    [23, 27],
  ];
  
  for (const row of shelfRows) {
    for (const [startCol, endCol] of shelfCols) {
      for (let col = startCol; col <= endCol; col++) {
        warehouse.grid[row][col].type = 'shelf';
      }
    }
  }
  
  // Add items on shelf edges (accessible from aisles)
  let itemId = 1;
  const items: Item[] = [];
  
  // Place items on bottom edges of shelf pairs
  const itemRows = [3, 7, 11, 15, 19];
  for (const row of itemRows) {
    for (const [startCol, endCol] of shelfCols) {
      // Place 3-4 items per shelf section
      const itemPositions = [startCol + 1, startCol + 4, endCol - 3, endCol - 1];
      for (const col of itemPositions) {
        if (col <= endCol && Math.random() > 0.2) {
          warehouse.grid[row + 1][col].type = 'item';
          warehouse.grid[row + 1][col].itemId = itemId;
          items.push({ id: itemId, x: col, y: row + 1 });
          itemId++;
        }
      }
    }
  }
  
  warehouse.items = items;
  
  // Set worker start position at entrance
  warehouse.workerStart = { x: 1, y: height - 2 };
  warehouse.grid[height - 2][1].type = 'worker-start';
  
  return warehouse;
}

export function generateRandomOrders(items: Item[], count: number): Order[] {
  const orders: Order[] = [];
  const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  for (let i = 0; i < count; i++) {
    const itemCount = Math.floor(Math.random() * 4) + 2; // 2-5 items per order
    const orderItems: number[] = [];
    const availableItems = [...items];
    
    for (let j = 0; j < itemCount && availableItems.length > 0; j++) {
      const idx = Math.floor(Math.random() * availableItems.length);
      orderItems.push(availableItems[idx].id);
      availableItems.splice(idx, 1);
    }
    
    orders.push({
      id: `Order ${orderLabels[i] || i + 1}`,
      items: orderItems,
    });
  }
  
  return orders;
}

export function getNextItemId(warehouse: Warehouse): number {
  if (warehouse.items.length === 0) return 1;
  return Math.max(...warehouse.items.map(i => i.id)) + 1;
}
