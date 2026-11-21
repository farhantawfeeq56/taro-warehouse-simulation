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
 * Transition design (wrapper-level keyframes, Web Animations API):
 * - Spatial model: the story moves forward, so screens push left. The
 *   outgoing screen accelerates out (ease-in, drifts -64px, settles back
 *   0.985 with a whisper of blur) while the incoming screen is already
 *   staged off-right.
 * - Stagger: the incoming screen holds 90ms, then decelerates in over
 *   650ms (ease-out-expo). Opacity lands at 62% of the move while scale
 *   and blur keep settling to 100% — layered timing, so the arrival reads
 *   as one gesture with a soft settle instead of a rigid fade.
 * - The outgoing screen keeps its live DOM node through the whole exit —
 *   nothing jumps or restarts mid-fade.
 * - Build frames never flash: the idle screens (/6 shells, /3 + /4 players)
 *   mount hidden ahead of time and dissolve in already complete.
 *   Auto-playing screens (/1 /2 /5 /7) always mount fresh at reveal so
 *   their clocks start on time.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: '0', transform: 'translateX(72px) scale(1.025)', filter: 'blur(6px)', offset: 0 },
  { opacity: '1', transform: 'translateX(0px) scale(1.008)', filter: 'blur(0px)', offset: 0.62 },
  { opacity: '1', transform: 'translateX(0px) scale(1)', filter: 'blur(0px)', offset: 1 },
];
const EXIT_KEYFRAMES: Keyframe[] = [
  { opacity: '1', transform: 'translateX(0px) scale(1)', filter: 'blur(0px)', offset: 0 },
  { opacity: '0', transform: 'translateX(-64px) scale(0.985)', filter: 'blur(3px)', offset: 1 },
];

export default function StageShow8() {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState<{ idx: number; key: string } | null>(null);
  const [leavingStep, setLeavingStep] = useState(0);
  const [reduced, setReduced] = useState(true);
  const nodes = useRef(new Map<string, HTMLElement>());
  const phase = step % 7;
  const cycle = Math.floor(step / 7);

  /* Retain the outgoing screen in the same commit as the cut, under its
     exact live key — otherwise its node unmounts before it can exit. */
  if (leavingStep !== step) {
    setLeavingStep(step);
    if (step > 0) {
      const prev = (step - 1) % 7;
      setLeaving({ idx: prev, key: `${Math.floor((step - 1) / 7)}-${prev}` });
    } else {
      setLeaving(null);
    }
  }

  useEffect(() => {
    setReduced(
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  /* Release the outgoing node once its exit has played through. */
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), reduced ? 60 : 700);
    return () => window.clearTimeout(t);
  }, [leaving, reduced]);

  /* Enter: staged off-right, holds 90ms, decelerates in with a settle. */
  useLayoutEffect(() => {
    if (reduced) return;
    nodes.current
      .get(`${cycle}-${phase}`)
      ?.animate(ENTER_KEYFRAMES, {
        duration: 650,
        delay: 90,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both',
      });
  }, [step, phase, cycle, reduced]);

  /* Exit: accelerates out left the moment the cut lands. */
  const leavingKey = leaving?.key;
  useLayoutEffect(() => {
    if (reduced || !leavingKey) return;
    nodes.current.get(leavingKey)?.animate(EXIT_KEYFRAMES, {
      duration: 430,
      easing: 'cubic-bezier(.55,.06,.68,.19)',
      fill: 'both',
    });
  }, [leavingKey, reduced]);

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
        const renderKey = isLeaving && leaving ? leaving.key : `${cycle}-${idx}`;
        return (
          <div
            key={renderKey}
            ref={(el) => {
              if (el) nodes.current.set(renderKey, el);
              else nodes.current.delete(renderKey);
            }}
            aria-hidden={!isVis}
            className="absolute inset-0"
            style={{
              zIndex: isVis ? 20 : isLeaving ? 10 : 0,
              opacity: reduced && isVis ? 1 : 0,
              visibility: isVis || isLeaving ? 'visible' : 'hidden',
              pointerEvents: isVis ? 'auto' : 'none',
            }}
          >
            <C />
          </div>
        );
      })}
    </div>
  );
}
