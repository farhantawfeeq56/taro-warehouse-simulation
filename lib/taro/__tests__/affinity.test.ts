import { describe, expect, it } from 'vitest';
import {
  affinityToContinueProbability,
  generateAffinityGroups,
  summarizeAffinityGroups,
} from '../affinity';

describe('affinityToContinueProbability', () => {
  it('maps 0 to 0 (perfectly independent)', () => {
    expect(affinityToContinueProbability(0)).toBe(0);
  });

  it('maps high values close to but strictly below 1', () => {
    const p100 = affinityToContinueProbability(100);
    expect(p100).toBeLessThan(1);
    expect(p100).toBeGreaterThan(0.99);
  });

  it('is monotonic across the slider', () => {
    let previous = -Infinity;
    for (let a = 0; a <= 100; a += 10) {
      const p = affinityToContinueProbability(a);
      expect(p).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = p;
    }
  });

  it('clamps out-of-range values', () => {
    expect(affinityToContinueProbability(-10)).toBe(0);
    expect(affinityToContinueProbability(999)).toBeLessThan(1);
  });
});

describe('generateAffinityGroups', () => {
  it('returns exactly count group ids', () => {
    expect(generateAffinityGroups({ count: 10, affinity: 50 }).length).toBe(10);
    expect(generateAffinityGroups({ count: 0, affinity: 50 })).toEqual([]);
    expect(generateAffinityGroups({ count: 200, affinity: 80 }).length).toBe(200);
  });

  it('assigns every SKU a positive integer group id', () => {
    const groups = generateAffinityGroups({ count: 50, affinity: 70 });
    for (const g of groups) {
      expect(Number.isInteger(g)).toBe(true);
      expect(g).toBeGreaterThan(0);
    }
  });

  it('uses contiguous 1-based group ids', () => {
    const groups = generateAffinityGroups({ count: 100, affinity: 60 });
    const ids = Array.from(new Set(groups)).sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids.length).toBe(ids[ids.length - 1]);
  });

  it('produces all singleton groups at affinity = 0', () => {
    const n = 50;
    const groups = generateAffinityGroups({ count: n, affinity: 0 });
    const summary = summarizeAffinityGroups(groups);
    expect(summary.groupCount).toBe(n);
    expect(summary.singletonCount).toBe(n);
    expect(summary.nonSingletonCount).toBe(0);
    expect(summary.largestGroupSize).toBe(1);
    expect(summary.groupedShare).toBe(0);
  });

  it('produces larger and fewer groups at affinity = 100 than at 0', () => {
    const n = 200;
    const low = summarizeAffinityGroups(
      generateAffinityGroups({ count: n, affinity: 0 })
    );
    const high = summarizeAffinityGroups(
      generateAffinityGroups({ count: n, affinity: 100 })
    );

    expect(high.groupCount).toBeLessThan(low.groupCount);
    expect(high.largestGroupSize).toBeGreaterThan(low.largestGroupSize);
    expect(high.groupedShare).toBeGreaterThan(low.groupedShare);
    expect(high.meanGroupSize).toBeGreaterThan(low.meanGroupSize);
  });

  it('groups most SKUs together at the highly-related end', () => {
    const n = 200;
    const groups = generateAffinityGroups({ count: n, affinity: 100 });
    const summary = summarizeAffinityGroups(groups);
    // At maximum affinity almost all SKUs should have at least one group-mate.
    expect(summary.groupedShare).toBeGreaterThan(0.8);
    // And there should be very few distinct groups.
    expect(summary.groupCount).toBeLessThan(10);
  });

  it('is deterministic for the same config (seeded)', () => {
    const a = generateAffinityGroups({ count: 60, affinity: 70 });
    const b = generateAffinityGroups({ count: 60, affinity: 70 });
    expect(a).toEqual(b);
  });

  it('keeps every group size stepping the slider monotonic on average', () => {
    // As affinity rises, the grouped share tends to rise. Across many seeds
    // each step on average should not decrease.
    const steps = [0, 25, 50, 75, 100];
    const n = 300;
    const seeds = [1, 7, 13, 42, 101, 256, 777, 1234];

    const avgGroupedShare = (affinity: number) => {
      let total = 0;
      for (const seed of seeds) {
        const summary = summarizeAffinityGroups(
          generateAffinityGroups({ count: n, affinity, seed })
        );
        total += summary.groupedShare;
      }
      return total / seeds.length;
    };

    const shares = steps.map(avgGroupedShare);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1] - 1e-9);
    }
    expect(shares[0]).toBeLessThan(shares[shares.length - 1]);
  });

  it('spreads group membership across SKU ids (low ids do not all share a group)', () => {
    // At high affinity we expect a group that spans low and high SKU ids,
    // not just the first few. Verify that the first SKU and the last SKU
    // can be in the same group, and that groups are not purely contiguous
    // ranges when there are many of them.
    const groups = generateAffinityGroups({ count: 100, affinity: 80, seed: 3 });
    // Group id of SKU 0 vs SKU 99: they should not always be in the same
    // numeric id range; instead verify shuffled assignment is non-trivial
    // by checking that at least some adjacent-id SKUs differ in group.
    let adjacentSame = 0;
    for (let i = 1; i < groups.length; i++) {
      if (groups[i] === groups[i - 1]) adjacentSame++;
    }
    // With a shuffle in place, we don't expect every adjacent id to land in
    // the same group even at high affinity.
    expect(adjacentSame).toBeLessThan(groups.length - 1);
  });

  it('handles a single SKU', () => {
    const groups = generateAffinityGroups({ count: 1, affinity: 100 });
    expect(groups).toEqual([1]);
    const summary = summarizeAffinityGroups(groups);
    expect(summary.groupCount).toBe(1);
    expect(summary.singletonCount).toBe(1);
    expect(summary.meanGroupSize).toBe(1);
  });
});

describe('summarizeAffinityGroups', () => {
  it('returns zeros for an empty set', () => {
    const s = summarizeAffinityGroups([]);
    expect(s.groupCount).toBe(0);
    expect(s.singletonCount).toBe(0);
    expect(s.nonSingletonCount).toBe(0);
    expect(s.largestGroupSize).toBe(0);
    expect(s.meanGroupSize).toBe(0);
    expect(s.groupedShare).toBe(0);
  });

  it('reports singletons and non-singletons correctly on a crafted example', () => {
    // Group 1: SKUs {0,1,2} (size 3), group 2: {3} (singleton), group 3: {4,5} (size 2)
    const groups = [1, 1, 1, 2, 3, 3];
    const s = summarizeAffinityGroups(groups);
    expect(s.groupCount).toBe(3);
    expect(s.singletonCount).toBe(1);
    expect(s.nonSingletonCount).toBe(2);
    expect(s.largestGroupSize).toBe(3);
    expect(s.meanGroupSize).toBeCloseTo(6 / 3, 6);
    expect(s.groupedShare).toBeCloseTo(5 / 6, 6);
  });

  it('reports groupedShare 1 when every SKU has a group-mate', () => {
    const groups = [1, 1, 2, 2, 3, 3];
    const s = summarizeAffinityGroups(groups);
    expect(s.singletonCount).toBe(0);
    expect(s.groupedShare).toBe(1);
  });
});