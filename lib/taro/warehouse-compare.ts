import type { WorkspaceWarehouse } from './types';

/**
 * Structural equality of two warehouses' layouts — grid cells (type + item
 * locations) and shelf coordinates. Two warehouses with identical layouts are
 * indistinguishable to the simulation, so comparing them is meaningless.
 */
export function warehousesAreIdentical(a: WorkspaceWarehouse, b: WorkspaceWarehouse): boolean {
  const wa = a.warehouse;
  const wb = b.warehouse;
  if (wa.width !== wb.width || wa.height !== wb.height) return false;
  for (let y = 0; y < wa.height; y++) {
    for (let x = 0; x < wa.width; x++) {
      const ca = wa.grid[y][x];
      const cb = wb.grid[y][x];
      if (ca.type !== cb.type) return false;
      if (ca.locations.length !== cb.locations.length) return false;
      for (let i = 0; i < ca.locations.length; i++) {
        const la = ca.locations[i];
        const lb = cb.locations[i];
        if (la.sku !== lb.sku || la.z !== lb.z || la.quantity !== lb.quantity) return false;
      }
    }
  }
  return true;
}

/**
 * Group warehouses by identical layout. Returns groups of 2+ names that are
 * duplicates of each other (i.e. meaningful to warn about).
 */
export function findDuplicateGroups(warehouses: WorkspaceWarehouse[]): { names: string[] }[] {
  const groups: { names: string[] }[] = [];
  const visited = new Set<number>();
  for (let i = 0; i < warehouses.length; i++) {
    if (visited.has(i)) continue;
    const names = [warehouses[i].name];
    for (let j = i + 1; j < warehouses.length; j++) {
      if (visited.has(j)) continue;
      if (warehousesAreIdentical(warehouses[i], warehouses[j])) {
        names.push(warehouses[j].name);
        visited.add(j);
      }
    }
    if (names.length >= 2) groups.push({ names });
  }
  return groups;
}
