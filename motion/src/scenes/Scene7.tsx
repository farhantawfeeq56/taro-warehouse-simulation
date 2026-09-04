// Scene 7 — Experimentation (65–78s)
// The best warehouse sits in focus; a recommendation card proposes one
// change: more racks. The grid morphs 9 → 11. A hypothesis, not an oracle.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { WarehouseView } from '../components/WarehouseView';
import { In, BtnPlaceholder } from './helpers';
// current best: Warehouse B from the comparison
const L_OLD = makeLayout(9, 12, 1, 2);
const L_NEW = makeLayout(11, 12, 1, 2); // +2 racks (capacity axis, Taro's rule)
const OLDSITES = pickSites(L_OLD, 26, 50).map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
const NEWSITES = pickSites(L_NEW, 26, 61).map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
// new racks are the columns ≥ old layout width; highlight rack indices 9,10
const NEW_RACK_XS = [29, 30, 32, 33]; // rack indices 9,10 on the new layout

const CELL_OLD = Math.min(560 / L_OLD.width, 430 / L_OLD.height) * 0.92;
const CELL_NEW = Math.min(560 / L_NEW.width, 430 / L_NEW.height) * 0.92;

export const Scene7: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 350, 12);

  const kFocus = EASE_OUT(clamp01((t - 14) / 24));
  const kCard = EASE_OUT(clamp01((t - 44) / 30));
  const morph = EASE_IN_OUT(clamp01((t - 118) / 26));
  const pulse = (1 + Math.sin((t - 148) * 0.22)) / 2; // 0..1..0 highlight

  const showNew = t > 118 ? 1 : 0;
  const oldOp = t < 118 ? 1 : Math.max(0, 1 - morph);
  const newOp = t < 118 ? 0 : morph;

  const statement = clamp01((t - 250) / 26) * clamp01((350 - t) / 14);
  const disclaimer = clamp01((t - 64) / 18);

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      {/* "current best" chip */}
      <div style={{
        position: 'absolute', left: 52, top: 42, display: 'flex', gap: 10, alignItems: 'center',
        opacity: kFocus,
      }}>
        <span style={{
          fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.ink,
          background: C.surface, border: `1px solid ${C.borderDefault}`, borderRadius: 999,
          padding: '7px 14px',
        }}>
          Current best · Warehouse B
        </span>
        <span style={{
          fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.text2,
          background: C.accentSubtle, border: `1px solid ${C.accentSoft}`, borderRadius: 999,
          padding: '7px 14px',
        }}>
          Total distance 216 m
        </span>
      </div>

      {/* warehouse focus */}
      <div style={{
        position: 'absolute', left: 70, top: 108, bottom: 118,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: kFocus, transform: `translateY(${(1 - kFocus) * 16}px)`,
      }}>
        <div style={{ position: 'relative' }}>
          {oldOp > 0 && (
            <div style={{ position: 'absolute', opacity: oldOp, }}>
              <WarehouseView layout={L_OLD} boxW={L_OLD.width * CELL_OLD} boxH={L_OLD.height * CELL_OLD} orders={OLDSITES} skuDensity={2} pad={0.06} />
            </div>
          )}
          <WarehouseView
            layout={L_NEW} boxW={L_NEW.width * CELL_NEW} boxH={L_NEW.height * CELL_NEW}
            opacity={newOp} orders={NEWSITES} skuDensity={2} pad={0.06}
          />
          {/* new-rack highlight pulse */}
          {showNew > 0 && (
            <svg width={L_NEW.width * CELL_NEW} height={L_NEW.height * CELL_NEW} viewBox={`${-(0.06 * Math.min(L_NEW.width, L_NEW.height))} ${-(0.06 * Math.min(L_NEW.width, L_NEW.height))} ${L_NEW.width + 0.12 * Math.min(L_NEW.width, L_NEW.height)} ${L_NEW.height + 0.12 * Math.min(L_NEW.width, L_NEW.height)}`} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.35 + 0.65 * pulse, pointerEvents: 'none' }}>
              {NEW_RACK_XS.map((x) => (
                <g key={x}>
                  <rect x={x + 0.06} y={2.06} width={0.88} height={L_NEW.height - 4.12} rx={0.2} fill={C.accentSoft} opacity={0.5 * showNew} />
                  <rect x={x + 0.06} y={2.06} width={0.88} height={L_NEW.height - 4.12} rx={0.2} fill="none" stroke={C.accent} strokeWidth={0.09} />
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* recommendation card */}
      <div style={{
        position: 'absolute', right: 46, top: 108, width: 356,
        borderRadius: 14, border: `1px solid ${C.borderDefault}`, background: C.surface,
        boxShadow: '0 26px 60px -28px rgba(17,17,17,0.3)',
        opacity: kCard, transform: `translateX(${(1 - kCard) * 90}px) scale(${0.97 + 0.03 * kCard})`,
      }}>
        <div style={{ padding: '18px 18px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 12, fontWeight: 800 }}>✦</span>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 750, color: C.ink }}>Recommended experiment</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, marginTop: 1 }}>capacity axis · deterministic rules</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px' }}>
          <In t={t} delay={56}>
            <div style={{
              fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.accentActive,
              background: C.accentSoft, border: `1px solid ${C.accentSoft}`, borderRadius: 8,
              padding: '7px 12px', display: 'inline-block',
            }}>
              Increase capacity
            </div>
          </In>

          <div style={{ marginTop: 18, fontFamily: FONT }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: C.muted, marginBottom: 10 }}>
              Proposed change
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text2, width: 66 }}>Racks</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>9</span>
              <span style={{ display: 'flex', alignItems: 'center', color: C.accent, fontSize: 20, fontWeight: 700 }}>→</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.accentActive, fontVariantNumeric: 'tabular-nums' }}>11</span>
              <DetailIn t={t} delay={70} />
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
              Rack columns 9 → 11 · cross aisles unchanged
            </div>
          </div>

          <In t={t} delay={88}>
            <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 9, background: C.secondary, border: `1px solid ${C.borderSubtle}`, fontFamily: FONT, fontSize: 12, color: C.text2, lineHeight: 1.45 }}>
              “Two extra rack columns shorten the walk to fast-moving SKUs.”
            </div>
          </In>

          <div style={{ marginTop: 16 }}>
            <BtnPlaceholder t={t} delay={102}>
              Generate experiment
            </BtnPlaceholder>
          </div>
        </div>
      </div>

      {/* generated label */}
      <div style={{
        position: 'absolute', left: 52, bottom: 92, opacity: newOp,
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.accentActive,
          background: C.accentSoft, border: `1px solid ${C.accentSoft}`, borderRadius: 999, padding: '8px 16px',
        }}>
          Generated · Warehouse B·2 — racks 11
        </div>
      </div>

      {/* disclaimer */}
      <div style={{
        position: 'absolute', right: 46, bottom: 60, fontFamily: FONT, fontSize: 10.5,
        color: C.muted, opacity: disclaimer * 0.85, maxWidth: 356, textAlign: 'right',
      }}>
        AI experimentation is currently mocked using deterministic recommendations.
      </div>

      {/* statement */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 46, textAlign: 'center', pointerEvents: 'none',
        opacity: statement, transform: `translateY(${(1 - clamp01((t - 250) / 26)) * 18}px)`,
        filter: `blur(${(1 - clamp01((t - 250) / 26)) * 7}px)`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 750, color: C.ink, lineHeight: 1.12 }}>
          Test what could work next.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const DetailIn: React.FC<{ t: number; delay: number }> = ({ t, delay }) => {
  const k = EASE_OUT(clamp01((t - delay) / 14));
  return (
    <span style={{
      fontFamily: FONT, fontSize: 10.5, color: C.muted, fontWeight: 500,
      opacity: k, transform: `translateY(${(1 - k) * 6}px)`,
    }}>
      hypothesis
    </span>
  );
};