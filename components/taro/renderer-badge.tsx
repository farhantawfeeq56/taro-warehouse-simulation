'use client';

import { RENDERER_MODE_LABELS, type RendererMode } from '@/lib/taro/renderer-mode';

/**
 * Temporary indicator showing which renderer variant is active.
 * Small, unobtrusive, top-center of the workspace. It is a plain badge
 * (pointer-events-none) so it never intercepts React Flow pan/zoom.
 */
export function RendererBadge({ mode }: { mode: RendererMode }) {
  const accent =
    mode === 'A' ? 'bg-slate-100 text-slate-700 border-slate-300'
    : mode === 'B' ? 'bg-sky-100 text-sky-700 border-sky-300'
    : 'bg-emerald-100 text-emerald-700 border-emerald-300';

  return (
    <div
      className={`pointer-events-none select-none absolute top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-medium shadow-sm ${accent}`}
    >
      <span className="font-mono font-bold">Renderer</span>
      <span className="font-mono font-black">{mode}</span>
      <span className="opacity-70">· {RENDERER_MODE_LABELS[mode]}</span>
    </div>
  );
}
