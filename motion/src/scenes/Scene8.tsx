// Scene 8 — The Feedback Loop + Outro (78–88s)
// Configure → Simulate → Compare → Experiment → Repeat. The loop builds,
// runs a pass, configs orbit around it, the camera pulls back, and the film
// closes on the wordmark.

import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01, envelope } from '../tokens';

const NODES = [
  { n: 'Configure', sub: 'Set conditions' },
  { n: 'Simulate', sub: 'Run picking strategies' },
  { n: 'Compare', sub: 'Rank warehouses' },
  { n: 'Experiment', sub: 'Propose one change' },
];

const CHIPS = [
  { label: 'Racks 9 · Cross 2', x: 20, y: 4, align: 'left' as const, c: C.accent },
  { label: 'Orders 26 · Workers 4', x: 400, y: 0, align: 'right' as const, c: C.info },
  { label: 'Racks 11 · Cross 2', x: 12, y: 330, align: 'left' as const, c: C.positive },
  { label: 'Racks 12 · Cross 3 · Orders 40', x: 366, y: 336, align: 'right' as const, c: C.warning },
];

export const Scene8: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 340, 14);

  // build sequence: node/arrow/k repeat step
  const step = 34; // frames per element
  const elemT = (i: number) => EASE_OUT(clamp01((t - (14 + i * step)) / 18));
  // elements: 0..3 nodes, 4..6 arrows, 7 repeat label, 8 repeat path
  const Y0 = 170, STEP = 76, NH = 56;
  const NY = (i: number) => Y0 + i * STEP;

  // loop pass lights nodes in sequence
  const pass = (i: number) => clamp01(interpolate(t, [196 + i * 11, 196 + i * 11 + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const repeatGlow = clamp01(interpolate(t, [244, 262], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  const zoom = 1 - 0.09 * EASE_IN_OUT(clamp01((t - 252) / 56));

  const stmt = clamp01((t - 262) / 28) * clamp01((340 - t) / 18);
  const word = clamp01((t - 320) / 20) * clamp01((340 - t) / 14);

  const repeatPath = `M 512 448 C 350 448 350 226 512 222`;

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 620, height: 420, transform: `scale(${zoom})`, transformOrigin: 'center' }}>
          {/* repeat path */}
          <svg width={620} height={420} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <path
              d={repeatPath}
              fill="none" stroke={C.accent} strokeWidth={2.5}
              strokeDasharray={500} strokeDashoffset={500 - 500 * elemT(8)}
              strokeLinecap="round" opacity={0.5 + 0.5 * repeatGlow}
            />
            {repeatGlow > 0 && (
              <path d={repeatPath} fill="none" stroke={C.accentSoft} strokeWidth={8} strokeLinecap="round" opacity={0.8 * repeatGlow} />
            )}
          </svg>
          {/* repeat label */}
          <div style={{
            position: 'absolute', left: 150, top: 224, fontFamily: FONT, fontSize: 13.5, fontWeight: 750,
            color: C.accentActive, background: C.accentSoft, border: `1px solid ${C.accentSoft}`, borderRadius: 999,
            padding: '7px 15px', opacity: elemT(7),
          }}>
            Repeat
          </div>

          {/* nodes + arrows */}
          {NODES.map((n, i) => {
            const lit = pass(i);
            return (
              <React.Fragment key={n.n}>
                <div style={{
                  position: 'absolute', left: 250, top: NY(i), width: 320, height: NH,
                  borderRadius: 11, background: lit > 0 ? C.accentSubtle : C.surface,
                  border: `1px solid ${lit > 0 ? C.accentSoft : C.borderDefault}`,
                  boxShadow: lit > 0 ? `inset 0 0 0 1.5px ${C.accent}, 0 12px 30px -18px rgba(76,92,45,0.5)` : '0 4px 14px -12px rgba(17,17,17,0.3)',
                  display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
                  opacity: elemT(i),
                  transform: `translateY(${(1 - elemT(i)) * 14}px)`,
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, background: lit > 0 ? C.accent : C.accentSoft,
                    color: lit > 0 ? '#fff' : C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT, fontSize: 13, fontWeight: 800, flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 750, color: C.ink, letterSpacing: 0.2 }}>{n.n}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{n.sub}</div>
                  </div>
                </div>
                {i < NODES.length - 1 && (
                  <div style={{
                    position: 'absolute', left: 408, top: NY(i) + NH + 4, fontSize: 20, color: C.accent,
                    opacity: elemT(4 + i), transform: `scaleY(${0.4 + 0.6 * elemT(4 + i)})`,
                  }}>
                    ↓
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* orbiting config chips */}
          {CHIPS.map((ch, i) => {
            const k = EASE_OUT(clamp01((t - (208 + i * 12)) / 20));
            return (
              <div key={ch.label} style={{
                position: 'absolute', left: ch.x, top: ch.y,
                textAlign: ch.align === 'right' ? 'right' : 'left',
                fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.text2,
                background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 8,
                padding: '6px 12px', opacity: k, transform: `translateY(${(1 - k) * 10}px)`,
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: ch.c }} />
                {ch.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* final statement */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 468, textAlign: 'center', pointerEvents: 'none',
        opacity: stmt, transform: `translateY(${(1 - clamp01((t - 262) / 28)) * 18}px)`,
        filter: `blur(${(1 - clamp01((t - 262) / 28)) * 8}px)`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 750, color: C.ink, lineHeight: 1.14, padding: '0 60px' }}>
          Taro turns warehouse planning into a system of experiments.
        </div>
      </div>

      {/* wordmark */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', pointerEvents: 'none',
        opacity: word,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 92, fontWeight: 850, letterSpacing: 14, color: C.accent, lineHeight: 1, paddingRight: 14 }}>
          TARO
        </div>
        <div style={{ width: 120, height: 4, background: C.accentSoft, borderRadius: 99, margin: '18px auto 0' }} />
        <div style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 450, color: C.text2, marginTop: 16, letterSpacing: 0.3 }}>
          Warehouse Picking Simulation & Decision Support
        </div>
      </div>
    </AbsoluteFill>
  );
};