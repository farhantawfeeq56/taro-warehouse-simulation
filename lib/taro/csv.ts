import type { WorkerRoute } from './types';
import type { PickTask } from './types';

/**
 * Convert grid coordinates to a human-readable warehouse location label.
 * Coordinate-native format that supports irregular layouts.
 * Includes z-level if provided: "X:12, Y:7, Z:2"
 */
export function coordToLocation(x: number, y: number, z?: number): string {
  const baseLocation = `X:${x}, Y:${y}`;
  if (z !== undefined && z > 0) {
    return `${baseLocation}, Z:${z}`;
  }
  return baseLocation;
}

/**
 * Parse z-level from location string.
 * Returns z level if found, undefined otherwise.
 */
export function parseLocationZ(location: string): number | undefined {
  const match = location.match(/(?:Level|Z:?)\s*(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Generate a CSV string from worker routes.
 * Exports only actual pick locations — not intermediate path steps.
 * Format: workerId,step,zone,location,item
 */
export function generateTaskCSV(workerRoutes: WorkerRoute[]): string {
  const header = 'workerId,step,zone,location,item';
  const rows: string[] = [header];

  for (const worker of workerRoutes) {
    if (!worker.picks || worker.picks.length === 0) continue;

    const seen = new Set<string>();
    let step = 1;

    // Sort picks by Y then X for deterministic coordinate ordering
    const sorted = [...worker.picks].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    for (const pick of sorted) {
      const pickKey = `${pick.x},${pick.y},${pick.z}`;
      if (seen.has(pickKey)) continue;
      seen.add(pickKey);

      const zone = worker.zone || `Zone ${worker.workerId}`;
      const location = coordToLocation(pick.x, pick.y, pick.z);
      const item = pick.sku;

      rows.push(`${worker.workerId},${step},${zone},${location},${item}`);
      step++;
    }
  }

  return rows.join('\n');
}

/**
 * Download a string as a CSV file in the browser.
 */
export function downloadCSV(csvString: string, filename = 'tasks.csv'): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a CSV string back into structured PickTask objects.
 * Handles both 4-column (workerId,step,location,item) and
 * 5-column (workerId,step,zone,location,item) formats.
 */
export function parseTaskCSV(csvText: string): PickTask[] {
  const lines = csvText.trim().split('\n');
  const headerLine = lines[0].toLowerCase();
  const dataLines = headerLine.startsWith('workerid') ? lines.slice(1) : lines;
  const hasZone = headerLine.includes('zone');

  return dataLines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split(',');
      const workerId = parseInt(parts[0], 10);
      const step = parseInt(parts[1], 10);

      // Validate parsed integers
      if (isNaN(workerId) || isNaN(step)) {
        return { workerId: 0, step: 0, zone: '', location: '', item: '' };
      }

      const parseLocationAndItem = (rawText: string): { location: string; item: string } => {
        const locationPattern =
          /((?:X:\s*-?\d+,\s*Y:\s*-?\d+)(?:,\s*(?:Z:|Level)\s*\d+)?)(?:,(.*))?$/i;
        const match = rawText.match(locationPattern);

        if (match) {
          return {
            location: match[1].trim(),
            item: (match[2] ?? '').trim(),
          };
        }

        const fallbackParts = rawText.split(',');
        return {
          location: fallbackParts[0]?.trim() ?? '',
          item: fallbackParts.slice(1).join(',').trim(),
        };
      };

      if (hasZone) {
        const zone = parts[2]?.trim() ?? '';
        const remainingText = parts.slice(3).join(',').trim();
        const { location, item } = parseLocationAndItem(remainingText);
        return { workerId, step, zone, location, item };
      }

      const remainingText = parts.slice(2).join(',').trim();
      const { location, item } = parseLocationAndItem(remainingText);
      return { workerId, step, zone: '', location, item };
    })
    .filter(task => task.workerId > 0 && task.step > 0);
}
