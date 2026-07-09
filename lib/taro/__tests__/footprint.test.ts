import { describe, expect, it } from 'vitest';
import {
  generateFootprints,
  summarizeFootprints,
  footprintToP,
  FOOTPRINT_FMAX,
  FOOTPRINT_PMIN,
  type FootprintGenerationConfig,
} from '../footprint';

describe('footprint generation (storage footprint)', () => {
  it('returns an empty array for count = 0', () => {
    expect(generateFootprints({ count: 0, footprint: 50 })).toEqual([]);
  });

  it('returns length === count and every value in [1, FMAX]', () => {
    const out = generateFootprints({ count: 500, footprint: 100 });
    expect(out).toHaveLength(500);
    for (const f of out) {
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(FOOTPRINT_FMAX);
      expect(Number.isInteger(f)).toBe(true);
    }
  });

  it('at footprint = 0 (Compact), every SKU has footprint 1', () => {
    const out = generateFootprints({ count: 200, footprint: 0 });
    expect(out.every((f) => f === 1)).toBe(true);
  });

  it('at footprint = 100 (Bulky), the mean footprint is roughly 1/PMIN', () => {
    // Mean of a capped geometric with success prob p is ~1/p (capped at FMAX,
    // so slightly below for very small p). PMIN = 0.4 -> mean ~2.3-2.5.
    const out = generateFootprints({ count: 2000, footprint: 100 });
    const mean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(mean).toBeGreaterThan(2.0);
    expect(mean).toBeLessThan(2.7);
  });

  it('at footprint = 100, some SKUs are still single-bin (compact core retained)', () => {
    const out = generateFootprints({ count: 1000, footprint: 100 });
    const single = out.filter((f) => f === 1).length;
    // P(F=1) = p = PMIN = 0.4 -> ~40% single-bin. Allow a wide band.
    expect(single).toBeGreaterThan(300);
    expect(single).toBeLessThan(500);
  });

  it('at footprint = 100, some SKUs hit the cap (FMAX)', () => {
    const out = generateFootprints({ count: 2000, footprint: 100 });
    const atCap = out.filter((f) => f === FOOTPRINT_FMAX).length;
    expect(atCap).toBeGreaterThan(0);
  });

  it('mean footprint increases monotonically with the slider', () => {
    let prevMean = 0;
    for (let slider = 0; slider <= 100; slider += 10) {
      const out = generateFootprints({ count: 1000, footprint: slider });
      const mean = out.reduce((a, b) => a + b, 0) / out.length;
      // Allow tiny non-monotonic jitter at the very low end where mean ~= 1.
      expect(mean).toBeGreaterThanOrEqual(prevMean - 0.01);
      prevMean = mean;
    }
    // Endpoint sanity: 100 is clearly above 0.
    const mean0 = generateFootprints({ count: 1000, footprint: 0 }).reduce((a, b) => a + b, 0) / 1000;
    const mean100 = generateFootprints({ count: 1000, footprint: 100 }).reduce((a, b) => a + b, 0) / 1000;
    expect(mean100).toBeGreaterThan(mean0);
  });

  it('is deterministic for a fixed seed', () => {
    const cfg: FootprintGenerationConfig = { count: 100, footprint: 60, seed: 123 };
    const a = generateFootprints(cfg);
    const b = generateFootprints(cfg);
    expect(a).toEqual(b);
  });

  it('clamps slider values outside [0, 100]', () => {
    const below = generateFootprints({ count: 50, footprint: -20 });
    const above = generateFootprints({ count: 50, footprint: 9999 });
    expect(below.every((f) => f === 1)).toBe(true); // clamps to 0 -> compact
    // 9999 clamps to 100 -> bulky, but still within [1, FMAX]
    expect(above.every((f) => f >= 1 && f <= FOOTPRINT_FMAX)).toBe(true);
  });

  it('footprintToP maps endpoints correctly', () => {
    expect(footprintToP(0)).toBe(1);
    expect(footprintToP(100)).toBeCloseTo(FOOTPRINT_PMIN, 10);
    // Linear in between
    const mid = footprintToP(50);
    const expected = FOOTPRINT_PMIN + (1 - FOOTPRINT_PMIN) * 0.5;
    expect(mid).toBeCloseTo(expected, 10);
  });

  describe('summarizeFootprints', () => {
    it('returns zeros for an empty array', () => {
      const s = summarizeFootprints([]);
      expect(s).toEqual({
        singleBinCount: 0,
        multiBinCount: 0,
        largestFootprint: 0,
        meanFootprint: 0,
        totalBins: 0,
      });
    });

    it('counts single vs multi-bin SKUs and sums total bins', () => {
      const s = summarizeFootprints([1, 1, 3, 2, 6]);
      expect(s.singleBinCount).toBe(2);
      expect(s.multiBinCount).toBe(3);
      expect(s.largestFootprint).toBe(6);
      expect(s.totalBins).toBe(13);
      expect(s.meanFootprint).toBeCloseTo(13 / 5, 5);
    });
  });
});
