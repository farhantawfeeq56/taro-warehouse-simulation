'use client';

import { useEffect, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { cn } from '@/lib/utils';

const WORD = ['T', 'a', 'r', 'o'];
const TAG = 'Warehouse Decision Lab';

const VARIANTS = [
  { n: 1, label: 'Reverse' },
  { n: 2, label: 'Mark' },
  { n: 3, label: 'Breath' },
  { n: 4, label: 'Blinds' },
  { n: 5, label: 'Flatten' },
  { n: 6, label: 'Pull' },
  { n: 7, label: 'Coil' },
  { n: 8, label: 'Close' },
  { n: 9, label: 'Dust' },
  { n: 10, label: 'Sweep' },
] as const;

/* Outro start (ms) and per-letter out-delays per variant. */
const OUT = 3000;
const STAGGERS: Record<number, number[]> = {
  1: [225, 150, 75, 0],
  2: [0, 55, 110, 165],
  3: [0, 60, 120, 180],
  4: [0, 60, 120, 180],
  5: [0, 55, 110, 165],
  6: [0, 55, 110, 165],
  7: [0, 70, 140, 210],
  8: [0, 0, 0, 0],
  9: [0, 55, 110, 165],
  10: [0, 55, 110, 165],
};
/* When the tagline leaves (before letters, or after, per variant). */
const TAG_OUT: Record<number, number> = {
  1: -250,
  2: -350,
  3: -250,
  4: -250,
  5: 350,
  6: -250,
  7: -300,
  8: 200,
  9: -350,
  10: -300,
};

function OutroExtras({ variant }: { variant: number }) {
  if (variant === 2)
    return (
      <span
        aria-hidden
        className="o2-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
    );
  if (variant === 5)
    return <span aria-hidden className="o5-rule mx-auto mt-6 block h-px w-44 bg-border" />;
  if (variant === 8)
    return <span aria-hidden className="o8-rule mx-auto mt-2 block h-[2px] w-44 rounded-full bg-foreground/25" />;
  if (variant === 9)
    return (
      <span aria-hidden className="absolute inset-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="o9-dust absolute h-1 w-1 rounded-full bg-muted-foreground/70" style={{ ['--dx' as string]: `${(i % 4) * 2 - 3 + (i > 3 ? 0.4 : 0)}`, ['--dy' as string]: `${Math.floor(i / 4) * 2 - 1}` }} />
        ))}
      </span>
    );
  if (variant === 10)
    return <span aria-hidden className="o10-band pointer-events-none absolute inset-y-0 w-24" />;
  return null;
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

  const stag = STAGGERS[variant];
  const tagDel = OUT + (TAG_OUT[variant] ?? -250);

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <style>{`
        @keyframes taro-settle { 0% { opacity: 0; transform: translateY(-36px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
        @keyframes taro-tag { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes taro-tagout { to { opacity: 0; transform: translateY(-6px); } }

        /* ── Outro treatments ── */
        @keyframes o1 { to { opacity: 0; transform: translateY(-22px); } }
        @keyframes o2 { to { opacity: 0; transform: translateY(-14px) scale(0.9); } }
        @keyframes o3 { to { opacity: 0; transform: translateX(var(--ox, -16px)); } }
        @keyframes o4 { to { opacity: 0; transform: translateY(18px); } }
        @keyframes o5 { to { opacity: 0; transform: scaleY(0.03); } }
        @keyframes o6 { to { opacity: 0; filter: blur(7px); transform: translateY(-16px); } }
        @keyframes o7 { to { opacity: 0; transform: translate(-50%, 22px) scale(0.3); } }
        @keyframes o8 { to { opacity: 0; transform: none; } }
        @keyframes o9 { to { opacity: 0; transform: translateY(-10px) scale(0.8); } }
        @keyframes o10 { to { opacity: 0; } }

        .taro-letter { display: inline-block; opacity: 0; }
        .ov1 .taro-letter { animation-name: taro-settle, o1; animation-duration: 0.85s, 0.55s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in; animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov2 .taro-letter { animation-name: taro-settle, o2; animation-duration: 0.85s, 0.5s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), cubic-bezier(0.5,0,0.75,0); animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov3 .taro-letter { animation-name: taro-settle, o3; animation-duration: 0.85s, 0.6s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in-out; animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov4 .taro-letter { animation-name: taro-settle, o4; animation-duration: 0.85s, 0.6s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), cubic-bezier(0.7,0,0.9,0); animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov5 .taro-letter { animation-name: taro-settle, o5; animation-duration: 0.85s, 0.55s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in; animation-delay: var(--id), var(--od); animation-fill-mode: both; transform-origin: 50% 100%; }
        .ov6 .taro-letter { animation-name: taro-settle, o6; animation-duration: 0.85s, 0.7s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in; animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov7 .taro-letter { animation-name: taro-settle, o7; animation-duration: 0.85s, 0.65s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), cubic-bezier(0.6,0,1,0.4); animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov8 .taro-letter { animation-name: taro-settle, o8; animation-duration: 0.85s, 0.7s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease; animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov9 .taro-letter { animation-name: taro-settle, o9; animation-duration: 0.85s, 0.5s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in; animation-delay: var(--id), var(--od); animation-fill-mode: both; }
        .ov10 .taro-letter { animation-name: taro-settle, o10; animation-duration: 0.85s, 0.7s; animation-timing-function: cubic-bezier(0.2,0.9,0.3,1), ease-in-out; animation-delay: var(--id), var(--od); animation-fill-mode: both; }

        .taro-tag { opacity: 0; animation-name: taro-tag, taro-tagout; animation-duration: 0.6s, 0.45s; animation-timing-function: cubic-bezier(0.22,1,0.36,1), ease-in; animation-delay: 0.6s, var(--tagd); animation-fill-mode: both; }

        /* v2 — a single mark settles where the word was. */
        @keyframes o2dot { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); } 55% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes o2dotout { to { opacity: 0; transform: translate(-50%, -50%) scale(0.7); } }
        .o2-dot { background: var(--foreground); animation-name: o2dot, o2dotout; animation-duration: 0.6s, 0.7s; animation-timing-function: cubic-bezier(0.22,1,0.36,1), ease-in; animation-delay: var(--tagd), calc(var(--tagd) + 1400ms); animation-fill-mode: both; }

        /* v5 — the baseline holds a beat then goes. */
        @keyframes o5rule { from { opacity: 0; } to { opacity: 1; } }
        @keyframes o5ruleout { to { opacity: 0; } }
        .o5-rule { opacity: 0; animation-name: o5rule, o5ruleout; animation-duration: 0.4s, 0.5s; animation-timing-function: ease-out, ease-in; animation-delay: 500ms, var(--tagd); animation-fill-mode: both; }

        /* v8 — a closing rule draws beneath, then everything dims out. */
        @keyframes o8rule { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .o8-rule { transform: scaleX(0); transform-origin: center; animation: o8rule 0.6s cubic-bezier(0.22,1,0.36,1) 0.4s both; }

        /* v9 — letters crumble into fine dust. */
        .o9-dust { left: 50%; top: 50%; opacity: 0; animation-name: o9dust; animation-duration: 0.9s; animation-timing-function: ease-out; animation-delay: calc(var(--tagd) + 150ms); animation-fill-mode: both; }
        @keyframes o9dust { 0% { opacity: 0; transform: translate(calc(-50% + var(--dx) * 22px), -50%) scale(0.2); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx) * 60px), calc(-50% + var(--dy) * 30px)) scale(0.4); } }

        /* v10 — a soft aisle sweeps the scene clear. */
        @keyframes o10band { 0% { left: -20%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { left: 120%; opacity: 0; } }
        .o10-band { background: linear-gradient(90deg, transparent, rgba(127,127,127,0.16), transparent); animation: o10band 1.1s cubic-bezier(0.4,0,0.2,1) var(--tagd) both; }

        @media (prefers-reduced-motion: reduce) {
          .taro-letter, .taro-tag, .o2-dot, .o5-rule, .o8-rule, .o9-dust, .o10-band { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>

      <div key={`${runId}-${variant}`} className="relative text-center">
        <div className={cn('ov', `ov${variant}`)}>
          <div className="text-7xl font-bold tracking-tight text-foreground sm:text-8xl" aria-label="Taro">
            {WORD.map((ch, i) => (
              <span
                key={i}
                className="taro-letter"
                style={{
                  ['--id' as string]: `${i * 75}ms`,
                  ['--od' as string]: `${OUT + stag[i]}ms`,
                  ...(variant === 3 ? { ['--ox' as string]: i < 2 ? '-34px' : '34px' } : {}),
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          <OutroExtras variant={variant} />
          <p className="taro-tag mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground" style={{ ['--tagd' as string]: `${tagDel}ms` }}>
            {TAG}
          </p>
        </div>
      </div>

      {/* vartest switcher — outro variants 1-9, 0 = 10, R replay */}
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
        <p className="mt-1 text-center text-[11px] text-text-secondary">R replay · outro 1–9, 0 = 10</p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
