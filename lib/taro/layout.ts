import type { Warehouse, WarehouseLocation } from './types';

export function getShelfLocationId(x: number, y: number): string {
  return `shelf-${x}-${y}`;
}

export function buildCoordinateLocations(warehouse: Pick<Warehouse, 'grid' | 'width' | 'height' | 'workerStart'>): WarehouseLocation[] {
  const locations: WarehouseLocation[] = [];

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf') {
        locations.push({
          id: getShelfLocationId(x, y),
          x,
          y,
          z: 1,
          type: 'shelf',
          items: cell.locations.map(location => location.sku),
        });
      }
    }
  }

  return locations;
}
