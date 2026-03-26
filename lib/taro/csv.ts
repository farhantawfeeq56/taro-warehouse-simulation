import type { WorkerRoute } from './types';
import type { PickTask } from './types';

/**
 * Convert grid coordinates to a human-readable warehouse location label.
 * Maps: y-position → Aisle letter (A, B, C...), x-position → Rack number, bin slot within rack.
 */
export function coordToLocation(x: number, y: number): string {
  const aisleIndex = Math.floor(y / 3); // every 3 rows = 1 aisle (matches builder layout)
  const aisleLabel = String.fromCharCode(65 + (aisleIndex % 26));
  const rack = Math.floor(x / 2) + 1;
  const bin = (x % 2) + 1;
  return `Aisle ${aisleLabel}, Rack ${rack}, Bin ${bin}`;
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

    // Group picks by aisle zone for zone-based instructions
    const seen = new Set<number>();
    let step = 1;

    // Sort picks by aisle (y) then rack (x) for natural walking order
    const sorted = [...worker.picks].sort((a, b) => {
      const aisleA = Math.floor(a.y / 3);
      const aisleB = Math.floor(b.y / 3);
      if (aisleA !== aisleB) return aisleA - aisleB;
      return a.x - b.x;
    });

    for (const pick of sorted) {
      if (seen.has(pick.itemId)) continue;
      seen.add(pick.itemId);

      const aisleIndex = Math.floor(pick.y / 3);
      const aisleLabel = String.fromCharCode(65 + (aisleIndex % 26));
      const zone = `Aisle ${aisleLabel}`;
      const location = coordToLocation(pick.x, pick.y);
      const item = `Item ${pick.itemId}`;

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
      if (hasZone) {
        const zone = parts[2]?.trim() ?? '';
        const location = parts[3]?.trim() ?? '';
        const item = parts.slice(4).join(',').trim();
        return { workerId, step, zone, location, item };
      } else {
        const location = parts[2]?.trim() ?? '';
        const item = parts.slice(3).join(',').trim();
        return { workerId, step, zone: '', location, item };
      }
    })
    .filter(task => !isNaN(task.workerId) && !isNaN(task.step));
}
