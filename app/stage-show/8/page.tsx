'use client';

/**
 * 8 — The ordered film, exactly as /animation/1–7 play.
 *
 * The original screens are rendered untouched (same components, same UI —
 * nothing restyled, no labels added). This page only choreographs them:
 *
 * /1 → (Generate press) → /6 → (arrows through all 4) → /2 → (Simulate
 * press) → /3 → (plays once) → /4 → (plays once) → /5 → (Generate press)
 * → /7 → loop.
 *
 * Two things keep it smooth instead of rigid:
 * - Cuts land inside the press frame (the button is seen going small, then
 *   the next screen is already dissolving in) with a ~650ms cross-dissolve,
 *   never a hard snap. The outgoing screen keeps its live DOM node while it
 *   fades, so nothing jumps or restarts mid-fade.
 * - The next idle screen (the /6 shells, /3 and /4 players) mounts hidden
 *   ahead of time, so its "Preparing…" / empty build frame never flashes —
 *   it dissolves in already complete. Auto-playing screens (/1 /2 /5 /7)
 *   always mount fresh at reveal so their clocks start on time.
 */

import { useEffect, useState } from 'react';
import A1 from '@/app/animation/1/page';
import A6 from '@/app/animation/6/page';
import A2 from '@/app/animation/2/page';
import A3 from '@/app/animation/3/page';
import A4 from '@/app/animation/4/page';
import A5 from '@/app/animation/5/page';
import A7 from '@/app/animation/7/page';

/* Reveal → cut, in seconds. Press-frame cuts use each screen's own constants:
   /1 CLICK_T=12.2, /2 + /5 CLICK_T=2.25, /3 TOTAL=3, /4 TOTAL=8.5. */
const DUR = [12.35, 4.9, 2.4, 4.2, 9.3, 2.4, 3.2];

/* Idle-until-triggered screens to keep mounted (hidden) while visible. */
const WARM: Record<number, number[]> = { 0: [1], 1: [3], 2: [3], 3: [4] };

const SCREENS = [A1, A6, A2, A3, A4, A5, A7];

export default function StageShow8() {
  const [step, setStep] = useState(0);
  /* Outgoing screen + the exact key its live instance was mounted with. */
  const [leaving, setLeaving] = useState<{ idx: number; key: string } | null>(null);
  const phase = step % 7;
  const cycle = Math.floor(step / 7);

  /* Dissolve the outgoing screen over the incoming one. */
  useEffect(() => {
    if (step === 0) return;
    const prev = (step - 1) % 7;
    if (prev === phase) return;
    setLeaving({ idx: prev, key: `${Math.floor((step - 1) / 7)}-${prev}` });
    const t = window.setTimeout(() => setLeaving(null), 650);
    return () => window.clearTimeout(t);
  }, [step, phase]);

  /* Drive each screen's own keys, then advance. Timed from reveal. */
  useEffect(() => {
    const timers: number[] = [];
    const press = (key: string, at: number) => {
      timers.push(
        window.setTimeout(
          () => window.dispatchEvent(new KeyboardEvent('keydown', { key })),
          at * 1000,
        ),
      );
    };
    // /6 is arrow-driven: walk through all four warehouses, then cut.
    if (phase === 1) {
      press('ArrowRight', 1.2);
      press('ArrowRight', 2.4);
      press('ArrowRight', 3.6);
    }
    // /3 and /4 play once per R: their builds finished while hidden.
    if (phase === 3) press('r', 0.2);
    if (phase === 4) press('r', 0.2);
    timers.push(window.setTimeout(() => setStep((s) => s + 1), DUR[phase] * 1000));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [step, phase]);

  const warm = WARM[phase] ?? [];

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
        const isVis = idx === phase;
        const isWarm = warm.includes(idx);
        const isLeaving = leaving?.idx === idx;
        if (!isVis && !isWarm && !isLeaving) return null;
        const C = SCREENS[idx];
        return (
          <div
            key={isLeaving && leaving ? leaving.key : `${cycle}-${idx}`}
            aria-hidden={!isVis}
            style={{ zIndex: isVis ? 20 : isLeaving ? 10 : 0 }}
            className={`absolute inset-0 transition-[opacity,transform] ease-out ${
              isVis
                ? 'scale-100 opacity-100 duration-700'
                : isLeaving
                  ? 'pointer-events-none scale-[1.01] opacity-0 duration-500'
                  : 'invisible pointer-events-none scale-[1.015] opacity-0'
            }`}
          >
            <C />
          </div>
        );
      })}
    </div>
  );
}
