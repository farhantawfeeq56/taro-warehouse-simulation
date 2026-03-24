import type { WorkerRoute } from './types';
import type { PickTask } from './types';

/**
 * Generate a CSV string from worker routes.
 * Format: workerId,step,location,item
 */
export function generateTaskCSV(workerRoutes: WorkerRoute[]): string {
  const header = 'workerId,step,location,item';
  const rows: string[] = [header];

  for (const worker of workerRoutes) {
    if (worker.route.length === 0) continue;
    worker.route.forEach((point, index) => {
      const step = index + 1;
      // Derive a human-readable location from the grid coordinate
      const aisle = String.fromCharCode(65 + (point.y % 26)); // A–Z
      const rack = Math.floor(point.x / 2) + 1;
      const bin = (point.x % 2 === 0 ? 'L' : 'R') + (point.y + 1);
      const location = `Aisle ${aisle} Rack ${rack} Bin ${bin}`;
      const item = `Item (${point.x},${point.y})`;
      rows.push(`${worker.workerId},${step},${location},${item}`);
    });
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
