'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { AgentationToolbar } from '@/components/agentation';

/* ── Easing ─────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/* ── Timeline (seconds, loops) ──────────────────────────── */
const TOTAL = 9;
const FLY_T0 = 1.2;
const FLY_T1 = 2.2;
const CLICK_T = 2.25;
const SIM_T1 = 4.5;
const DONE_T1 = 5.5;
const HOP_T0 = 5.7;
const HOP_T1 = 6.3;
const OUT_T0 = 6.4;

const BURST = 8;

export default function Animation2Page() {
  const [time, setTime] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const clickRef = useRef({ x: 130, y: 18 });

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTime(TOTAL);
      return;
    }
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      const wrap = wrapRef.current;
      const btn = buttonRef.current;
      if (wrap && btn) {
        const wb = wrap.getBoundingClientRect();
        const bb = btn.getBoundingClientRect();
        clickRef.current = {
          x: bb.left + bb.width / 2 - wb.left,
          y: bb.top + bb.height / 2 - wb.top,
        };
      }
      setTime((t) => {
        const nt = t + dt;
        return nt >= TOTAL ? nt - TOTAL : nt;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      last.current = null;
    };
  }, []);

  const click = clickRef.current;

  /* Cursor flight — overshoot ease, lands with a wobble. */
  const flyRaw = clamp01((time - FLY_T0) / (FLY_T1 - FLY_T0));
  const fly = easeOutBack(flyRaw);
  const cursorOpacity =
    time < FLY_T0 + 0.15
      ? clamp01((time - FLY_T0) / 0.15)
      : time < OUT_T0
        ? 1
        : Math.max(0, 1 - (time - OUT_T0) / (TOTAL - OUT_T0));
  const hopP = clamp01((time - HOP_T0) / (HOP_T1 - HOP_T0));
  const hopY = -Math.sin(hopP * Math.PI) * 22;
  const outDrift = time >= OUT_T0 ? (time - OUT_T0) * 60 : 0;
  const cursorDX = 180 * (1 - fly) + outDrift;
  const cursorDY = 150 * (1 - fly) + hopY - outDrift * 0.4;
  const wiggle =
    flyRaw < 1 ? 9 * Math.sin((time - FLY_T0) * 14) * (1 - flyRaw) : 0;

  /* Button states. */
  const simulating = time >= CLICK_T + 0.25 && time < SIM_T1;
  const done = time >= SIM_T1 && time < DONE_T1;
  const pressing = time >= CLICK_T && time < CLICK_T + 0.3;
  const burstP = easeOutCubic(clamp01((time - CLICK_T) / 0.7));

  // Jelly wobble after the press.
  const wobT = time - (CLICK_T + 0.25);
  const wob =
    wobT > 0 && wobT < 1.2
      ? Math.sin(wobT * 18) * Math.exp(-wobT * 5)
      : 0;
  const squashX = (pressing ? 1.06 : 1) + wob * 0.04;
  const squashY = (pressing ? 0.9 : 1) - wob * 0.04;

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div ref={wrapRef} className="relative w-[260px]">
        {/* The green Simulate button, as in the simulation tab. */}
        <div
          ref={buttonRef}
          style={{ transform: `scale(${squashX}, ${squashY})` }}
          className={`inline-flex h-9 w-full select-none items-center justify-center gap-1.5 rounded-md border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-[filter] duration-150 ${
            pressing ? 'brightness-90' : ''
          }`}
        >
          {simulating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Simulating…</span>
            </>
          ) : done ? (
            <>
              <Check className="h-4 w-4" />
              <span>Done</span>
            </>
          ) : (
            <span>Simulate</span>
          )}
        </div>

        {/* Cursor + click effects, anchored to the measured button center. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* Ripple ring. */}
          {time >= CLICK_T && burstP < 1 && (
            <span
              className="absolute rounded-full border-[3px] border-primary"
              style={{
                left: click.x - (7 + 30 * burstP),
                top: click.y - (7 + 30 * burstP),
                width: 14 + 60 * burstP,
                height: 14 + 60 * burstP,
                opacity: 1 - burstP,
              }}
            />
          )}
          {/* Particle burst — playful fan upward. */}
          {time >= CLICK_T &&
            burstP < 1 &&
            Array.from({ length: BURST }).map((_, i) => {
              const ang = ((-90 + (i - (BURST - 1) / 2) * 24) * Math.PI) / 180;
              const dist = 36 + (i % 3) * 13;
              return (
                <span
                  key={i}
                  className={`absolute rounded-full ${i % 2 ? 'bg-accent' : 'bg-primary'}`}
                  style={{
                    left: click.x + Math.cos(ang) * dist * burstP - 3,
                    top: click.y + Math.sin(ang) * dist * burstP - 3,
                    width: 6 - (i % 3),
                    height: 6 - (i % 3),
                    opacity: 1 - burstP,
                  }}
                />
              );
            })}
          {/* Arrow pointer, tip exactly on the click point. */}
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            className="absolute"
            style={{
              left: click.x + cursorDX - 5.4,
              top: click.y + cursorDY - 3.25,
              opacity: cursorOpacity,
              transform: `rotate(${wiggle}deg)`,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))',
            }}
          >
            <path
              d="M5 3l14 7.5-6.2 1.8L9.5 19 5 3z"
              fill="#111"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Never in prod: local dev always, Vercel preview only when explicitly set. */}
      <AgentationToolbar
        enabled={
          process.env.NODE_ENV === 'development' ||
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
        }
      />
    </div>
  );
}
