// WarehouseView - the film's main visual system, built exactly like Taro's
// SVG renderer: paper background, dark rack bays with paper-dot SKUs, worker
// start marker, colored route polylines with head dots, order pins, workers
// and soft zone tints. All coordinates are in cell units; the SVG viewBox
// fits the layout so any canvas box scales it crisply.

import React from 'react';
import { C, WORKER_COLORS, STRATEGY_COLORS } from '../tokens';
import type { Layout, Pt } from '../lib/layout';
import type { SimRoute } from '../lib/routes';
import { routeAt } from '../lib/routes';

export interface OrderPin {
  x: number; y: number;
  color?: string;
  /** 0..1 spawn/check progress for live updates */
  appear?: number;
}

export interface WorkerDot {
  x: number; y: number;
  color?: string;
  appear?: number;
  label?: string;
}

export interface RouteLayer {
  route: SimRoute;
  color?: string;
  t: number;          // 0..1 draw progress
  width?: number;
  opacity?: number;
  head?: boolean;
  dashed?: boolean;
}

export interface Zone {
  x: number; y: number; w: number; h: number;
  color: string;
  opacity: number;
}

interface Props {
  layout: Layout;
  boxW: number;   // render width px (viewBox will fit)
  boxH: number;
  orders?: OrderPin[];
  workers?: WorkerDot[];
  routes?: RouteLayer[];
  zones?: Zone[];
  shelfFades?: Record<string, number>; // "x,y" -> opacity 0..1
  gridOpacity?: number;
  startMarker?: boolean;
  /** how many SKU dots to show per bay (1..4) - inventory density */
  skuDensity?: number;
  /** accessibility of grid lines - subtle paper grid */
  gridLines?: boolean;
  pad?: number;   // inner padding ratio
  /** stage-wise fade for the whole view */
  opacity?: number;
  scale?: number;
}

const bayDots = (l: Pt): { x: number; y: number; r: number; c: string }[] => {
  const pad = 0.14, gap = 0.1;
  const tw = (1 - pad * 2 - gap) / 2;
  const th = (1 - pad * 2 - gap) / 2;
  const ox = pad, oy = pad;
  const r = Math.min(tw, th) / 2;
  return [
    { x: ox + tw / 2, y: oy + th / 2, r, c: C.paperGold },
    { x: ox + tw + gap + tw / 2, y: oy + th / 2, r, c: C.paperPurple },
    { x: ox + tw / 2, y: oy + th + gap + th / 2, r, c: C.paperBlue },
    { x: ox + tw + gap + tw / 2, y: oy + th + gap + th / 2, r, c: C.paperOrange },
  ];
};

export const WarehouseView: React.FC<Props> = ({
  layout, boxW, boxH, orders = [], workers = [], routes = [], zones = [],
  shelfFades, gridOpacity = 1, startMarker = true, gridLines = true,
  pad = 0.04, opacity = 1, scale = 1, skuDensity = 4,
}) => {
  const W = layout.width, H = layout.height;
  // pad by a fraction of the smaller dimension so dots don't clip
  const p = Math.max(0.45, pad * Math.min(W, H));
  const vb = `${-p} ${-p} ${W + 2 * p} ${H + 2 * p}`;
  const labelStyle = { fontFamily: 'InstrumentSans, sans-serif', fill: C.muted } as const;

  return (
    <svg
      viewBox={vb}
      width={boxW}
      height={boxH}
      style={{
        width: boxW, height: boxH,
        opacity, transform: `scale(${scale})`, transformOrigin: 'center',
      }}
    >
      {/* paper base */}
      <rect x={-p} y={-p} width={W + 2 * p} height={H + 2 * p} rx={6} fill={C.surface} stroke={C.borderSubtle} strokeWidth={0.12} />

      {/* fine grid */}
      {gridLines && (
        <g opacity={0.7 * gridOpacity}>
          {Array.from({ length: W + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i} y1={0} x2={i} y2={H} stroke={C.gridLine} strokeWidth={0.05} />
          ))}
          {Array.from({ length: H + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i} x2={W} y2={i} stroke={C.gridLine} strokeWidth={0.05} />
          ))}
        </g>
      )}

      {/* zone tints */}
      {zones.map((z, i) => (
        <rect key={i} x={z.x} y={z.y} width={z.w} height={z.h} fill={z.color} opacity={z.opacity} rx={0.6} />
      ))}

      {/* rack bays */}
      {layout.shelves.map((s) => {
        const o = (shelfFades && shelfFades[`${s.x},${s.y}`] !== undefined)
          ? shelfFades[`${s.x},${s.y}`] : 1;
        if (o <= 0.001) return null;
        const dots = bayDots(s);
        return (
          <g key={`${s.x},${s.y}`} opacity={o}>
            <rect x={s.x + 0.08} y={s.y + 0.08} width={0.84} height={0.84} rx={0.18} fill={C.rackInk} />
            <circle cx={s.x + 0.08 + 0.07} cy={s.y + 0.08 + 0.07} r={0.12} fill={C.paperBlue} opacity={0.45} />
            {dots.slice(0, skuDensity).map((d, i) => (
              <circle key={i} cx={s.x + d.x} cy={s.y + d.y} r={d.r} fill={d.c} />
            ))}
          </g>
        );
      })}

      {/* order pins */}
      {orders.map((o, i) => (
        <g key={`o${i}`} opacity={o.appear ?? 1}>
          <rect
            x={o.x + 0.24} y={o.y + 0.24} width={0.52} height={0.52} rx={0.12}
            fill={o.color ?? C.accent} stroke={C.surface} strokeWidth={0.1}
          />
        </g>
      ))}

      {/* routes */}
      {routes.map((r, i) => {
        if (r.t <= 0 || r.opacity === 0) return null;
        const { pts, pos, dist } = routeAt(r.route, r.t);
        if (!pts || pts.length < 1) return null;
        const color = r.color ?? STRATEGY_COLORS.single;
        const linePts = pts.map((pt) => `${pt.x + 0.5},${pt.y + 0.5}`).join(' ');
        return (
          <g key={i} opacity={Math.min(1, r.t * 3) * (r.opacity ?? 1)}>
            <polyline
              points={linePts}
              fill="none" stroke={color} strokeWidth={r.width ?? 0.14}
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={r.dashed ? '0.3 0.22' : undefined}
              opacity={0.85}
            />
            {r.head && (
              <g>
                <circle cx={pos.x + 0.5} cy={pos.y + 0.5} r={0.42} fill={color} opacity={0.18} />
                <circle cx={pos.x + 0.5} cy={pos.y + 0.5} r={0.26} fill={color} stroke={C.surface} strokeWidth={0.09} />
              </g>
            )}
            {dist !== undefined && dist > 0 && (
              <text x={pos.x + 0.5 + 0.5} y={pos.y + 0.5 - 0.5} fontSize={0.42} {...labelStyle} fontWeight={600}>
                {Math.round(dist)}
              </text>
            )}
          </g>
        );
      })}

      {/* workers */}
      {workers.map((w, i) => (
        <g key={`w${i}`} opacity={w.appear ?? 1}>
          <circle cx={w.x + 0.5} cy={w.y + 0.5} r={0.3} fill={w.color ?? WORKER_COLORS[0]} stroke={C.surface} strokeWidth={0.09} />
          {w.label && (
            <text x={w.x + 0.5} y={w.y + 0.5} fontSize={0.3} fill={C.surface} textAnchor="middle" dominantBaseline="central" fontFamily="InstrumentSans, sans-serif" fontWeight={700}>
              {w.label}
            </text>
          )}
        </g>
      ))}

      {/* start marker */}
      {startMarker && (
        <g>
          <rect
            x={layout.workerStart.x + 0.3} y={layout.workerStart.y + 0.3}
            width={0.4} height={0.4} rx={0.08}
            fill={C.accent} stroke={C.surface} strokeWidth={0.08}
          />
          <text
            x={layout.workerStart.x + 0.5} y={layout.workerStart.y + 0.5}
            fontSize={0.26} fill={C.surface} textAnchor="middle" dominantBaseline="central"
            fontFamily="InstrumentSans, sans-serif" fontWeight={700}
          >S</text>
        </g>
      )}
    </svg>
  );
};

export const zoneBands = (layout: Layout, n: number, top = 0, bottom = 0): Zone[] => {
  const innerTop = 1.6, innerBottom = layout.height - 1.6;
  const h = (innerBottom - innerTop) / n;
  const tints = [C.accentSubtle, C.infoSoft, C.warningSoft];
  return Array.from({ length: n }, (_, i) => ({
    x: 0.3, y: innerTop + i * h, w: layout.width - 0.6, h,
    color: tints[i % tints.length], opacity: 0.9,
  }));
};