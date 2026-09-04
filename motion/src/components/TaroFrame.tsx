// TaroFrame — the product interface shell. Mirrors the real app's bones:
// warm paper bg, white surface, `0.625rem` radius, subtle borders, a topbar
// with TARO + tabs, an orders/simulation dock on the left and a config dock
// on the right. Docks are swappable per scene.

import React from 'react';
import { C, FONT } from '../tokens';

export const Tab: React.FC<{ label: string; active?: boolean; t?: number }> = ({ label, active, t = 1 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px',
    borderRadius: 7, fontFamily: FONT, fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? C.ink : C.muted, background: active ? C.selected : 'transparent',
    opacity: t,
  }}>
    {label}
  </span>
);

interface Props {
  center: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  topRight?: React.ReactNode;
  tab?: 'warehouse' | 'compare';
  t?: number;             // 0..1 frame fade-in
  width?: number;
}

export const TaroFrame: React.FC<Props> = ({ center, left, right, topRight, tab = 'warehouse', t = 1, width = 1180 }) => {
  return (
    <div style={{
      position: 'relative', width, margin: '0 auto',
      borderRadius: 14, border: `1px solid ${C.borderDefault}`,
      background: C.bg, boxShadow: '0 18px 50px -22px rgba(17,17,17,0.28), 0 2px 6px rgba(17,17,17,0.05)',
      opacity: t, transform: `scale(${0.985 + 0.015 * t})`, transformOrigin: 'center',
      fontFamily: FONT, overflow: 'hidden',
    }}>
      {/* topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 42,
        borderBottom: `1px solid ${C.borderSubtle}`, background: C.surface,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, letterSpacing: 2.5, color: C.accent, textTransform: 'uppercase' }}>
          Taro
        </span>
        <div style={{ display: 'flex', gap: 2, marginLeft: 10 }}>
          <Tab label="Warehouse" active={tab === 'warehouse'} />
          <Tab label="Compare" active={tab === 'compare'} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {topRight}
        </div>
      </div>

      {/* body */}
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 330 }}>
        {left && (
          <div style={{
            width: 246, borderRight: `1px solid ${C.borderSubtle}`, background: C.surface,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {left}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, padding: 12, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {center}
        </div>
        {right && (
          <div style={{
            width: 236, borderLeft: `1px solid ${C.borderSubtle}`, background: C.surface,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {right}
          </div>
        )}
      </div>
    </div>
  );
};

/** group box used inside docks */
export const DockGroup: React.FC<{ title: string; children: React.ReactNode; t?: number; tone?: 'plain' | 'accent' }> =
  ({ title, children, t = 1, tone = 'plain' }) => (
    <div style={{
      border: `1px solid ${tone === 'accent' ? C.accentSoft : C.borderSubtle}`,
      borderRadius: 10, padding: '10px 12px',
      background: tone === 'accent' ? C.accentSubtle : C.secondary,
      opacity: t,
    }}>
      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );

/** small filled button (Simulate / Generate) */
export const Btn: React.FC<{ label: string; icon?: string; t?: number; tone?: 'accent' | 'ghost'; pulse?: boolean }> =
  ({ label, icon, t = 1, tone = 'accent', pulse = false }) => {
    const on = tone === 'accent';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        height: 30, borderRadius: 8, fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
        background: on ? C.accent : C.hover, color: on ? '#fff' : C.ink,
        boxShadow: pulse ? `0 0 0 0 rgba(76,92,45,0.35)` : undefined,
        opacity: t,
      }}>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        {label}
      </div>
    );
  };

/** small value row (label : value) used in config lists */
export const KV: React.FC<{ k: string; v: string; t?: number; strong?: boolean }> = ({ k, v, t = 1, strong = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: FONT, fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.borderSubtle}`,
    opacity: t,
  }}>
    <span style={{ color: C.text2 }}>{k}</span>
    <span style={{ fontWeight: strong ? 800 : 600, color: strong ? C.accentActive : C.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
  </div>
);