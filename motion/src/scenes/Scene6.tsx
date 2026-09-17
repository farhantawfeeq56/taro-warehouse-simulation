// Scene 6 - Compare Warehouse Decisions (52–65s)
// Taro's compare page: warehouses as columns, metrics as rows, ranked by
// total distance with the winner subtly highlighted.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { WarehouseView } from '../components/WarehouseView';
import { Num } from '../components/Widgets';
import type { Layout } from '../lib/layout';

// warehouse configs + honest sim numbers (zone strategy, same 26 orders)
const WAREHOUSES = [
  { name: 'Warehouse A', rackCount: 12, gridHeight: 16, cross: 1, dist: 276, time: 19.6, cost: 1.31, util: 82 },
  { name: 'Warehouse B', rackCount: 9, gridHeight: 12, cross: 2, dist: 216, time: 18.6, cost: 1.24, util: 100, best: true },
  { name: 'Warehouse C', rackCount: 14, gridHeight: 18, cross: 0, dist: 360, time: 21.0, cost: 1.40, util: 62 },
];

const LAYOUTS: Layout[] = WAREHOUSES.map((w) => makeLayout(w.rackCount, w.gridHeight, 1, w.cross));
const SITES = LAYOUTS.map((L, i) => pickSites(L, 26, 37 + i * 13).map((s, j) => ({ x: s.x, y: s.y, color: C.chart[j % 5] })));

const ROWS = [
  { k: 'Total Distance', unit: 'm', get: (w: (typeof WAREHOUSES)[number]) => w.dist, f: (n: number) => `${Math.round(n)} m`, width: 118 },
  { k: 'Estimated Time', unit: 'min', get: (w: (typeof WAREHOUSES)[number]) => w.time, f: (n: number) => `${n.toFixed(1)} min`, width: 96 },
  { k: 'Worker Utilization', unit: '', get: (w: (typeof WAREHOUSES)[number]) => w.util, f: (n: number) => `${Math.round(n)}%`, width: 96 },
  { k: 'Cost / Order', unit: '$', get: (w: (typeof WAREHOUSES)[number]) => w.cost, f: (n: number) => `$${n.toFixed(2)}`, width: 92 },
  { k: 'Orders Completed', unit: '', get: (w: (typeof WAREHOUSES)[number]) => 30, f: (n: number) => `${n}`, width: 96 },
];

const HEAD_W = 158;

export const Scene6: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 390, 12);

  const kCol = (i: number) => EASE_OUT(clamp01((t - (22 + i * 14)) / 24));
  const kBody = EASE_OUT(clamp01((t - 80) / 26));

  // ranking kicks in after the table fills
  const ranked = clamp01((t - 258) / 26);
  const bestIdx = 1;

  const rowT = (i: number) => clamp01((t - (104 + i * 34)) / 16);

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      {/* header */}
      <div style={{ position: 'absolute', left: 56, top: 40, display: 'flex', alignItems: 'center', gap: 14, opacity: clamp01((t - 8) / 18) }}>
        <span style={{ fontFamily: FONT, fontSize: 14, color: C.muted }}>←</span>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: C.text2 }}>Compare</span>
        <span style={{ fontFamily: FONT, fontSize: 15, color: C.borderStrong }}>/</span>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.ink }}>3 warehouses</span>
      </div>

      {/* the compare card */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 108, bottom: 132,
        borderRadius: 14, border: `1px solid ${C.borderDefault}`, background: C.surface,
        boxShadow: '0 24px 60px -30px rgba(17,17,17,0.25)', opacity: kBody,
        transform: `translateY(${(1 - kBody) * 20}px) scale(${0.99 + 0.01 * kBody})`,
        display: 'flex', flexDirection: 'column', padding: '18px 22px',
      }}>
        {/* one row: label column + three warehouse columns; every column
            shares the same block heights so labels align with values */}
        <div style={{ display: 'flex', gap: 12 }}>
          {/* label column */}
          <div style={{ width: HEAD_W - 22, flexShrink: 0 }}>
            {WAREHOUSES.map((w) => (
              <div key='h' />
            ))}
            <div style={{ height: 226 }} />
            {ROWS.map((r, ri) => (
              <div key={r.k} style={{
                height: 44, display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.borderSubtle}`,
                fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.text2,
                opacity: rowT(ri),
              }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C.chart[ri % 5], marginRight: 9 }} />
                {r.k}
              </div>
            ))}
          </div>

          {/* warehouse columns */}
          {WAREHOUSES.map((w, i) => (
            <div key={w.name} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ opacity: kCol(i) * (ranked > 0 && i !== bestIdx ? 1 - 0.25 * ranked : 1) }}>
                {/* mini grid */}
                <div style={{
                  position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center',
                  height: 148, borderRadius: 10, border: `1px solid ${C.borderSubtle}`,
                  background: C.bg, overflow: 'hidden',
                  boxShadow: ranked > 0 && i === bestIdx
                    ? `0 0 0 2px ${C.accent}, 0 10px 30px -12px rgba(76,92,45,0.5)`
                    : 'inset 0 0 0 1px rgba(17,17,17,0.02)',
                }}>
                  <MiniGrid L={LAYOUTS[i]} sites={SITES[i]} t={kCol(i)} />
                  {ranked > 0 && i === bestIdx && (
                    <div style={{
                      position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 5,
                      background: C.accent, color: '#fff', fontFamily: FONT, fontSize: 11, fontWeight: 700,
                      letterSpacing: 0.5, textTransform: 'uppercase', padding: '4px 9px', borderRadius: 7,
                      opacity: ranked,
                    }}>
                      Best
                    </div>
                  )}
                </div>
                {/* name + config chips */}
                <div style={{ marginTop: 10, textAlign: 'center', height: 78 }}>
                  <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                    {w.name}
                    {ranked > 0 && i === bestIdx && (
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: C.accent, marginLeft: 7, verticalAlign: 2 }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {[`Racks ${w.rackCount}`, `Cross ${w.cross}`, `Grid ${w.gridHeight}`, 'Orders 26'].map((chip) => (
                      <span key={chip} style={{
                        fontFamily: FONT, fontSize: 10.5, fontWeight: 600, color: C.text2,
                        background: C.secondary, border: `1px solid ${C.borderSubtle}`, borderRadius: 6,
                        padding: '3px 7px',
                      }}>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* values */}
              {ROWS.map((r, ri) => {
                const show = rowT(ri);
                const isBest = i === bestIdx && (ri === 0 || ri === 3);
                return (
                  <div key={r.k} style={{
                    display: 'flex', alignItems: 'center', height: 44,
                    borderTop: `1px solid ${C.borderSubtle}`,
                    background: i === bestIdx && ranked > 0 ? 'rgba(242,244,234,0.35)' : undefined,
                    opacity: show * (ranked > 0 && i !== bestIdx ? 1 - 0.2 * ranked : 1),
                  }}>
                    <span style={{
                      fontFamily: FONT, fontSize: 19, fontWeight: isBest ? 800 : 700,
                      color: isBest ? C.accentActive : C.ink, fontVariantNumeric: 'tabular-nums',
                    }}>
                      <Num t={t} delay={104 + ri * 34 + 6} dur={24} value={r.get(w)} format={r.f} size={19} />
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: FONT, fontSize: 11.5, color: C.muted, opacity: kBody, paddingTop: 14, marginTop: 'auto',
        }}>
          <span>Ranked by total distance · all strategies auto-run</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: C.accent }} />
            Best: Warehouse B
          </span>
        </div>
      </div>

      {/* statements */}
      <StatementK k={clamp01((t - 300) / 24) * clamp01((390 - t) / 14)} bottom={54} size={52}>
        Which configuration performs better?
      </StatementK>
      <StatementK k={clamp01((t - 348) / 22) * clamp01((390 - t) / 12)} bottom={268} size={30} sub>
        Compare decisions, not just simulations.
      </StatementK>
    </AbsoluteFill>
  );
};

const MiniGrid: React.FC<{ L: Layout; sites: { x: number; y: number; color: string }[]; t: number }> = ({ L, sites, t }) => {
  const CELL = Math.min(320 / L.width, 132 / L.height) * 0.9;
  return (
    <div style={{ transform: `scale(${0.94 + 0.06 * t})`, opacity: t }}>
      <WarehouseView layout={L} boxW={L.width * CELL} boxH={L.height * CELL} orders={sites} skuDensity={2} pad={0.08} startMarker gridLines={false} />
    </div>
  );
};

const StatementK: React.FC<{ k: number; bottom: number; size: number; sub?: boolean; children: React.ReactNode }> =
  ({ k, bottom, size, sub, children }) => (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom, textAlign: 'center', pointerEvents: 'none',
      opacity: k, transform: `translateY(${(1 - k) * 16}px)`, filter: `blur(${(1 - k) * 6}px)`,
    }}>
      <div style={{
        fontFamily: FONT, fontSize: size, fontWeight: sub ? 500 : 750,
        color: sub ? C.text2 : C.ink, lineHeight: 1.12, padding: '0 40px',
      }}>
        {children}
      </div>
    </div>
  );