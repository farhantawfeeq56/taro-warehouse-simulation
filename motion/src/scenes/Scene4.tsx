// Scene 4 — Configure a Scenario (28–40s)
// The interface is being configured: Warehouse (geometry / inventory /
// placement) then Workload (orders / order size / workers). Each slider
// drives a visible change in the warehouse.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01, count, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { WarehouseView } from '../components/WarehouseView';
import { TaroFrame, DockGroup, Btn, KV } from '../components/TaroFrame';
import { WORKER_COLORS } from '../tokens';

const L4 = makeLayout(12, 18, 1, 3);
const SITES30 = pickSites(L4, 30, 37);
const ORDERS30 = SITES30.map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
const START = L4.workerStart;
const WORKERS4 = [0, 1, 2, 3].map((i) => ({
  x: Math.min(START.x + i * 4, L4.width - 3), y: START.y, color: WORKER_COLORS[i],
}));
const CELL = Math.min(600 / L4.width, 430 / L4.height) * 0.94;

// mini slider row used in the config dock
const Row: React.FC<{ k: string; t: number; pct: number; v: string }> = ({ k, t, pct, v }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontFamily: FONT, opacity: Math.min(1, t), borderBottom: `1px solid ${C.borderSubtle}` }}>
    <span style={{ fontSize: 11.5, color: C.text2, width: 74, textAlign: 'right' }}>{k}</span>
    <div style={{ position: 'relative', width: 84, height: 5, borderRadius: 99, background: C.active }}>
      {t > 0 && (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 84 * pct * t, borderRadius: 99, background: C.accent }} />
          <div style={{ position: 'absolute', left: 84 * pct * t - 6, top: -4.5, width: 14, height: 14, borderRadius: 99, background: '#fff', border: `2px solid ${C.accent}` }} />
        </>
      )}
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, width: 38, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</span>
  </div>
);

const Group: React.FC<{ title: string; tone?: 'plain' | 'accent'; t: number; children: React.ReactNode }> =
  ({ title, tone = 'plain', t, children }) => (
    <div style={{
      border: `1px solid ${tone === 'accent' ? C.accentSoft : C.borderSubtle}`, borderRadius: 10,
      padding: '8px 10px', background: tone === 'accent' ? C.accentSubtle : C.secondary, opacity: t,
      marginBottom: 8,
    }}>
      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: tone === 'accent' ? C.accent : C.muted, marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );

export const Scene4: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 360, 12);

  // warehouse: geometry phase dissolves to L4 (racks 9→12, grid 12→18, cross 2→3)
  const L9 = makeLayout(9, 12, 1, 2);
  const SITES9 = pickSites(L9, 14, 23);
  const ORDERS9 = SITES9.map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
  const WORKERS3 = [0, 1, 2].map((i) => ({
    x: Math.min(L9.workerStart.x + i * 4, L9.width - 3), y: L9.workerStart.y, color: WORKER_COLORS[i],
  }));
  const CELL9 = Math.min(600 / L9.width, 430 / L9.height) * 0.94;

  const dGeom = EASE_IN_OUT(clamp01((t - 46) / 20));
  const showL9 = clamp01((20 - (t - 46)) / 20);

  // sliders easing helper (all sliders: pct 0..1 and count-up value)
  const sl = (t0: number, dur = 12) => EASE_OUT(clamp01((t - t0) / dur));

  const racks = sl(30) * (12 - 9);
  const gridH = sl(42) * (18 - 12);
  const cross = sl(52) * (3 - 2);
  const skus = sl(112) * (128 - 96);
  const demand = sl(126) * (60 - 30);
  const footprint = sl(140) * (75 - 60);
  const bias = sl(150) * (70 - 40);
  const cluster = sl(160) * (65 - 55);
  const orders = Math.round(sl(178, 16) * (30 - 14));
  const workersN = Math.round(sl(214) * (4 - 3));

  // pins spawn staggered during workload phase
  const nPins = t < 170 ? 14 : 30;
  const pinAppear = (i: number) => {
    if (t < 170) return 1;
    return EASE_OUT(clamp01((t - (178 + i * 1.6)) / 8));
  };

  const density = Math.max(3, 3 + EASE_OUT(clamp01((t - 116) / 14)));

  const statement = clamp01((t - 248) / 26) * clamp01((360 - t) / 16);

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ marginTop: -18 }}>
          <TaroFrame
            width={1160}
            center={
              <div style={{ position: 'relative' }}>
                {t < 170 && showL9 > 0 && (
                  <div style={{ position: 'absolute', inset: 0, opacity: showL9 }}>
                    <WarehouseView layout={L9} boxW={L9.width * CELL9} boxH={L9.height * CELL9} orders={ORDERS9} workers={WORKERS3} skuDensity={3} pad={0.05} />
                  </div>
                )}
                <WarehouseView
                  layout={L4} boxW={L4.width * CELL} boxH={L4.height * CELL}
                  opacity={t < 170 ? dGeom : 1}
                  orders={ORDERS30.slice(0, nPins).map((o, i) => ({ ...o, appear: pinAppear(i) }))}
                  workers={WORKERS4.slice(0, 3 + workersN).map((w, i) => ({ ...w, appear: i < 3 ? 1 : EASE_OUT(clamp01((t - 220) / 12)) }))}
                  skuDensity={Math.round(density)}
                  pad={0.045}
                />
              </div>
            }
            left={
              <>
                <DockGroup title="Orders & Workload">
                  <KV k="Orders" v={String(14 + orders)} strong />
                  <KV k="Avg SKUs / order" v={String(count(t - 194, 12, 4, 6))} />
                  <KV k="Workers" v={String(3 + workersN)} />
                </DockGroup>
                <DockGroup title="Order generation">
                  <KV k="Distribution" v="Zipf" />
                  <KV k="Affinity groups" v="ON" />
                </DockGroup>
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Btn label="Regenerate orders" tone="ghost" />
                  <Btn label="Simulate" icon="▶" />
                </div>
              </>
            }
            right={
              <>
                <Group title="Warehouse Configuration" tone="accent" t={t > 170 ? 0.35 : 1}>
                  <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, margin: '2px 0' }}>Geometry</div>
                  <Row k="Racks" t={sl(30)} pct={0.25 + 0.75 * (9 + racks) / 12} v={String(9 + Math.round(racks))} />
                  <Row k="Grid height" t={sl(42)} pct={(12 + gridH) / 18} v={String(12 + Math.round(gridH))} />
                  <Row k="Cross aisles" t={sl(52)} pct={(2 + cross) / 3} v={String(2 + Math.round(cross))} />
                  <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, margin: '6px 0 2px' }}>Inventory</div>
                  <Row k="SKU count" t={sl(110)} pct={(96 + skus) / 224} v={String(Math.round(96 + skus))} />
                  <Row k="Demand dist." t={sl(126)} pct={(30 + demand) / 100} v={`${Math.round(30 + demand)}%`} />
                  <Row k="Footprint" t={sl(140)} pct={(60 + footprint) / 100} v={`${Math.round(60 + footprint)}%`} />
                  <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, margin: '6px 0 2px' }}>Placement</div>
                  <Row k="Slotting bias" t={sl(150)} pct={(40 + bias) / 100} v={`${Math.round(40 + bias)}%`} />
                  <Row k="Clustering" t={sl(160)} pct={(55 + cluster) / 100} v={`${Math.round(55 + cluster)}%`} />
                </Group>
              </>
            }
          />
        </div>
      </div>

      {/* workload chips appear once consumed */}
      {t > 170 && (
        <div style={{ position: 'absolute', left: 46, top: 34, display: 'flex', gap: 10, fontFamily: FONT, alignItems: 'center' }}>
          {['Orders', 'SKUs / order', 'Workers'].map((l, i) => (
            <span key={l} style={{
              fontSize: 13, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderDefault}`,
              borderRadius: 8, padding: '6px 12px', opacity: clamp01((t - (176 + i * 16)) / 10),
              transform: `translateY(${(1 - clamp01((t - (176 + i * 16)) / 10)) * 8}px)`,
            }}>
              {l}
            </span>
          ))}
        </div>
      )}

      {/* statement */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 56, textAlign: 'center', pointerEvents: 'none',
        opacity: statement, transform: `translateY(${(1 - clamp01((t - 248) / 26)) * 18}px)`,
        filter: `blur(${(1 - clamp01((t - 248) / 26)) * 7}px)`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 54, fontWeight: 750, color: C.ink, lineHeight: 1.12 }}>
          Create the conditions you want to test.
        </div>
      </div>
    </AbsoluteFill>
  );
};