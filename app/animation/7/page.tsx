'use client';

import { useEffect, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { cn } from '@/lib/utils';

const WORD = ['T', 'a', 'r', 'o'];
const TAG = 'Warehouse Decision Lab';
const OLIVE = '#4C5C2D';
const TILES = ['#D6A83D', '#8A70A8', '#5B8DB8', '#C87555'];

const VARIANTS = [
  { n: 1, label: 'Route' },
  { n: 2, label: 'Racks' },
  { n: 3, label: 'Affinity' },
  { n: 4, label: 'Floorline' },
  { n: 5, label: 'Parcel' },
  { n: 6, label: 'Dotgrid' },
  { n: 7, label: 'Ping' },
  { n: 8, label: 'Stacks' },
  { n: 9, label: 'Aisle' },
  { n: 10, label: 'Shelf' },
] as const;

function Graphic({ variant }: { variant: number }) {
  switch (variant) {
    case 1:
      return (
        <svg viewBox="0 0 300 30" className="g-in mx-auto mt-3 w-[280px] max-w-[80vw]" aria-hidden>
          <path d="M6 20 C 80 20, 100 8, 150 11 S 250 22, 294 9" fill="none" stroke={OLIVE} strokeWidth="2" strokeLinecap="round" strokeDasharray="300" strokeDashoffset="300" className="g-draw" />
          <circle r="4.5" fill={OLIVE}>
            <animateMotion dur="1.3s" begin="0.7s" fill="freeze" path="M6 20 C 80 20, 100 8, 150 11 S 250 22, 294 9" />
          </circle>
        </svg>
      );
    case 2:
      return (
        <div className="mt-3 flex items-end justify-center gap-[7px]" aria-hidden>
          {[26, 38, 30, 42, 34, 40, 28].map((h, i) => (
            <span key={i} className="g-rack w-[5px] rounded-t-[2px]" style={{ height: h, backgroundColor: 'var(--foreground)', opacity: 0.45, animationDelay: `${400 + i * 60}ms` }} />
          ))}
        </div>
      );
    case 3:
      return (
        <div className="mt-3 flex items-center justify-center gap-2" aria-hidden>
          {TILES.map((c, i) => (
            <span key={i} className="g-pop h-2 w-2 rounded-full" style={{ backgroundColor: c, animationDelay: `${450 + i * 90}ms` }} />
          ))}
        </div>
      );
    case 4:
      return (
        <div className="mx-auto mt-4 w-[240px]" aria-hidden>
          <span className="g-aisleline block h-[2px] w-full rounded-full" style={{ backgroundColor: 'var(--foreground)', opacity: 0.35 }} />
          <div className="mt-2 flex justify-between">
            <span className="g-rack w-6 rounded-t-[2px]" style={{ height: 14, backgroundColor: 'var(--foreground)', opacity: 0.4, animationDelay: '500ms' }} />
            <span className="g-rack w-6 rounded-t-[2px]" style={{ height: 14, backgroundColor: 'var(--foreground)', opacity: 0.4, animationDelay: '550ms' }} />
            <span className="g-rack w-6 rounded-t-[2px]" style={{ height: 14, backgroundColor: 'var(--foreground)', opacity: 0.4, animationDelay: '600ms' }} />
          </div>
        </div>
      );
    case 5:
      return (
        <div className="relative mx-auto mt-3 h-4 w-[220px]" aria-hidden>
          <span className="g-drop absolute left-[46%] h-3.5 w-3.5 rounded-[3px]" style={{ backgroundColor: OLIVE, animationDelay: '600ms' }} />
        </div>
      );
    case 6:
      return (
        <div className="mx-auto mt-4 grid w-[200px] grid-cols-8 gap-[5px]" aria-hidden>
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="g-pop h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--foreground)', opacity: 0.28, animationDelay: `${300 + i * 22}ms` }} />
          ))}
        </div>
      );
    case 7:
      return (
        <div className="relative mx-auto mt-3 h-4 w-[220px]" aria-hidden>
          <span className="g-ping absolute left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2" style={{ borderColor: OLIVE }} />
          <span className="g-ping absolute left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2" style={{ borderColor: OLIVE, animationDelay: '450ms' }} />
        </div>
      );
    case 8:
      return (
        <div className="mt-3 flex items-end justify-center gap-1.5" aria-hidden>
          {[[10, 16, 22], [14, 20, 26], [11, 18, 24]].map((zs, i) => (
            <span key={i} className="g-rack flex flex-col justify-end gap-0.5" style={{ animationDelay: `${420 + i * 80}ms` }}>
              {zs.map((z, j) => (
                <span key={j} className="block w-4 rounded-[2px]" style={{ height: 4, backgroundColor: j === 0 ? 'var(--foreground)' : j === 1 ? OLIVE : TILES[2] }} />
              ))}
            </span>
          ))}
        </div>
      );
    case 9:
      return (
        <div className="relative mx-auto mt-3 h-4 w-[260px] overflow-hidden" aria-hidden>
          <span className="g-band block h-[2px] w-full rounded-full" style={{ backgroundColor: 'var(--foreground)', opacity: 0.25 }} />
        </div>
      );
    default:
      return (
        <div className="mx-auto mt-3 w-[150px] border-t border-border pt-2" aria-hidden>
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="g-pop h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: OLIVE, opacity: 0.7, animationDelay: `${450 + i * 80}ms` }} />
            ))}
          </div>
        </div>
      );
  }
}

export default function Animation7Page() {
  const [variant, setVariant] = useState(1);
  const [runId, setRunId] = useState(0);

  const replay = (v?: number) => {
    if (v !== undefined) setVariant(v);
    setRunId((id) => id + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'r') replay();
      else if (k >= '0' && k <= '9') replay(k === '0' ? 10 : Number(k));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <style>{`
        @keyframes taro-settle { 0% { opacity: 0; transform: translateY(-36px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
        @keyframes taro-out { to { opacity: 0; transform: translateY(-24px); } }
        .taro-letter { display: inline-block; opacity: 0; animation-name: taro-settle, taro-out; animation-duration: 0.85s, 0.55s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in; animation-delay: var(--id), 3000ms; animation-fill-mode: both; }
        @keyframes taro-tag { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes taro-tagout { to { opacity: 0; transform: translateY(-6px); } }
        .taro-tag { opacity: 0; animation-name: taro-tag, taro-tagout; animation-duration: 0.6s, 0.45s; animation-timing-function: cubic-bezier(0.22,1,0.36,1), ease-in; animation-delay: 0.6s, 2750ms; animation-fill-mode: both; }

        /* Small graphics — subtle, staggered, low presence. */
        @keyframes g-fadeup { from { opacity: 0; transform: translateY(10px); } to { opacity: var(--go, 1); transform: none; } }
        @keyframes g-fadeout { to { opacity: 0; } }
        .g-in, .g-rack, .g-pop, .g-drop, .g-ping { opacity: 0; animation-name: g-fadeup, g-fadeout; animation-duration: 0.6s, 0.5s; animation-timing-function: cubic-bezier(0.22,1,0.36,1), ease-in; animation-delay: var(--gd, 300ms), 2850ms; animation-fill-mode: both; }
        .g-draw { animation: g-draw 1.3s ease-in-out 0.7s both; }
        @keyframes g-draw { to { stroke-dashoffset: 0; } }
        .g-ping { --go: 0.7; border-radius: 9999px; animation-name: g-ping, g-fadeout; }
        @keyframes g-ping { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); } 30% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2); } }
        @keyframes g-band { 0% { left: -30%; opacity: 0; } 15% { opacity: 0.35; } 85% { opacity: 0.35; } 100% { left: 120%; opacity: 0; } }
        .g-band { position: absolute; width: 70px; left: 0; animation: g-band 1.2s cubic-bezier(0.4,0,0.2,1) 0.5s both; }

        @media (prefers-reduced-motion: reduce) {
          .taro-letter, .taro-tag, .g-in, .g-rack, .g-pop, .g-drop, .g-ping, .g-draw, .g-band { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>

      <div key={`${runId}-${variant}`} className="relative text-center">
        <div className="text-7xl font-bold tracking-tight text-foreground sm:text-8xl" aria-label="Taro">
          {WORD.map((ch, i) => (
            <span key={i} className="taro-letter" style={{ ['--id' as string]: `${i * 75}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <Graphic variant={variant} />
        <p className="taro-tag mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {TAG}
        </p>
      </div>

      {/* vartest switcher — graphic variants 1-9, 0 = 10, R replay */}
      <div className="fixed bottom-4 right-4 z-[110] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-2 shadow-lg">
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          {VARIANTS.map((o) => (
            <button
              key={o.n}
              onClick={() => replay(o.n)}
              title={`${o.label} — press ${o.n === 10 ? 0 : o.n}`}
              className={cn(
                'rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                variant === o.n ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {o.n === 10 ? 0 : o.n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] text-text-secondary">R replay · graphic 1–9, 0 = 10</p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
