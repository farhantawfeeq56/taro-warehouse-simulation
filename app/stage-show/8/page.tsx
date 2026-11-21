'use client';

/**
 * 8 — The ordered film, exactly as /animation/1–7 play.
 *
 * The original screens are rendered untouched (same components, same UI —
 * nothing restyled, no labels added). This page only swaps between them and
 * presses their own keys for them:
 *
 * /1 → (Generate press) → /6 → (arrows through all 4) → /2 → (Simulate
 * press) → /3 → (plays once) → /4 → (plays once) → /5 → (Generate press)
 * → /7 → loop.
 *
 * Cuts land inside the press frame: the button is seen going small, then
 * the next screen is already up — never waiting out the press animation.
 */

import { useEffect, useState } from 'react';
import A1 from '@/app/animation/1/page';
import A6 from '@/app/animation/6/page';
import A2 from '@/app/animation/2/page';
import A3 from '@/app/animation/3/page';
import A4 from '@/app/animation/4/page';
import A5 from '@/app/animation/5/page';
import A7 from '@/app/animation/7/page';

/* Mount → cut, in seconds. Press-frame cuts use each screen's own constants:
   /1 CLICK_T=12.2, /2 + /5 CLICK_T=2.25, /3 TOTAL=3 (plays once per R),
   /4 TOTAL=8.5 (plays once per R). */
const DUR = [12.35, 4.9, 2.4, 8.0, 9.3, 2.4, 3.2];

export default function StageShow8() {
  const [step, setStep] = useState(0);
  const phase = step % 7;
  const cycle = Math.floor(step / 7);

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
    // /3 and /4 play once per R: start them shortly after mount.
    if (phase === 3) press('r', 0.6);
    if (phase === 4) press('r', 0.4);
    timers.push(window.setTimeout(() => setStep((s) => s + 1), DUR[phase] * 1000));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {phase === 0 && <A1 key={`s8-1-${cycle}`} />}
      {phase === 1 && <A6 key={`s8-6-${cycle}`} />}
      {phase === 2 && <A2 key={`s8-2-${cycle}`} />}
      {phase === 3 && <A3 key={`s8-3-${cycle}`} />}
      {phase === 4 && <A4 key={`s8-4-${cycle}`} />}
      {phase === 5 && <A5 key={`s8-5-${cycle}`} />}
      {phase === 6 && <A7 key={`s8-7-${cycle}`} />}
    </div>
  );
}
