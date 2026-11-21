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
 * Variant rig (vartest): 10 transition styles in TRANSITIONS, switched from
 * the floating toolbar (bottom-right) or keys 1–9 / 0. The film keeps
 * looping; picking a variant replays the current screen's entrance with it.
 *
 * Transition design (wrapper-level keyframes, Web Animations API):
 * - Spatial model: the story moves forward, so most variants push left.
 *   The outgoing screen accelerates out (ease-in) while the incoming screen
 *   is staged off-canvas, holds, then decelerates in (ease-out-expo).
 * - Layered timing: opacity lands around 62% of the move while scale and
 *   blur keep settling to 100% — one gesture with a soft settle.
 * - The outgoing screen keeps its live DOM node through the whole exit.
 * - Build frames never flash: idle screens (/6, /3, /4) mount hidden ahead
 *   of time; auto-playing screens (/1 /2 /5 /7) mount fresh at reveal.
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

/* Video rail metadata — exact ranges + keyframe ticks for precise notes. */
const BEATS = ['/1 · Config', '/6 · Warehouses', '/2 · Simulate', '/3 · Routes', '/4 · Table → AI', '/5 · Generate', '/7 · Taro'];
const TICKS: Record<number, { t: number; label: string }[]> = {
  0: [{ t: 12.2, label: 'Generate press (CLICK_T) → cut @12.35' }],
  1: [
    { t: 1.2, label: 'ArrowRight → warehouse 2' },
    { t: 2.4, label: 'ArrowRight → warehouse 3' },
    { t: 3.6, label: 'ArrowRight → warehouse 4' },
  ],
  2: [{ t: 2.25, label: 'Simulate press → cut @2.4' }],
  3: [{ t: 0.2, label: 'R (auto) · run 3.0s' }],
  4: [{ t: 0.2, label: 'R (auto) · run 8.5s' }],
  5: [{ t: 2.25, label: 'Generate press → cut @2.4' }],
  6: [],
};
const STARTS: number[] = [];
let TOTAL = 0;
for (const d of DUR) {
  STARTS.push(TOTAL);
  TOTAL += d;
}
const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
};

const EXPO_OUT = 'cubic-bezier(.22,1,.36,1)';
const EASE_IN = 'cubic-bezier(.55,.06,.68,.19)';

interface Transition {
  name: string;
  enterKf: Keyframe[];
  enterDur: number;
  enterDelay: number;
  enterEase: string;
  exitKf: Keyframe[];
  exitDur: number;
  exitEase: string;
  hold: number;
}

const TRANSITIONS: Transition[] = [
  {
    name: 'Push left',
    enterKf: [
      { opacity: '0', transform: 'translateX(72px) scale(1.025)', filter: 'blur(6px)', offset: 0 },
      { opacity: '1', transform: 'translateX(0px) scale(1.008)', filter: 'blur(0px)', offset: 0.62 },
      { opacity: '1', transform: 'translateX(0px) scale(1)', filter: 'blur(0px)', offset: 1 },
    ],
    enterDur: 650, enterDelay: 90, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', transform: 'translateX(0px) scale(1)', filter: 'blur(0px)', offset: 0 },
      { opacity: '0', transform: 'translateX(-64px) scale(0.985)', filter: 'blur(3px)', offset: 1 },
    ],
    exitDur: 430, exitEase: EASE_IN, hold: 700,
  },
  {
    name: 'Push up',
    enterKf: [
      { opacity: '0', transform: 'translateY(64px) scale(1.02)', filter: 'blur(5px)', offset: 0 },
      { opacity: '1', transform: 'translateY(0px) scale(1.006)', filter: 'blur(0px)', offset: 0.62 },
      { opacity: '1', transform: 'translateY(0px) scale(1)', filter: 'blur(0px)', offset: 1 },
    ],
    enterDur: 650, enterDelay: 90, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', transform: 'translateY(0px) scale(1)', filter: 'blur(0px)', offset: 0 },
      { opacity: '0', transform: 'translateY(-56px) scale(0.985)', filter: 'blur(3px)', offset: 1 },
    ],
    exitDur: 430, exitEase: EASE_IN, hold: 700,
  },
  {
    name: 'Soft dissolve',
    enterKf: [
      { opacity: '0', transform: 'scale(1.03)', filter: 'blur(5px)', offset: 0 },
      { opacity: '1', transform: 'scale(1.006)', filter: 'blur(0px)', offset: 0.62 },
      { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)', offset: 1 },
    ],
    enterDur: 600, enterDelay: 60, enterEase: EXPO_OUT,
    exitKf: [{ opacity: '1', offset: 0 }, { opacity: '0', offset: 1 }],
    exitDur: 400, exitEase: 'ease-out', hold: 650,
  },
  {
    name: 'Swift slide',
    enterKf: [
      { opacity: '0', transform: 'translateX(220px)', offset: 0 },
      { opacity: '1', transform: 'translateX(0px)', offset: 1 },
    ],
    enterDur: 480, enterDelay: 60, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', transform: 'translateX(0px)', offset: 0 },
      { opacity: '0', transform: 'translateX(-160px)', offset: 1 },
    ],
    exitDur: 380, exitEase: EASE_IN, hold: 620,
  },
  {
    name: 'Dolly in',
    enterKf: [
      { opacity: '0', transform: 'translateY(24px) scale(0.93)', offset: 0 },
      { opacity: '1', transform: 'translateY(0px) scale(1.004)', offset: 0.62 },
      { opacity: '1', transform: 'translateY(0px) scale(1)', offset: 1 },
    ],
    enterDur: 600, enterDelay: 80, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', transform: 'scale(1)', offset: 0 },
      { opacity: '0', transform: 'scale(1.07)', offset: 1 },
    ],
    exitDur: 400, exitEase: EASE_IN, hold: 660,
  },
  {
    name: 'Pull back',
    enterKf: [
      { opacity: '0', transform: 'scale(1.06)', filter: 'blur(4px)', offset: 0 },
      { opacity: '1', transform: 'scale(1.008)', filter: 'blur(0px)', offset: 0.62 },
      { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)', offset: 1 },
    ],
    enterDur: 650, enterDelay: 90, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', transform: 'scale(1)', offset: 0 },
      { opacity: '0', transform: 'scale(0.92)', offset: 1 },
    ],
    exitDur: 450, exitEase: EASE_IN, hold: 700,
  },
  {
    name: 'Blur melt',
    enterKf: [
      { opacity: '0', transform: 'scale(1.01)', filter: 'blur(10px)', offset: 0 },
      { opacity: '1', transform: 'scale(1.002)', filter: 'blur(0px)', offset: 0.62 },
      { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)', offset: 1 },
    ],
    enterDur: 600, enterDelay: 70, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', filter: 'blur(0px)', offset: 0 },
      { opacity: '0', filter: 'blur(8px)', offset: 1 },
    ],
    exitDur: 500, exitEase: 'ease-in', hold: 700,
  },
  {
    name: 'Dip to black',
    enterKf: [
      { opacity: '0', transform: 'scale(1.015)', offset: 0 },
      { opacity: '1', transform: 'scale(1)', offset: 1 },
    ],
    enterDur: 500, enterDelay: 200, enterEase: EXPO_OUT,
    exitKf: [{ opacity: '1', offset: 0 }, { opacity: '0', offset: 1 }],
    exitDur: 200, exitEase: EASE_IN, hold: 760,
  },
  {
    name: 'Cover push',
    enterKf: [
      { opacity: '1', transform: 'translateX(100%)', offset: 0 },
      { opacity: '1', transform: 'translateX(0%)', offset: 1 },
    ],
    enterDur: 620, enterDelay: 0, enterEase: EXPO_OUT,
    exitKf: [
      { opacity: '1', offset: 0 },
      { opacity: '1', offset: 0.65 },
      { opacity: '0', offset: 1 },
    ],
    exitDur: 650, exitEase: 'linear', hold: 700,
  },
  {
    name: 'Hard cut',
    enterKf: [{ opacity: '1', offset: 0 }],
    enterDur: 1, enterDelay: 0, enterEase: 'linear',
    exitKf: [{ opacity: '0', offset: 0 }],
    exitDur: 1, exitEase: 'linear', hold: 60,
  },
];

export default function StageShow8() {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState<{ idx: number; key: string } | null>(null);
  const [leavingStep, setLeavingStep] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [variant, setVariant] = useState(0);
  const [chrome, setChrome] = useState(true);
  const nodes = useRef(new Map<string, HTMLElement>());
  const stepRef = useRef(step);
  stepRef.current = step;
  const mountRef = useRef(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const phase = step % 7;
  const cycle = Math.floor(step / 7);
  const t = TRANSITIONS[variant];

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
    setReduced(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, []);

  /* Release the outgoing node once its exit has played through. */
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), reduced ? 60 : t.hold);
    return () => window.clearTimeout(timer);
  }, [leaving, reduced, t]);

  /* Enter: staged off-canvas, holds, decelerates in with a settle. */
  useLayoutEffect(() => {
    if (reduced) return;
    nodes.current.get(`${cycle}-${phase}`)?.animate(t.enterKf, {
      duration: t.enterDur,
      delay: t.enterDelay,
      easing: t.enterEase,
      fill: 'both',
    });
  }, [step, phase, cycle, reduced, t]);

  /* Exit: accelerates out the moment the cut lands. */
  const leavingKey = leaving?.key;
  useLayoutEffect(() => {
    if (reduced || !leavingKey) return;
    const el = nodes.current.get(leavingKey);
    if (!el) {
      setLeaving(null);
      return;
    }
    el.animate(t.exitKf, {
      duration: t.exitDur,
      easing: t.exitEase,
      fill: 'both',
    });
  }, [leavingKey, reduced, t]);

  /* Variant picker: toolbar + keys 1–9, 0. Replays the current entrance. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      let idx = -1;
      if (k >= '1' && k <= '9') idx = Number(k) - 1;
      else if (k === '0') idx = 9;
      if (idx >= 0 && idx < TRANSITIONS.length) setVariant(idx);
      if (k === 'h' || k === 'H') setChrome((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Playhead + timecode — direct DOM writes, no re-renders. */
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const s = stepRef.current;
      const ph = s % 7;
      const tIn = Math.min(Math.max((now - mountRef.current) / 1000, 0), DUR[ph]);
      const el = STARTS[ph] + tIn;
      if (playheadRef.current) playheadRef.current.style.left = `${(el / TOTAL) * 100}%`;
      if (now - last > 120 && timecodeRef.current) {
        last = now;
        timecodeRef.current.textContent = `${fmt(el)} / ${fmt(TOTAL)} · ${BEATS[ph]}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (idx: number) => {
    const s = stepRef.current;
    let target = Math.floor(s / 7) * 7 + idx;
    if (target <= s) target += 7;
    setStep(target);
  };

  /* Drive each screen's own keys, then advance. Timed from reveal. */
  useEffect(() => {
    mountRef.current = performance.now();
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
      timers.forEach((timer) => window.clearTimeout(timer));
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

      {/* Video rail — beats, keyframe ticks, playhead, click-to-seek. */}
      {chrome && (
        <div className="fixed inset-x-4 bottom-4 z-[90]">
          <div className="rounded-2xl border border-border bg-card/95 px-3 pb-2.5 pt-2 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3 pb-1.5">
              <span ref={timecodeRef} className="text-[11px] font-semibold tabular-nums text-foreground">
                0:00.0 / {fmt(TOTAL)} · {BEATS[0]}
              </span>
              <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
                loop {cycle + 1} · T{variant + 1} {t.name} · click a beat to seek
              </span>
              <button
                onClick={() => setChrome(false)}
                title="Hide chrome (H)"
                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Hide (H)
              </button>
            </div>
            <div className="relative flex gap-[3px]">
              {BEATS.map((b, i) => {
                const on = i === phase;
                return (
                  <button
                    key={b}
                    onClick={() => seek(i)}
                    title={`${b} · ${fmt(STARTS[i])}–${fmt(STARTS[i] + DUR[i])}${(TICKS[i] ?? []).map((tk) => `\n@${fmt(tk.t)} ${tk.label}`).join('')}`}
                    className={`relative h-11 min-w-0 overflow-hidden rounded-lg border px-2 text-left transition-colors ${
                      on
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border hover:border-foreground/30 hover:bg-muted'
                    }`}
                    style={{ flexGrow: DUR[i], flexBasis: 0 }}
                  >
                    <span className="block truncate text-[11px] font-bold leading-tight text-foreground">
                      {b}
                    </span>
                    <span className="block text-[10px] tabular-nums leading-tight text-muted-foreground">
                      {fmt(STARTS[i])}–{fmt(STARTS[i] + DUR[i])}
                    </span>
                    {(TICKS[i] ?? []).map((tk) => (
                      <span
                        key={tk.t}
                        title={`@${fmt(tk.t)} ${tk.label}`}
                        className="absolute bottom-1 h-2 w-[2px] rounded-full bg-amber-500"
                        style={{ left: `${(tk.t / DUR[i]) * 100}%` }}
                      />
                    ))}
                  </button>
                );
              })}
              <div
                ref={playheadRef}
                aria-hidden
                className="pointer-events-none absolute -bottom-1 -top-1 w-[2px] rounded-full bg-primary"
                style={{ left: '0%' }}
              />
            </div>
          </div>
        </div>
      )}
      {!chrome && (
        <button
          onClick={() => setChrome(true)}
          title="Show chrome (H)"
          className="fixed bottom-4 right-4 z-[100] rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-xl backdrop-blur hover:text-foreground"
        >
          Rail (H)
        </button>
      )}

      {/* Variant toolbar — floating segmented control, bottom-right. */}
      {chrome && (
      <div className="fixed bottom-[118px] right-4 z-[100] rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Transition
          </span>
          <span className="max-w-[140px] truncate text-[11px] font-semibold text-foreground">
            {variant + 1} · {t.name}
          </span>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Transition variants">
          {TRANSITIONS.map((v, i) => {
            const label = i < 9 ? `${i + 1}` : '0';
            const on = i === variant;
            return (
              <button
                key={v.name}
                role="tab"
                aria-selected={on}
                title={`${label} · ${v.name}`}
                onClick={() => setVariant(i)}
                className={`h-8 w-8 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                  on
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
