'use client';

import { useEffect, useRef, useState } from 'react';
import { AgentationToolbar } from '@/components/agentation';
import { LoadingButton } from '@/components/interior/loading-button';

/* ── Easing ─────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ── Timeline (seconds, loops) — same click choreography as /animation/1 ── */
const TOTAL = 9;
const FLY_T0 = 1.2;
const CLICK_T = 2.25;
const OUT_T0 = 6.4;

export default function Animation2Page() {
  const [time, setTime] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const timeRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonBoxRef = useRef<HTMLDivElement | null>(null);
  const clickRef = useRef({ x: 170, y: 18 });

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      timeRef.current = TOTAL;
      setTime(TOTAL);
      return;
    }
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      // Measure the real button center so the cursor lands exactly on it.
      const wrap = wrapRef.current;
      const box = buttonBoxRef.current;
      if (wrap && box) {
        const wb = wrap.getBoundingClientRect();
        const bb = box.getBoundingClientRect();
        clickRef.current = {
          x: bb.left + bb.width / 2 - wb.left,
          y: bb.top + bb.height / 2 - wb.top,
        };
      }
      let nt = timeRef.current + dt;
      if (nt >= TOTAL) nt -= TOTAL;
      timeRef.current = nt;
      setTime(nt);
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

  // Cursor: flies in from bottom-right, clicks, fades out before the loop.
  const cursorP = easeInOutCubic(clamp01((time - FLY_T0) / (CLICK_T - FLY_T0)));
  const cursorOpacity =
    time < FLY_T0
      ? 0
      : time < OUT_T0
        ? cursorP
        : Math.max(0, 1 - (time - OUT_T0) / (TOTAL - OUT_T0));
  const cursorDX = 150 * (1 - cursorP);
  const cursorDY = 140 * (1 - cursorP);
  const pressing = time >= CLICK_T && time < CLICK_T + 0.45;

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Narrower cut of the original: w-64 panel, p-3 inset, w-full button. */}
      <div ref={wrapRef} className="relative w-64 max-w-[calc(100vw-2rem)]">
        <div className="p-3">
        {/* The genuine Simulate button — same component, size and animation
            as the simulation tab. */}
        <div
          ref={buttonBoxRef}
          className={`transition-all duration-150 ${pressing ? 'scale-[0.97] brightness-90' : ''}`}
        >
          <LoadingButton
            onAction={() => {}}
            pendingLabel="Simulating…"
            successLabel="Done"
            tone="primary"
            className="w-full justify-center"
          >
            Simulate
          </LoadingButton>
        </div>
        </div>

        {/* Cursor press, anchored to the button (same as /animation/1). */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute"
            style={{
              left: click.x + cursorDX,
              top: click.y + cursorDY,
              opacity: cursorOpacity,
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              className="absolute"
              style={{ left: -5.4, top: -3.25, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}
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
