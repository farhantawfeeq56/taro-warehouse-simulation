'use client';

import { useEffect, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';

const WORD = ['T', 'a', 'r', 'o'];

export default function Animation7Page() {
  const [runId, setRunId] = useState(0);

  // R replays. Nothing else ever starts it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') setRunId((id) => id + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <style>{`
        @keyframes taro-settle { 0% { opacity: 0; transform: translateY(-36px); } 60% { opacity: 1; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
        @keyframes taro-out { to { opacity: 0; transform: translateY(-26px); } }
        .taro-settle { opacity: 0; animation: taro-settle 0.85s cubic-bezier(0.2,0.9,0.3,1) forwards, taro-out 0.55s ease-in forwards; }
        @keyframes taro-tag { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes taro-tagout { to { opacity: 0; transform: translateY(-8px); } }
        .taro-tag { opacity: 0; animation: taro-tag 0.6s ease-out 0.6s forwards, taro-tagout 0.5s ease-in 2.8s forwards; }
        @media (prefers-reduced-motion: reduce) {
          .taro-settle, .taro-tag { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>

      <div key={runId} className="text-center">
        <div className="text-7xl font-bold tracking-tight text-foreground sm:text-8xl" aria-label="Taro">
          {WORD.map((ch, i) => (
            <span key={i} className="taro-settle inline-block" style={{ animationDelay: `${i * 75}ms, ${3000 + i * 70}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="taro-tag mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Warehouse Decision Lab
        </p>
      </div>

      <AgentationToolbar
        enabled={process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'}
      />
    </div>
  );
}
