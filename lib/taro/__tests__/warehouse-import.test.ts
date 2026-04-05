import { describe, expect, it } from 'vitest';
import { parseWarehouseCsv } from '../warehouse-import';

describe('warehouse-import', () => {
  it('parses required columns and ignores position', () => {
    const csv = `originalLocation,x,y,z,position
A-14-01,300,100,1,front
A-14-02,300,100,2,front
B-01-01,450,220,1,rear`;

    const { warehouse, summary } = parseWarehouseCsv(csv);

    expect(summary.locationCount).toBe(3);
    expect(summary.rackCount).toBe(2);
    expect(warehouse.shelves.length).toBe(2);
  });

  it('throws when required columns are missing', () => {
    const csv = `originalLocation,x,y
A-14-01,300,100`;

    expect(() => parseWarehouseCsv(csv)).toThrow(/Missing required column/);
  });

  it('normalizes large coordinates into bounded grid while preserving z-level stacking', () => {
    const csv = `originalLocation,x,y,z
A-14-01,300,100,1
A-14-02,300,100,2
A-15-01,500,100,1
C-10-01,700,350,3`;

    const { warehouse } = parseWarehouseCsv(csv);

    expect(warehouse.width).toBeLessThanOrEqual(60);
    expect(warehouse.height).toBeLessThanOrEqual(40);

    const stackedShelf = warehouse.grid.flat().find(cell =>
      cell.type === 'shelf' && cell.locations.some(loc => loc.sku === 'A-14-01')
    );

    expect(stackedShelf).toBeDefined();
    expect(stackedShelf?.locations.map(location => location.z)).toEqual([1, 2]);
  });
});
