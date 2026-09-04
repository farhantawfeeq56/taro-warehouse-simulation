// Taro design tokens — mirrored 1:1 from app/globals.css so the film is a
// direct extension of the product interface.

export const C = {
  bg: '#FBF6F6',          // --background (warm paper)
  surface: '#FFFFFF',     // cards / panels
  secondary: '#F7F7F6',   // secondary surfaces
  selected: '#F1F1F0',
  hover: '#F4F4F3',
  active: '#EDEDEC',
  accent: '#4C5C2D',      // olive
  accentHover: '#3F4D25',
  accentActive: '#34401F',
  accentSoft: '#E8ECD9',
  accentSubtle: '#F2F4EA',
  ink: '#111111',         // text-primary
  text2: '#666666',       // text-secondary
  muted: '#929292',       // text-muted
  disabled: '#B5B5B5',
  borderSubtle: '#E9E7E6',
  borderDefault: '#DDDAD9',
  borderStrong: '#C9C5C4',
  // semantic — used sparingly and with meaning
  positive: '#159A6F',
  positiveSoft: '#DCF7EA',
  warning: '#B7791F',
  warningSoft: '#FFF3D6',
  error: '#C62828',
  errorSoft: '#FDEAEA',
  info: '#2563A8',
  infoSoft: '#EAF2FA',
  // chart palette (Taro --chart-1..5)
  chart: ['#4C5C2D', '#2563A8', '#B7791F', '#159A6F', '#C62828'],
  // paper SKU dots used by the warehouse renderer
  paperGold: '#D6A83D',
  paperPurple: '#8A70A8',
  paperBlue: '#5B8DB8',
  paperOrange: '#C87555',
  paperTiles: ['#D6A83D', '#8A70A8', '#5B8DB8', '#C87555'],
  gridLine: '#E9E7E6',
  rackInk: '#111111',
  radius: 10,             // 0.625rem
} as const;

export const FONT = 'InstrumentSans, "Instrument Sans", sans-serif';

// Worker colors from lib/taro/constants (first four read well on paper)
export const WORKER_COLORS = ['#4C5C2D', '#BC6C25', '#2563A8', '#159A6F'];

// Strategy colors — Taro's STRATEGY_COLORS but tuned to sit on paper:
// single stays oxidized-iron (reads as "busy"), batch warm rose,
// zone amber.
export const STRATEGY_COLORS = {
  single: '#A72608',
  batch: '#C4567B',
  zone: '#D99A1B',
} as const;

export const RADIUS = 10;
export const OUTER_PADDING = 2;

// Easing — Apple-style decelerate for arrivals, calm cubic for drift
const bz = (c1x: number, c1y: number, c2x: number, c2y: number) => {
  const ax = 3 * c1x; const ay = 3 * c1y;
  const bx = 3 * (c2x - c1x) - ax; const by = 3 * (c2y - c1y) - ay;
  const cx = 1 - ax - bx; const cy = 1 - ay - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) break;
      t -= err / (sampleDX(t) || 1e-6);
    }
    return sampleY(t);
  };
};

export const EASE_OUT = bz(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const EASE_LINEAR = (x: number) => x;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** tween a value over a window; returns `from` until start, `to` after end. */
export const tween = (
  t: number, dur: number, from: number, to: number,
  ease: (x: number) => number = EASE_OUT,
) => from + (to - from) * ease(clamp01(t / dur));

/** scene opacity envelope: fade-in at start, full in middle, fade-out at end */
export const envelope = (t: number, dur: number, fade = 14) => {
  const inF = clamp01(t / fade);
  const outF = clamp01((dur - t) / fade);
  return Math.min(inF, outF);
};

/** integer count-up, eased */
export const count = (t: number, dur: number, from: number, to: number, ease = EASE_IN_OUT) =>
  Math.round(tween(t, dur, from, to, ease));

/** format meters / minutes / dollars the way Taro does */
export const fmtM = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`;
export const fmtMin = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} min`;
export const fmtPct = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`;
export const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;