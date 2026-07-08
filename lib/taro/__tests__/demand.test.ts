import { describe, expect, it } from 'vitest';
import {
  ALPHA_MAX,
  distributionToAlpha,
  generateDemandScores,
  summarizeDemandScores,
} from '../demand';

describe('distributionToAlpha', () => {
  it('maps 0 to a perfectly uniform alpha of 0', () => {
    expect(distributionToAlpha(0)).toBe(0);
  });

  it('maps 100 to ALPHA_MAX', () => {
    expect(distributionToAlpha(100)).toBe(ALPHA_MAX);
  });

  it('is monotonic and linear across the slider', () => {
    expect(distributionToAlpha(50)).toBeCloseTo(ALPHA_MAX / 2, 10);
    expect(distributionToAlpha(25)).toBeCloseTo(ALPHA_MAX / 4, 10);
  });

  it('clamps out-of-range values', () => {
    expect(distributionToAlpha(-10)).toBe(0);
    expect(distributionToAlpha(999)).toBe(ALPHA_MAX);
  });
});

describe('generateDemandScores', () => {
  it('returns exactly count scores', () => {
    expect(generateDemandScores({ count: 10, distribution: 50 }).length).toBe(10);
    expect(generateDemandScores({ count: 0, distribution: 50 })).toEqual([]);
    expect(generateDemandScores({ count: 200, distribution: 80 }).length).toBe(200);
  });

  it('makes every score strictly positive', () => {
    const scores = generateDemandScores({ count: 50, distribution: 100 });
    for (const s of scores) {
      expect(s).toBeGreaterThan(0);
    }
  });

  it('keeps the mean at 1 (total demand conserved)', () => {
    for (const distribution of [0, 10, 25, 50, 75, 100]) {
      const scores = generateDemandScores({ count: 100, distribution });
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      expect(mean).toBeCloseTo(1, 6);
    }
  });

  it('produces uniform (equal) scores at distribution = 0', () => {
    const scores = generateDemandScores({ count: 40, distribution: 0 });
    for (const s of scores) {
      expect(s).toBeCloseTo(1, 10);
    }
  });

  it('produces a Pareto-shaped distribution (few high, many low) at distribution = 100', () => {
    const n = 200;
    const scores = generateDemandScores({ count: n, distribution: 100 });
    const sorted = scores.slice().sort((a, b) => b - a);

    // The single highest score should be far above the mean.
    expect(sorted[0]).toBeGreaterThan(10);

    // The bottom 50% should each be below the mean (=1).
    const lowHalf = sorted.slice(n / 2);
    for (const s of lowHalf) {
      expect(s).toBeLessThan(1);
    }

    // The top 20% should hold the majority of total demand.
    const top20Share =
      sorted.slice(0, Math.round(n * 0.2)).reduce((a, b) => a + b, 0) /
      scores.reduce((a, b) => a + b, 0);
    expect(top20Share).toBeGreaterThan(0.6);
  });

  it('transitions smoothly: top-20% share grows monotonically with the slider', () => {
    const shares: number[] = [];
    for (let d = 0; d <= 100; d += 25) {
      const scores = generateDemandScores({ count: 300, distribution: d });
      const sorted = scores.slice().sort((a, b) => b - a);
      const total = scores.reduce((a, b) => a + b, 0);
      const top = sorted
        .slice(0, Math.round(scores.length * 0.2))
        .reduce((a, b) => a + b, 0);
      shares.push(total > 0 ? top / total : 0);
    }
    // Uniform -> Pareto. Each step should not decrease.
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1] - 1e-9);
    }
    expect(shares[0]).toBeLessThan(shares[shares.length - 1]);
  });

  it('is deterministic for the same config (seeded shuffle)', () => {
    const a = generateDemandScores({ count: 60, distribution: 70 });
    const b = generateDemandScores({ count: 60, distribution: 70 });
    expect(a).toEqual(b);
  });

  it('spreads high-demand scores across SKU ids via the shuffle', () => {
    // At the Pareto end, the very largest score should NOT always be at
    // index 0 (SKU_001). A seeded shuffle distributes it across the range.
    let firstIndexIsMax = 0;
    for (let seed = 0; seed < 20; seed++) {
      const scores = generateDemandScores({ count: 100, distribution: 100, seed });
      const max = Math.max(...scores);
      if (scores.indexOf(max) === 0) firstIndexIsMax++;
    }
    // Across 20 different seeds, the max should rarely land on index 0.
    expect(firstIndexIsMax).toBeLessThan(20);
  });

  it('preserves the distribution shape regardless of seed (mean stays 1)', () => {
    for (const seed of [1, 123, 9999]) {
      const scores = generateDemandScores({ count: 100, distribution: 80, seed });
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      expect(mean).toBeCloseTo(1, 6);
    }
  });
});

describe('summarizeDemandScores', () => {
  it('returns zeros for an empty set', () => {
    const s = summarizeDemandScores([]);
    expect(s.min).toBe(0);
    expect(s.max).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.topShare).toBe(0);
  });

  it('reports ~20% top share for a uniform distribution', () => {
    const scores = generateDemandScores({ count: 100, distribution: 0 });
    const s = summarizeDemandScores(scores, 0.2);
    expect(s.topShare).toBeCloseTo(0.2, 5);
    expect(s.mean).toBeCloseTo(1, 6);
  });

  it('reports a top share well above 20% for a Pareto distribution', () => {
    const scores = generateDemandScores({ count: 100, distribution: 100 });
    const s = summarizeDemandScores(scores, 0.2);
    expect(s.topShare).toBeGreaterThan(0.6);
    expect(s.max).toBeGreaterThan(s.min);
  });
});