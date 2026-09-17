// Scene 3 - Meet Taro (20–28s)
// The abstract warehouse dissolves into the real product frame - same grid,
// same orders - and the intro statement lands on top.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01, envelope } from '../tokens';
import { makeLayout, pickSites } from '../lib/layout';
import { WarehouseView } from '../components/WarehouseView';
import { TaroFrame, DockGroup, Btn, KV } from '../components/TaroFrame';
import { In } from '../components/Widgets';
import { WORKER_COLORS } from '../tokens';

const L = makeLayout(9, 12, 1, 2);
const SITES = pickSites(L, 14, 23);
const ORDERS = SITES.map((s, i) => ({ x: s.x, y: s.y, color: C.chart[i % 5] }));
const START = L.workerStart;
const WORKERS = [0, 1, 2].map((i) => ({
  x: Math.min(START.x + i * 4, L.width - 3), y: START.y, color: WORKER_COLORS[i],
}));

const CELL = Math.min(600 / L.width, 420 / L.height) * 0.94;

export const Scene3: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const fade = envelope(t, 240, 14);

  // abstract → product dissolve
  const kFrame = EASE_OUT(clamp01((t - 12) / 26));
  const abstractOp = 1 - kFrame * 0.85;

  const zoom = 1 + 0.012 * EASE_IN_OUT(clamp01(t / 220));

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade, fontFamily: FONT }}>
      {/* abstract warehouse fading out */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: abstractOp }}>
        <WarehouseView layout={L} boxW={L.width * CELL * 1.18} boxH={L.height * CELL * 1.18} orders={ORDERS} workers={WORKERS} skuDensity={3} pad={0.05} />
      </div>

      {/* product frame homing in */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${zoom})` }}>
        <div style={{ marginTop: 48 }}>
          <TaroFrame
            t={kFrame}
            width={1160}
            center={<WarehouseView layout={L} boxW={L.width * CELL} boxH={L.height * CELL} orders={ORDERS} workers={WORKERS} skuDensity={3} pad={0.05} />}
            left={
              <>
                <DockGroup title="Orders & Workload">
                  <KV k="Orders" v="14" strong />
                  <KV k="Avg SKUs / order" v="4" />
                </DockGroup>
                <DockGroup title="Workers">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: FONT, fontSize: 12, color: C.text2 }}>
                    {WORKERS.map((w, i) => (
                      <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: w.color, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(17,17,17,0.15)', display: 'inline-block' }} />
                    ))}
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: C.ink }}>3</span>
                  </div>
                </DockGroup>
                <div style={{ marginTop: 'auto' }}>
                  <Btn label="Simulate" icon="▶" />
                </div>
              </>
            }
            right={
              <>
                <DockGroup title="Warehouse Configuration" tone="accent">
                  <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, marginTop: 2, marginBottom: 2 }}>Geometry</div>
                  <KV k="Grid height" v="12" />
                  <KV k="Racks" v="9" />
                  <KV k="Cross aisles" v="2" />
                  <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, marginTop: 6, marginBottom: 2 }}>Inventory</div>
                  <KV k="SKU count" v="96" />
                  <KV k="Storage footprint" v="60%" />
                  <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, marginTop: 6, marginBottom: 2 }}>Placement</div>
                  <KV k="Slotting bias" v="40%" />
                  <KV k="Category clustering" v="55%" />
                </DockGroup>
              </>
            }
          />
        </div>
      </div>

      {/* statements */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 84, textAlign: 'center', pointerEvents: 'none' }}>
        <In t={t} delay={40}>
          <span style={{ fontFamily: FONT, fontSize: 22, letterSpacing: 6, textTransform: 'uppercase', fontWeight: 600, color: C.accent }}>
            Meet
          </span>
          <span style={{ fontFamily: FONT, fontSize: 74, fontWeight: 800, letterSpacing: 3, color: C.ink, marginLeft: 14 }}>
            Taro
          </span>
          <div style={{ height: 4, width: 160, background: C.accent, borderRadius: 99, margin: '14px auto 0' }} />
        </In>
        <In t={t} delay={104}>
          <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 450, color: C.text2, marginTop: 20 }}>
            A simulation-first decision system for warehouse picking.
          </div>
        </In>
      </div>
    </AbsoluteFill>
  );
};