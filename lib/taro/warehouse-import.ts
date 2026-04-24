import { buildCoordinateLocations, getShelfLocationId } from './layout';
import type { Cell, StorageLocation, Warehouse } from './types';
import { OUTER_PADDING } from './layout-utils';

const REQUIRED_COLUMNS = ['originallocation', 'x', 'y', 'z'] as const;
const MAX_CANVAS_WIDTH = 60;
const MAX_CANVAS_HEIGHT = 40;
const EDGE_PADDING = OUTER_PADDING;

export interface ImportedWarehouseLocation {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'shelf';
  rackId: string;
  originalX: number;
  originalY: number;
}

export interface WarehouseImportSummary {
  locationCount: number;
  rackCount: number;
}

export interface WarehouseImportResult {
  warehouse: Warehouse;
  summary: WarehouseImportSummary;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function deriveRackId(originalLocation: string): string {
  const parts = originalLocation.split('-').filter(Boolean);
  if (parts.length <= 1) return originalLocation;
  return parts.slice(0, -1).join('-');
}

function minimumPositiveStep(values: number[]): number {
  if (values.length < 2) return 1;

  let minStep = Number.POSITIVE_INFINITY;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0 && diff < minStep) {
      minStep = diff;
    }
  }

  return Number.isFinite(minStep) ? minStep : 1;
}

function normalizeCoordinates(locations: ImportedWarehouseLocation[]): ImportedWarehouseLocation[] {
  const uniqueX = Array.from(new Set(locations.map(location => location.originalX))).sort((a, b) => a - b);
  const uniqueY = Array.from(new Set(locations.map(location => location.originalY))).sort((a, b) => a - b);

  const minX = uniqueX[0] ?? 0;
  const minY = uniqueY[0] ?? 0;

  const xStep = minimumPositiveStep(uniqueX);
  const yStep = minimumPositiveStep(uniqueY);

  const xRange = uniqueX.length > 0 ? (uniqueX[uniqueX.length - 1] - minX) / xStep : 0;
  const yRange = uniqueY.length > 0 ? (uniqueY[uniqueY.length - 1] - minY) / yStep : 0;

  const maxDrawableWidth = MAX_CANVAS_WIDTH - EDGE_PADDING * 2 - 1;
  const maxDrawableHeight = MAX_CANVAS_HEIGHT - EDGE_PADDING * 2 - 1;

  const xScale = xRange > 0 ? maxDrawableWidth / xRange : 1;
  const yScale = yRange > 0 ? maxDrawableHeight / yRange : 1;
  const uniformScale = Math.min(1, xScale, yScale);

  const normalizedCoordinateCache = new Map<string, { x: number; y: number }>();

  return locations.map(location => {
    const cacheKey = `${location.originalX}|${location.originalY}`;
    if (!normalizedCoordinateCache.has(cacheKey)) {
      const normalizedX = Math.round(((location.originalX - minX) / xStep) * uniformScale) + EDGE_PADDING;
      const normalizedY = Math.round(((location.originalY - minY) / yStep) * uniformScale) + EDGE_PADDING;
      normalizedCoordinateCache.set(cacheKey, { x: normalizedX, y: normalizedY });
    }

    const normalizedCoordinate = normalizedCoordinateCache.get(cacheKey)!;
    return {
      ...location,
      x: normalizedCoordinate.x,
      y: normalizedCoordinate.y,
    };
  });
}

function buildWarehouse(locations: ImportedWarehouseLocation[]): Warehouse {
  const normalizedLocations = normalizeCoordinates(locations);
  const maxX = Math.max(...normalizedLocations.map(location => location.x), EDGE_PADDING + 4);
  const maxY = Math.max(...normalizedLocations.map(location => location.y), EDGE_PADDING + 4);

  const width = Math.max(maxX + EDGE_PADDING + 1, 12);
  const height = Math.max(maxY + EDGE_PADDING + 2, 10);

  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({ x, y, type: 'empty' as const, locations: [] }))
  );

  const shelfMap = new Map<string, StorageLocation[]>();

  for (const location of normalizedLocations) {
    const key = `${location.x},${location.y}`;
    if (!shelfMap.has(key)) {
      shelfMap.set(key, []);
    }

    shelfMap.get(key)!.push({
      id: `${location.id}@${location.x},${location.y},${location.z}`,
      locationId: getShelfLocationId(location.x, location.y),
      x: location.x,
      y: location.y,
      z: location.z,
      sku: location.id,
      quantity: 1,
    });
  }

  const shelves: Warehouse['shelves'] = [];

  for (const [key, shelfLocations] of shelfMap) {
    const [xText, yText] = key.split(',');
    const x = Number(xText);
    const y = Number(yText);

    if (!grid[y] || !grid[y][x]) continue;

    grid[y][x] = {
      x,
      y,
      type: 'shelf',
      locations: shelfLocations.sort((a, b) => a.z - b.z),
    };
    shelves.push({ x, y });
  }

  const workerStart = { x: 1, y: height - 2 };
  grid[workerStart.y][workerStart.x] = {
    x: workerStart.x,
    y: workerStart.y,
    type: 'worker-start',
    locations: [],
  };

  const warehouse: Warehouse = {
    width,
    height,
    grid,
    shelves,
    workerStart,
    locations: [],
    items: [],
  };

  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

export function parseWarehouseCsv(csvText: string): WarehouseImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headerColumns = parseCsvLine(lines[0]).map(column => column.toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter(column => !headerColumns.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`Missing required column(s): ${missingColumns.join(', ')}. Expected: originalLocation, x, y, z.`);
  }

  const columnIndex = {
    originalLocation: headerColumns.indexOf('originallocation'),
    x: headerColumns.indexOf('x'),
    y: headerColumns.indexOf('y'),
    z: headerColumns.indexOf('z'),
  };

  const parsedLocations: ImportedWarehouseLocation[] = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const row = parseCsvLine(lines[rowIndex]);
    const originalLocation = row[columnIndex.originalLocation]?.trim();

    if (!originalLocation) {
      throw new Error(`Row ${rowIndex + 1}: originalLocation is required.`);
    }

    const x = Number(row[columnIndex.x]);
    const y = Number(row[columnIndex.y]);
    const z = Number(row[columnIndex.z]);

    if ([x, y, z].some(value => Number.isNaN(value))) {
      throw new Error(`Row ${rowIndex + 1}: x, y, and z must all be valid numbers.`);
    }

    parsedLocations.push({
      id: originalLocation,
      x,
      y,
      z,
      type: 'shelf',
      rackId: deriveRackId(originalLocation),
      originalX: x,
      originalY: y,
    });
  }

  if (parsedLocations.length === 0) {
    throw new Error('No valid locations found in CSV.');
  }

  const warehouse = buildWarehouse(parsedLocations);
  const rackCount = new Set(parsedLocations.map(location => location.rackId)).size;

  return {
    warehouse,
    summary: {
      locationCount: parsedLocations.length,
      rackCount,
    },
  };
}

export const SAMPLE_WAREHOUSE_CSV_TEMPLATE = `originalLocation,x,y,z,position
A-14-01,300,100,1,front
A-14-02,300,100,2,front
A-15-01,330,100,1,front
B-03-01,300,140,1,rear`;
