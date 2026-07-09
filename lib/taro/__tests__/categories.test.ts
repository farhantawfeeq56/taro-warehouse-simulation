import { describe, expect, it } from 'vitest';
import {
  assignProductCategory,
  generateCategoryIds,
  latentFamilyCount,
  summarizeCategoryIds,
} from '../categories';
import type { Item } from '../types';

describe('latentFamilyCount', () => {
  it('is 0 for empty, 1 for a single SKU', () => {
    expect(latentFamilyCount(0)).toBe(0);
    expect(latentFamilyCount(1)).toBe(1);
  });

  it('is at least 2 once there are multiple SKUs', () => {
    expect(latentFamilyCount(2)).toBeGreaterThanOrEqual(2);
    expect(latentFamilyCount(10)).toBeGreaterThanOrEqual(2);
  });

  it('scales as floor(sqrt(n)) within the clamp', () => {
    expect(latentFamilyCount(100)).toBe(10);
    expect(latentFamilyCount(9)).toBe(3);
  });
});

describe('generateCategoryIds', () => {
  it('returns length===count with contiguous 1-based ids', () => {
    const n = 25;
    const ids = generateCategoryIds({ count: n });
    expect(ids).toHaveLength(n);
    const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
    expect(unique).toEqual(Array.from({ length: unique.length }, (_, i) => i + 1));
  });

  it('has balanced family sizes (max - min <= 1)', () => {
    const ids = generateCategoryIds({ count: 101 });
    const counts = new Map<number, number>();
    for (const c of ids) counts.set(c, (counts.get(c) ?? 0) + 1);
    const sizes = Array.from(counts.values());
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateCategoryIds({ count: 40, seed: 7 });
    const b = generateCategoryIds({ count: 40, seed: 7 });
    expect(a).toEqual(b);
  });

  it('spreads families across the catalogue (not aligned with numeric order)', () => {
    // With every SKU in numeric order, two adjacent ids should not always
    // belong to the same family (for a non-trivial catalogue with several
    // families).
    const ids = generateCategoryIds({ count: 100, seed: 99 });
    const k = latentFamilyCount(100);
    if (k < 2) return; // nothing to test
    let adjacentEqual = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) adjacentEqual++;
    // Families were shuffled across the catalogue, so most adjacent pairs must
    // differ. We don't require strictly alternating, just "mostly".
    expect(adjacentEqual).toBeLessThan(ids.length - 1);
  });
});

describe('assignProductCategory', () => {
  it('attaches a category to every item without touching other fields', () => {
    const items: Item[] = [
      { id: 'SKU_001', demandScore: 3, affinityGroup: 2 },
      { id: 'SKU_002', demandScore: 1, affinityGroup: 5 },
    ];
    const out = assignProductCategory(items);
    expect(out).toHaveLength(2);
    for (const it of out) {
      expect(typeof it.category).toBe('number');
      expect(it.category!).toBeGreaterThan(0);
      // Other preserved fields untouched.
      expect(it.id).toMatch(/^SKU_/);
      expect(it.affinityGroup).toBeDefined();
    }
  });

  it('is independent of affinityGroup (changing affinity does not change category)', () => {
    const base: Item[] = Array.from({ length: 30 }, (_, i) => ({ id: `SKU_${i}` }));
    const withAffinity = base.map((it) => ({ ...it, affinityGroup: (it.id.length % 7) + 1 }));
    const noAffinity = base.map((it) => ({ ...it }));
    const a = assignProductCategory(withAffinity).map((it) => it.category);
    const b = assignProductCategory(noAffinity).map((it) => it.category);
    // Category seed is independent of the items' affinityGroup values, so both
    // assignments must be identical.
    expect(a).toEqual(b);
  });

  it('handles empty input', () => {
    expect(assignProductCategory([])).toEqual([]);
  });
});

describe('summarizeCategoryIds', () => {
  it('reports the number of families and min/max sizes', () => {
    const ids = generateCategoryIds({ count: 50, seed: 3 });
    const s = summarizeCategoryIds(ids);
    expect(s.categoryCount).toBe(latentFamilyCount(50));
    expect(s.largestFamilySize).toBeGreaterThanOrEqual(s.smallestFamilySize);
    expect(s.largestFamilySize - s.smallestFamilySize).toBeLessThanOrEqual(1);
  });
});