import type { Warehouse, WarehouseLocation } from './types';

export function buildCoordinateLocations(warehouse: Pick<Warehouse, 'grid' | 'width' | 'height' | 'workerStart'>): WarehouseLocation[] {
  const locations: WarehouseLocation[] = [];

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf') {
        locations.push({ id: `shelf-${x}-${y}`, x, y, type: 'shelf' });
      } else {
        const type: WarehouseLocation['type'] =
          warehouse.workerStart?.x === x && warehouse.workerStart?.y === y
            ? 'packing'
            : 'aisle';
        locations.push({ id: `${type}-${x}-${y}`, x, y, type });
      }
    }
  }

  return locations;
}

