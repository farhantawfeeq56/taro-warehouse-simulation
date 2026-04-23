import type { Warehouse, WarehouseLocation } from './types';

export function getShelfLocationId(x: number, y: number, z: number = 1): string {
  return `shelf-${x}-${y}-${z}`;
}

export function buildCoordinateLocations(warehouse: Pick<Warehouse, 'grid' | 'width' | 'height' | 'workerStart'>): WarehouseLocation[] {
  const locations: WarehouseLocation[] = [];

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf') {
        if (cell.locations && cell.locations.length > 0) {
          // Group by Z-level to create unique WarehouseLocations
          const zMap = new Map<number, string[]>();
          for (const loc of cell.locations) {
            if (!zMap.has(loc.z)) {
              zMap.set(loc.z, []);
            }
            zMap.get(loc.z)!.push(loc.sku);
          }
          
          for (const [z, skus] of zMap.entries()) {
            locations.push({
              id: getShelfLocationId(x, y, z),
              x,
              y,
              z,
              type: 'shelf',
              items: skus,
            });
          }
        } else {
          // Fallback if no specific locations are defined
          locations.push({
            id: getShelfLocationId(x, y, 1),
            x,
            y,
            z: 1,
            type: 'shelf',
            items: [],
          });
        }
      }
    }
  }

  return locations;
}
