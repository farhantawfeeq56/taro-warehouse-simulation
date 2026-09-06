'use client';

import { useEffect, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { cn } from '@/lib/utils';

const WORD = ['T', 'a', 'r', 'o'];
const TAG = 'Warehouse Decision Lab';
const TILES = ['#D6A83D', '#8A70A8', '#5B8DB8', '#C87555'];
const OLIVE = '#4C5C2D';

function Tagline({ delay = 0 }: { delay?: number }) {
  return (
    <p
      className="taro-tag mt-4 text-[13px] font-medium uppercase tracking-[0.32em] text-text-secondary"
      style={{ animationDelay: `${delay}ms` }}
    >
      {TAG}
    </p>
  );
}

function Word({ delay = 0 }: { delay?: number }) {
  return (
    <div className="relative z-10 text-7xl font-bold tracking-tight text-text-primary sm:text-8xl" aria-label="Taro">
      {WORD.map((ch, i) => (
        <span key={i} className="taro-rise inline-block" style={{ animationDelay: `${delay + i * 70}ms` }}>
          {ch}
        </span>
      ))}
    </div>
  );
}

const VARIANTS = [
  { n: 1, label: 'Route' },
  { n: 2, label: 'Racks' },
  { n: 3, label: 'Boxes' },
  { n: 4, label: 'Ping' },
  { n: 5, label: 'Aisle' },
  { n: 6, label: 'Wave' },
  { n: 7, label: 'Float' },
  { n: 8, label: 'Crossline' },
  { n: 9, label: 'Affinity' },
  { n: 10, label: 'Scene' },
] as const;

function Stage({ variant }: { variant: number }) {
  switch (variant) {
    case 1:
      return (
        <div className="text-center">
          <Word />
          <svg viewBox="0 0 300 40" className="mx-auto -mt-2 w-[300px] max-w-[80vw]" aria-hidden>
            <path id="taro-route" d="M8 28 C 70 28, 90 8, 150 12 S 240 30, 292 10" fill="none" stroke={OLIVE} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="340" strokeDashoffset="340" className="taro-draw" />
            <circle r="5" fill={OLIVE}>
              <animateMotion dur="1.5s" begin="0.2s" fill="freeze" path="M8 28 C 70 28, 90 8, 150 12 S 240 30, 292 10" />
            </circle>
          </svg>
          <Tagline delay={1200} />
        </div>
      );
    case 2:
      return (
        <div className="relative px-8 text-center">
          <div className="pointer-events-none absolute inset-x-4 bottom-0 top-2 flex items-end justify-center gap-2 opacity-25" aria-hidden>
            {[56, 84, 66, 96, 72, 90, 60, 78].map((h, i) => (
              <span key={i} className="taro-rack w-6 rounded-t-sm" style={{ height: h, backgroundColor: OLIVE, animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
          <Word delay={200} />
          <Tagline delay={1200} />
        </div>
      );
    case 3:
      return (
        <div className="relative text-center">
          {[
            { l: '6%', t: '10%', d: 0, c: TILES[0] },
            { l: '88%', t: '6%', d: 120, c: TILES[1] },
            { l: '12%', t: '72%', d: 240, c: TILES[2] },
            { l: '82%', t: '70%', d: 360, c: TILES[3] },
            { l: '48%', t: '-4%', d: 480, c: OLIVE },
          ].map((b, i) => (
            <span
              key={i}
              className="taro-drop absolute h-5 w-5 rounded-[4px]"
              style={{ left: b.l, top: b.t, backgroundColor: b.c, animationDelay: `${b.d}ms` }}
              aria-hidden
            />
          ))}
          <Word delay={150} />
          <Tagline delay={1300} />
        </div>
      );
    case 4:
      return (
        <div className="relative text-center">
          <span className="taro-ping absolute right-[8%] top-[30%] h-10 w-10 rounded-full border-2" style={{ borderColor: OLIVE }} aria-hidden />
          <span className="taro-ping absolute right-[8%] top-[30%] h-10 w-10 rounded-full border-2" style={{ borderColor: OLIVE, animationDelay: '450ms' }} aria-hidden />
          <Word />
          <Tagline delay={1100} />
        </div>
      );
    case 5:
      return (
        <div className="relative overflow-hidden px-10 py-4 text-center">
          <span className="taro-aisle pointer-events-none absolute inset-y-0 w-10" aria-hidden />
          <Word delay={350} />
          <Tagline delay={1300} />
        </div>
      );
    case 6: {
      const dots = [];
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 9; x++)
          dots.push(
            <span
              key={`${x}-${y}`}
              className="taro-wavepop h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: OLIVE, animationDelay: `${(x + y) * 70}ms` }}
            />
          );
      return (
        <div className="relative px-6 text-center">
          <div className="pointer-events-none absolute inset-0 grid grid-cols-9 content-center justify-items-center gap-3 opacity-30" aria-hidden>
            {dots}
          </div>
          <Word delay={250} />
          <Tagline delay={1400} />
        </div>
      );
    }
    case 7:
      return (
        <div className="relative text-center">
          {[
            { l: '18%', d: 0, s: 12 },
            { l: '32%', d: 200, s: 9 },
            { l: '55%', d: 100, s: 13 },
            { l: '70%', d: 300, s: 10 },
            { l: '82%', d: 150, s: 12 },
          ].map((p, i) => (
            <span
              key={i}
              className="taro-float absolute bottom-0 rounded-[3px]"
              style={{ left: p.l, width: p.s, height: p.s, backgroundColor: TILES[i % TILES.length], animationDelay: `${p.d}ms` }}
              aria-hidden
            />
          ))}
          <Word />
          <Tagline delay={1200} />
        </div>
      );
    case 8:
      return (
        <div className="relative px-8 text-center">
          <span className="taro-crossline absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ backgroundColor: OLIVE }} aria-hidden />
          <Word delay={300} />
          <Tagline delay={1200} />
        </div>
      );
    case 9:
      return (
        <div className="relative px-10 text-center">
          {[
            { l: '2%', t: '20%', c: TILES[0], d: 500 },
            { l: '10%', t: '68%', c: TILES[1], d: 620 },
            { l: '90%', t: '24%', c: TILES[2], d: 560 },
            { l: '94%', t: '66%', c: TILES[3], d: 680 },
            { l: '26%', t: '2%', c: TILES[1], d: 740 },
            { l: '70%', t: '90%', c: TILES[0], d: 800 },
          ].map((d, i) => (
            <span
              key={i}
              className="taro-pop absolute h-3.5 w-3.5 rounded-full"
              style={{ left: d.l, top: d.t, backgroundColor: d.c, animationDelay: `${d.d}ms` }}
              aria-hidden
            />
          ))}
          <Word />
          <Tagline delay={1300} />
        </div>
      );
    default:
      return (
        <div className="text-center">
          <svg viewBox="0 0 260 74" className="mx-auto w-[260px] max-w-[70vw]" aria-hidden>
            {[14, 52, 90, 128, 166, 204].map((x, i) => (
              <rect key={i} x={x} y={10} width={26} height={40} rx={3} fill="#111" opacity={0.85} className="taro-scene" style={{ animationDelay: `${i * 90}ms` }} />
            ))}
            <path d="M6 64 H254" stroke={OLIVE} strokeWidth="3" strokeLinecap="round" strokeDasharray="260" strokeDashoffset="260" className="taro-drawscene" />
            <circle r="5" fill={OLIVE}>
              <animateMotion dur="1.2s" begin="0.9s" fill="freeze" path="M6 64 H254" />
            </circle>
          </svg>
          <div className="taro-rise" style={{ animationDelay: '700ms', opacity: 0 }}>
            <Word />
          </div>
          <Tagline delay={1500} />
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
        @keyframes taro-rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        .taro-rise { opacity: 0; animation: taro-rise 0.7s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes taro-tag { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .taro-tag { opacity: 0; animation: taro-tag 0.6s ease-out forwards; }
        @keyframes taro-drawline { to { stroke-dashoffset: 0; } }
        .taro-draw { animation: taro-drawline 1.4s ease-in-out 0.2s forwards; }
        .taro-drawscene { animation: taro-drawline 0.9s ease-in-out 0.5s forwards; }
        @keyframes taro-rack { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .taro-rack { transform-origin: bottom center; transform: scaleY(0); animation: taro-rack 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes taro-drop { 0% { opacity: 0; transform: translateY(-26px); } 60% { opacity: 1; transform: translateY(3px); } 100% { opacity: 1; transform: none; } }
        .taro-drop { opacity: 0; animation: taro-drop 0.7s cubic-bezier(0.2,0.9,0.3,1) forwards; }
        @keyframes taro-ping { 0% { opacity: 0.7; transform: scale(0.4); } 100% { opacity: 0; transform: scale(2.2); } }
        .taro-ping { opacity: 0; animation: taro-ping 1.3s ease-out 0.5s forwards; }
        @keyframes taro-aisle { 0% { left: -15%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: 105%; opacity: 0; } }
        .taro-aisle { background: linear-gradient(90deg, transparent, rgba(76,92,45,0.28), transparent); animation: taro-aisle 1.4s ease-in-out 0.2s forwards; }
        @keyframes taro-wavepop { 0% { opacity: 0; transform: scale(0.3); } 40% { opacity: 1; transform: scale(1.25); } 100% { opacity: 0.9; transform: scale(1); } }
        .taro-wavepop { opacity: 0; animation: taro-wavepop 0.7s ease-out forwards; }
        @keyframes taro-float { 0% { opacity: 0; transform: translateY(24px); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-46px); } }
        .taro-float { opacity: 0; animation: taro-float 1.8s ease-out forwards; }
        @keyframes taro-crossline { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .taro-crossline { transform: scaleX(0); animation: taro-crossline 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s forwards; }
        @keyframes taro-pop { 0% { opacity: 0; transform: scale(0); } 70% { opacity: 1; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
        .taro-pop { opacity: 0; animation: taro-pop 0.5s ease-out forwards; }
        @keyframes taro-scenein { from { opacity: 0; } to { opacity: 0.85; } }
        .taro-scene { opacity: 0; animation: taro-scenein 0.4s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .taro-rise, .taro-tag, .taro-draw, .taro-drawscene, .taro-rack, .taro-drop,
          .taro-ping, .taro-aisle, .taro-wavepop, .taro-float, .taro-crossline,
          .taro-pop, .taro-scene { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>

      <div key={`${variant}-${runId}`}>
        <Stage variant={variant} />
      </div>

      {/* vartest switcher — keys 1-9, 0 = 10, R replay */}
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
        <p className="mt-1 text-center text-[11px] text-text-secondary">R replay · 1–9, 0 = 10</p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
