import type { Warehouse, WarehouseLocation } from './types';

export function getShelfLocationId(x: number, y: number, z: number = 1, sku?: string): string {
  if (sku) {
    return `${x},${y},${z}-${sku}`;
  }
  return `shelf-${x}-${y}`;
}

export function buildCoordinateLocations(warehouse: Pick<Warehouse, 'grid' | 'width' | 'height' | 'workerStart'>): WarehouseLocation[] {
  const locations: WarehouseLocation[] = [];

  // console.log(`buildCoordinateLocations: warehouse dimensions ${warehouse.width}x${warehouse.height}, grid dimensions ${warehouse.grid.length}x${warehouse.grid[0]?.length}`);
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (!cell) {
        // console.log(`Missing cell at ${x},${y}`);
        continue;
      }
      if (cell.type === 'shelf') {
        if (cell.locations && cell.locations.length > 0) {
          process.stdout.write(`Found ${cell.locations.length} locations at ${x},${y}\n`);
          for (const loc of cell.locations) {
            locations.push({
              id: loc.id,
              x,
              y,
              z: loc.z,
              type: 'shelf',
              items: [loc.sku],
            });
          }
        } else {
          locations.push({
            id: getShelfLocationId(x, y),
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
