import { describe, expect, it } from 'vitest';
import {
  affinityToGroupCount,
  generateAffinityGroups,
  latentCategoryCount,
  summarizeAffinityGroups,
} from '../affinity';

describe('latentCategoryCount', () => {
  it('is 0 for an empty catalogue and 1 for a single SKU', () => {
    expect(latentCategoryCount(0)).toBe(0);
    expect(latentCategoryCount(1)).toBe(1);
  });

  it('is at least 2 once there is more than one SKU', () => {
    expect(latentCategoryCount(2)).toBe(2);
    expect(latentCategoryCount(3)).toBe(2);
    expect(latentCategoryCount(4)).toBe(2);
    expect(latentCategoryCount(10)).toBeGreaterThanOrEqual(2);
  });

  it('scales as floor(sqrt(N)) for larger catalogues', () => {
    expect(latentCategoryCount(100)).toBe(10);
    expect(latentCategoryCount(200)).toBe(14);
    expect(latentCategoryCount(1000)).toBe(31);
  });

  it('never exceeds the catalogue size', () => {
    // Tiny catalogues would otherwise violate min 2.
    expect(latentCategoryCount(1)).toBeLessThanOrEqual(1);
    expect(latentCategoryCount(2)).toBeLessThanOrEqual(2);
  });
});

describe('affinityToGroupCount', () => {
  it('is N at 0% (all singletons)', () => {
    expect(affinityToGroupCount(200, 0)).toBe(200);
    expect(affinityToGroupCount(50, 0)).toBe(50);
  });

  it('is the latent-category count at 100% (multiple large groups)', () => {
    expect(affinityToGroupCount(200, 100)).toBe(latentCategoryCount(200));
    expect(affinityToGroupCount(100, 100)).toBe(10);
  });

  it('never collapses to a single group at 100% (for N >= 2)', () => {
    for (const n of [2, 5, 10, 50, 100, 200, 1000]) {
      expect(affinityToGroupCount(n, 100)).toBeGreaterThanOrEqual(2);
    }
  });

  it('is monotonic non-increasing as affinity rises', () => {
    const n = 200;
    let previous = Infinity;
    for (let a = 0; a <= 100; a += 10) {
      const k = affinityToGroupCount(n, a);
      expect(k).toBeLessThanOrEqual(previous);
      previous = k;
    }
  });

  it('clamps out-of-range affinity', () => {
    expect(affinityToGroupCount(100, -10)).toBe(100);
    expect(affinityToGroupCount(100, 999)).toBe(latentCategoryCount(100));
  });

  it('keeps the low end almost all-independent (gentle ramp)', () => {
    // (1 - t^2) is flat near t = 0, so small affinity values still produce
    // (almost) the full singleton set — only a handful of merges.
    const n = 200;
    expect(affinityToGroupCount(n, 5)).toBeGreaterThan(n - 5);
    expect(affinityToGroupCount(n, 25)).toBeGreaterThan(n - 30);
  });

  it('handles degenerate sizes', () => {
    expect(affinityToGroupCount(0, 50)).toBe(0);
    expect(affinityToGroupCount(1, 100)).toBe(1);
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

  it('uses contiguous 1-based group ids (no empty groups)', () => {
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

  it('partitions SKUs exactly (every SKU in exactly one group)', () => {
    const n = 137;
    const groups = generateAffinityGroups({ count: n, affinity: 73, seed: 9 });
    // Verify each contiguous group id covers a disjoint, exhaustive set.
    const byGroup = new Map<number, number[]>();
    groups.forEach((g, i) => {
      const arr = byGroup.get(g) ?? [];
      arr.push(i);
      byGroup.set(g, arr);
    });
    let covered = 0;
    for (const members of byGroup.values()) covered += members.length;
    expect(covered).toBe(n);
    expect(byGroup.size).toBe(new Set(groups).size);
  });

  it('produces several large (not one giant) groups at affinity = 100', () => {
    const n = 200;
    const groups = generateAffinityGroups({ count: n, affinity: 100 });
    const s = summarizeAffinityGroups(groups);

    // The key fix: never a single giant group.
    expect(s.groupCount).toBe(latentCategoryCount(n));
    expect(s.groupCount).toBeGreaterThanOrEqual(2);

    // And those groups are large and reasonably balanced — no single group
    // dominates the catalogue.
    expect(s.groupedShare).toBeGreaterThan(0.95);
    expect(s.nonSingletonCount).toBe(s.groupCount);
    expect(s.largestGroupSize).toBeLessThan(n); // not everything in one group
    // Largest group is at most ~1.75x the mean category size (balanced).
    expect(s.largestGroupSize).toBeLessThanOrEqual(2 * s.meanGroupSize);
  });

  it('produces larger and fewer groups at 100% than at 0%', () => {
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

  it('is monotonic on average across the slider (grouped share rises)', () => {
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

  it('is monotonic on average across the slider (group count falls)', () => {
    const steps = [0, 25, 50, 75, 100];
    const n = 300;
    const seeds = [1, 7, 13, 42, 101, 256, 777, 1234];

    const avgGroupCount = (affinity: number) => {
      let total = 0;
      for (const seed of seeds) {
        const summary = summarizeAffinityGroups(
          generateAffinityGroups({ count: n, affinity, seed })
        );
        total += summary.groupCount;
      }
      return total / seeds.length;
    };

    const counts = steps.map(avgGroupCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1] + 1e-9);
    }
    expect(counts[counts.length - 1]).toBeGreaterThan(latentCategoryCount(n) - 1);
  });

  it('is deterministic for the same config (seeded)', () => {
    const a = generateAffinityGroups({ count: 60, affinity: 70 });
    const b = generateAffinityGroups({ count: 60, affinity: 70 });
    expect(a).toEqual(b);
  });

  it('varies deterministically with the seed', () => {
    const a = generateAffinityGroups({ count: 60, affinity: 80, seed: 1 });
    const b = generateAffinityGroups({ count: 60, affinity: 80, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('spreads group membership across SKU ids (shuffled, not contiguous)', () => {
    // At high affinity groups should span low and high SKU ids alike; verify
    // that not every adjacent-id pair lands in the same group (because of the
    // global shuffle) while still covering the catalogue.
    const groups = generateAffinityGroups({ count: 100, affinity: 80, seed: 3 });
    let adjacentSame = 0;
    for (let i = 1; i < groups.length; i++) {
      if (groups[i] === groups[i - 1]) adjacentSame++;
    }
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

  it('keeps grouping rare near 0% even past the exact zero', () => {
    // Just above 0% the ramp is still flat: most SKUs are singletons and the
    // few multi-groups are tiny.
    const n = 200;
    const s = summarizeAffinityGroups(
      generateAffinityGroups({ count: n, affinity: 10, seed: 4 })
    );
    expect(s.groupedShare).toBeLessThan(0.15);
    expect(s.singletonCount).toBeGreaterThan(n / 2);
  });

  it('at 50% produces a moderate number of mostly-small groups', () => {
    const n = 200;
    const s = summarizeAffinityGroups(
      generateAffinityGroups({ count: n, affinity: 50, seed: 4 })
    );
    // Mid-slider: a meaningful but not saturated grouping.
    expect(s.groupedShare).toBeGreaterThan(0.2);
    expect(s.groupedShare).toBeLessThan(0.85);
    expect(s.groupCount).toBeGreaterThan(latentCategoryCount(n));
    expect(s.groupCount).toBeLessThan(n);
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