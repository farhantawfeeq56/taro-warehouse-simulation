// tiny shared bits for scenes
import React from 'react';
import { C, FONT, EASE_OUT, clamp01 } from '../tokens';
import { In } from '../components/Widgets';
export { In };

export const BtnPlaceholder: React.FC<{ t: number; delay: number; children: React.ReactNode }> = ({ t, delay, children }) => {
  const k = EASE_OUT(clamp01((t - delay) / 18));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      height: 34, borderRadius: 9, fontFamily: FONT, fontSize: 13, fontWeight: 700,
      background: C.accent, color: '#fff', opacity: k,
      transform: `translateY(${(1 - k) * 10}px)`,
      boxShadow: '0 8px 20px -10px rgba(76,92,45,0.6)',
    }}>
      {children}
    </div>
  );
};