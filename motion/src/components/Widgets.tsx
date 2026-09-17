// Small motion widgets shared across scenes. Every component takes a local
// time t (frames since it should start doing its thing).

import React from 'react';
import { C, FONT, EASE_OUT, clamp01, count } from '../tokens';

/** entry motion block (opacity + rise + blur-out) */
export const In: React.FC<{ t: number; delay?: number; rise?: number; blur?: boolean; children: React.ReactNode }> =
  ({ t, delay = 0, rise = 14, blur = true, children }) => {
    const k = clamp01((t - delay) / 22);
    const e = EASE_OUT(k);
    return (
      <div style={{
        opacity: e,
        transform: `translateY(${(1 - e) * rise}px)`,
        filter: blur ? `blur(${(1 - e) * 6}px)` : undefined,
      }}>
        {children}
      </div>
    );
  };

/** Out - fade + drift up */
export const Out: React.FC<{ t: number; dur?: number; up?: number; children: React.ReactNode }> =
  ({ t, dur = 18, up = 22, children }) => {
    const k = clamp01(t / dur);
    const e = EASE_OUT(1 - k);
    return (
      <div style={{ opacity: e, transform: `translateY(${(1 - e) * up}px)`, filter: `blur(${(1 - e) * 5}px)` }}>
        {children}
      </div>
    );
  };

/** InOut - both gates, useful for statements that appear and leave */
export const InOut: React.FC<{ t: number; inDur?: number; outAt?: number; rise?: number; children: React.ReactNode }> =
  ({ t, inDur = 22, outAt = Infinity, rise = 14, children }) => {
    const inK = EASE_OUT(clamp01(t / inDur));
    const outK = clamp01((t - outAt) / 16);
    const e = inK * (1 - outK);
    return (
      <div style={{ opacity: e, transform: `translateY(${(1 - e) * rise}px)`, filter: `blur(${(1 - e) * 7}px)` }}>
        {children}
      </div>
    );
  };

/** big statement + small line, both gated by one timeline */
export const Statement: React.FC<{
  t: number;
  title: string;
  sub?: string;
  titleSize?: number;
  delay?: number;
  outAt?: number;
  center?: boolean;
  color?: string;
}> = ({ t, title, sub, titleSize = 54, delay = 0, outAt = Infinity, center = true, color = C.ink }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, textAlign: center ? 'center' : 'left', zIndex: 20 }}>
    <InOut t={t - delay} outAt={outAt === Infinity ? Infinity : outAt - delay} rise={24}>
      <div style={{ fontFamily: FONT, fontSize: titleSize, fontWeight: 700, lineHeight: 1.12, color, maxWidth: 980, margin: center ? '0 auto' : undefined, padding: '0 24px' }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 400, color: C.text2, marginTop: 12, maxWidth: 880, margin: '10px auto 0', padding: '0 24px' }}>
          {sub}
        </div>
      )}
    </InOut>
  </div>
);

/** small uppercase label chip */
export const Chip: React.FC<{ label: string; t?: number; active?: boolean; tone?: 'neutral' | 'accent' | 'positive' | 'info' | 'warning' }> =
  ({ label, t = 1, active = true, tone = 'neutral' }) => {
    const bg = tone === 'accent' ? C.accentSoft
      : tone === 'positive' ? C.positiveSoft
      : tone === 'info' ? C.infoSoft
      : tone === 'warning' ? C.warningSoft
      : C.secondary;
    const fg = tone === 'accent' ? C.accentActive : tone === 'neutral' ? C.text2 : C.ink;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: 0.4,
        color: fg, background: bg, border: `1px solid ${tone === 'neutral' ? C.borderDefault : 'transparent'}`,
        borderRadius: 8, padding: '6px 12px', opacity: active ? t : t * 0.55,
        transform: `scale(${active ? 1 : 0.96})`, transition: 'none',
      }}>
        {label}
      </span>
    );
  };

/** counting metric value */
export const Num: React.FC<{ t: number; dur: number; value: number; format: (n: number) => string; delay?: number; size?: number; weight?: number; color?: string }> =
  ({ t, dur, value, format, delay = 0, size = 18, weight = 700, color = C.ink }) => (
    <span style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, color, fontVariantNumeric: 'tabular-nums' }}>
      {format(count(t - delay, dur, 0, value))}
    </span>
  );

/** animated slider (track + fill + thumb), driven by pct 0..1 */
export const SliderVis: React.FC<{ pct: number; label: string; value?: string; t?: number; height?: number }> =
  ({ pct, label, value, t = 1, height = 44 }) => {
    const track = 132;
    const k = clamp01(t) as number;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height, fontFamily: FONT }}>
        <span style={{ fontSize: 12.5, color: C.text2, width: 74, textAlign: 'right', letterSpacing: 0.2 }}>
          {label}
        </span>
        <div style={{ position: 'relative', width: track, height: 5, borderRadius: 999, background: C.active, opacity: k }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: track * pct * k, borderRadius: 999, background: C.accent }} />
          <div style={{ position: 'absolute', left: track * pct * k - 7, top: -5.5, width: 16, height: 16, borderRadius: 999, background: '#fff', border: `2px solid ${C.accent}`, boxShadow: '0 1px 3px rgba(17,17,17,0.15)' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, width: 64, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {value}
        </span>
      </div>
    );
  };

/** strategy pill in the sim panel */
export const StrategyPill: React.FC<{ label: string; active: boolean; color: string; t?: number }> =
  ({ label, active, color, t = 1 }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      borderRadius: 8, border: `1px solid ${active ? C.borderStrong : C.borderSubtle}`,
      background: active ? C.accentSubtle : C.surface,
      fontFamily: FONT, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.accentActive : C.text2,
      opacity: t,
    }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, opacity: active ? 1 : 0.4 }} />
      {label}
      {active && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, color: C.accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>running</span>}
    </div>
  );

/** metric cell for the results strip */
export const MetricCell: React.FC<{ label: string; active: boolean; color: string; t: number; delay: number; dur: number; value: number; format: (n: number) => string; width?: number }> =
  ({ label, active, color, t, delay, dur, value, format, width = 148 }) => {
    const k = clamp01((t - delay) / 14);
    return (
      <div style={{
        width, padding: '8px 12px', borderRadius: 8, border: `1px solid ${active ? C.borderDefault : C.borderSubtle}`,
        background: active ? C.surface : C.secondary, opacity: k * (0.5 + 0.5 * t),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 10.5, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600, color: C.muted, marginBottom: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
          {label}
        </div>
        <Num t={t} delay={delay} dur={dur} value={value} format={format} size={20} />
      </div>
    );
  };

/** soft section divider + title used inside panels */
export const SectionTitle: React.FC<{ children: React.ReactNode; t?: number }> = ({ children, t = 1 }) => (
  <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted, marginBottom: 8, opacity: t }}>
    {children}
  </div>
);