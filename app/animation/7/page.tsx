'use client';

import { useEffect, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { cn } from '@/lib/utils';

const WORD = ['T', 'a', 'r', 'o'];
const TAG = 'Warehouse Decision Lab';

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

const VARIANTS = [
  { n: 1, label: 'Rise' },
  { n: 2, label: 'Draw' },
  { n: 3, label: 'Tracking' },
  { n: 4, label: 'Deblur' },
  { n: 5, label: 'Mask' },
  { n: 6, label: 'Settle' },
  { n: 7, label: 'Sheen' },
  { n: 8, label: 'Flip' },
  { n: 9, label: 'Rule' },
  { n: 10, label: 'Grid' },
] as const;

function Stage({ variant }: { variant: number }) {
  if (variant === 2) {
    return (
      <div className="text-center">
        <svg viewBox="0 0 320 120" className="mx-auto w-[320px] max-w-[80vw]" aria-label="Taro">
          <text
            x="160"
            y="88"
            textAnchor="middle"
            className="taro-draw-stroke"
            fontSize="92"
            fontWeight={700}
            letterSpacing="-2"
          >
            Taro
          </text>
          <text
            x="160"
            y="88"
            textAnchor="middle"
            className="taro-draw-fill"
            fontSize="92"
            fontWeight={700}
            letterSpacing="-2"
          >
            Taro
          </text>
        </svg>
        <Tagline delay={1400} />
      </div>
    );
  }

  if (variant === 10) {
    const from = [
      '-90px,-70px',
      '110px,-60px',
      '-100px,80px',
      '95px,75px',
    ];
    return (
      <div className="taro-grid-bg relative px-10 py-8 text-center">
        <div className="text-7xl font-bold tracking-tight text-text-primary sm:text-8xl" aria-label="Taro">
          {WORD.map((ch, i) => (
            <span
              key={i}
              className="taro-grid-letter inline-block"
              style={{ ['--gx' as string]: from[i], animationDelay: `${150 + i * 90}ms` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <Tagline delay={1100} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <div
        className={cn(
          'text-7xl font-bold tracking-tight text-text-primary sm:text-8xl',
          variant === 3 && 'taro-track',
          variant === 8 && 'taro-flip-row',
        )}
        aria-label="Taro"
      >
        {WORD.map((ch, i) => (
          <span
            key={i}
            className={cn(
              'inline-block',
              variant === 1 && 'taro-rise',
              variant === 3 && 'taro-track-letter',
              variant === 4 && 'taro-deblur',
              variant === 6 && 'taro-settle',
              variant === 7 && 'taro-sheen-letter',
              variant === 8 && 'taro-flip',
              variant === 9 && 'taro-rule-word',
            )}
            style={{ animationDelay: `${i * (variant === 8 ? 110 : 75)}ms` }}
          >
            {variant === 5 ? (
              <span className="taro-mask block overflow-hidden">
                <span className="taro-mask-inner block" style={{ animationDelay: `${i * 75}ms` }}>
                  {ch}
                </span>
              </span>
            ) : (
              ch
            )}
          </span>
        ))}
      </div>
      {variant === 7 && (
        <style>{`.taro-sheen-letter { background: linear-gradient(100deg, #111 42%, #7a8a4d 50%, #111 58%); background-size: 230% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; }`}</style>
      )}
      {variant === 9 && <div className="taro-rule mx-auto mt-3 h-[3px] w-40 rounded-full bg-primary" />}
      <Tagline delay={variant === 9 ? 700 : 600} />
    </div>
  );
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
        @keyframes taro-stroke { to { stroke-dashoffset: 0; } }
        .taro-draw-stroke { fill: none; stroke: #111; stroke-width: 2; stroke-dasharray: 420; stroke-dashoffset: 420; animation: taro-stroke 1.3s ease-in-out forwards; font-family: inherit; }
        @keyframes taro-fillin { to { opacity: 1; } }
        .taro-draw-fill { fill: #111; opacity: 0; animation: taro-fillin 0.6s ease-out 1.0s forwards; font-family: inherit; }
        @keyframes taro-track { from { letter-spacing: 0.28em; } to { letter-spacing: -0.02em; } }
        .taro-track { animation: taro-track 1.1s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes taro-track-letter { from { opacity: 0; } to { opacity: 1; } }
        .taro-track-letter { opacity: 0; animation: taro-track-letter 0.5s ease-out forwards; }
        @keyframes taro-deblur { from { opacity: 0; filter: blur(14px); } to { opacity: 1; filter: blur(0); } }
        .taro-deblur { opacity: 0; animation: taro-deblur 0.8s ease-out forwards; }
        @keyframes taro-maskin { from { transform: translateY(112%); } to { transform: none; } }
        .taro-mask-inner { animation: taro-maskin 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes taro-settle { 0% { opacity: 0; transform: translateY(-36px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
        .taro-settle { opacity: 0; animation: taro-settle 0.85s cubic-bezier(0.2,0.9,0.3,1) forwards; }
        @keyframes taro-sheen { from { opacity: 0; } to { opacity: 1; } }
        .taro-sheen-letter { opacity: 0; animation: taro-sheen 0.4s ease-out forwards; }
        @keyframes taro-sheenmove { 0% { background-position: 115% 0; } 100% { background-position: -25% 0; } }
        .taro-sheen-letter { animation: taro-sheen 0.4s ease-out forwards, taro-sheenmove 1.4s ease-in-out 0.5s forwards; }
        .taro-flip-row { perspective: 500px; }
        @keyframes taro-flip { from { opacity: 0; transform: rotateX(88deg); } to { opacity: 1; transform: none; } }
        .taro-flip { opacity: 0; transform-origin: 50% 100%; animation: taro-flip 0.7s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes taro-ruleword { from { opacity: 0; } to { opacity: 1; } }
        .taro-rule-word { opacity: 0; animation: taro-ruleword 0.5s ease-out forwards; }
        @keyframes taro-rule { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .taro-rule { transform-origin: left center; animation: taro-rule 0.7s cubic-bezier(0.22,1,0.36,1) 0.35s both; }
        .taro-grid-bg { background-image: radial-gradient(rgba(17,17,17,0.14) 1px, transparent 1px); background-size: 22px 22px; border-radius: 1rem; }
        @keyframes taro-gridin { from { opacity: 0; transform: translate(var(--gx)); } to { opacity: 1; transform: none; } }
        .taro-grid-letter { opacity: 0; animation: taro-gridin 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .taro-rise, .taro-tag, .taro-draw-stroke, .taro-draw-fill, .taro-track,
          .taro-track-letter, .taro-deblur, .taro-mask-inner, .taro-settle,
          .taro-sheen-letter, .taro-flip, .taro-rule-word, .taro-rule, .taro-grid-letter {
            animation-duration: 0.01s !important; animation-delay: 0s !important;
          }
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
