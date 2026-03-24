import type { WorkerRoute } from './types';
import type { PickTask } from './types';

/**
 * Generate a CSV string from worker routes.
 * Exports only actual pick locations — not intermediate path steps.
 * Format: workerId,step,location,item
 */
export function generateTaskCSV(workerRoutes: WorkerRoute[]): string {
  const header = 'workerId,step,location,item';
  const rows: string[] = [header];

  for (const worker of workerRoutes) {
    if (!worker.picks || worker.picks.length === 0) continue;

    // Deduplicate picks by itemId (safety guard)
    const seen = new Set<number>();
    let step = 1;

    for (const pick of worker.picks) {
      if (seen.has(pick.itemId)) continue;
      seen.add(pick.itemId);

      // Derive a human-readable bin location from the grid coordinate
      const aisleChar = String.fromCharCode(65 + (pick.y % 26));           // A–Z
      const rack = Math.floor(pick.x / 2) + 1;
      const side = pick.x % 2 === 0 ? 'L' : 'R';
      const bin = `${side}${pick.y + 1}`;
      const location = `Aisle ${aisleChar} Rack ${rack} Bin ${bin}`;
      const item = `Item ${pick.itemId}`;

      rows.push(`${worker.workerId},${step},${location},${item}`);
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
 * Assumes valid CSV with header: workerId,step,location,item
 */
export function parseTaskCSV(csvText: string): PickTask[] {
  const lines = csvText.trim().split('\n');
  // Skip header line
  const dataLines = lines[0].toLowerCase().startsWith('workerid') ? lines.slice(1) : lines;

  return dataLines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Split on first 3 commas only so location/item can contain commas
      const parts = line.split(',');
      const workerId = parseInt(parts[0], 10);
      const step = parseInt(parts[1], 10);
      const location = parts[2]?.trim() ?? '';
      const item = parts.slice(3).join(',').trim();
      return { workerId, step, location, item };
    })
    .filter(task => !isNaN(task.workerId) && !isNaN(task.step));
}
