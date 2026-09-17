"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// Motion personality: Corporate (calm-sharp) - one easing vocabulary for the whole piece.
const ENTER: [number, number, number, number] = [0.22, 1, 0.36, 1]; // enters: fast start, soft landing
const EXIT: [number, number, number, number] = [0.7, 0, 0.84, 0]; // exits: accelerate away
const MOVE: [number, number, number, number] = [0.65, 0, 0.35, 1]; // camera: symmetric ease-in-out
const PAPER = "#FBF6F6";
const INK = "#111111";
const MUTED = "#666666";
const OLIVE = "#4C5C2D";
const LINE = "#DDDAD9";

// Camera pan and thread draw share one tween → lens stays glued to the thread tip.
// Base unit 0.4s: enters 0.4s, camera 1.6–2.0s (big move), holds breathe on zoom.
const PAN_T = { duration: 1.9, ease: MOVE };
const SCRIBBLE_T = { duration: 2.0, ease: MOVE };
// Single slow push-in over the hold - one direction only, never zooms back out.
const BREATHE_T = { duration: 7, ease: "easeOut" as const };

const BUBBLES = [
  "Could we have used a better layout?",
  "What if we added another cross aisle?",
  "Are the fast movers in the right place?",
  "Could better placement reduce walking?",
  "What if demand changes?",
  "Should we batch these orders?",
  "Would zone picking work better?",
];

// top + bottom bands only - center stays clear for the hero text
const BPOS = [
  { l: "4%", t: "6%", r: -3 },
  { l: "39%", t: "5%", r: 2 },
  { l: "70%", t: "6%", r: 2 },
  { l: "4%", t: "78%", r: -2 },
  { l: "27%", t: "84%", r: -2 },
  { l: "53%", t: "84%", r: 2.5 },
  { l: "74%", t: "76%", r: -1 },
];

const RECTS = [
  "Complex interactions",
  "Hard to model accurately",
  "Real-world constraints",
  "Requires specialized expertise",
  "Expensive to build",
  "Difficult to experiment",
  "Hard to compare scenarios",
];

// vertical list layout - stacked top→bottom, no scatter, no rotation

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ArisingText({ lines, zoom = true }: { lines: string[]; zoom?: boolean }) {
  const reduced = useReducedMotion();
  let n = 0;
  return (
    <motion.div
      initial={zoom && !reduced ? { scale: 1 } : false}
      animate={zoom && !reduced ? { scale: 1.06 } : undefined}
      transition={zoom && !reduced ? BREATHE_T : undefined}
      className="max-w-4xl px-6 text-center"
    >
      {lines.map((line, li) => (
        <p
          key={li}
          className={
            li === 0
              ? "text-3xl font-semibold leading-tight tracking-tight text-[#111111] sm:text-5xl"
              : "mt-4 text-xl font-medium text-[#666666] sm:text-2xl"
          }
        >
          {line.split(" ").map((w) => {
            const i = n++;
            return (
              <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                <motion.span
                  className="inline-block will-change-transform"
                  initial={{ y: "110%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  transition={{ duration: 0.6, ease: ENTER, delay: 0.25 + i * 0.06 }}
                >
                  {w}
                  {"\u00A0"}
                </motion.span>
              </span>
            );
          })}
        </p>
      ))}
    </motion.div>
  );
}

function StaticText({ text, className = "", active = true }: { text: string; className?: string; active?: boolean }) {
  return (
    <div className={`max-w-4xl px-6 text-center ${className}`}>
      <p className="text-3xl font-semibold leading-tight tracking-tight text-[#111111] sm:text-5xl">
        {text.split(" ").map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
            <motion.span
              className="inline-block will-change-transform"
              initial={false}
              animate={active ? { y: "0%", opacity: 1 } : { y: "110%", opacity: 0 }}
              transition={{ duration: 0.6, ease: ENTER, delay: active ? 0.25 + i * 0.06 : 0 }}
            >
              {w}
              {"\u00A0"}
            </motion.span>
          </span>
        ))}
      </p>
    </div>
  );
}

type Stage = "doubt" | "journey" | "simulate" | "scribble" | "finale";

const HERO = ["Building a warehouse from scratch is hard…", "What if you messed up?"];
const SIM = "What if we just simulate the warehouse before creating it?";

// L-shaped world: sim sits RIGHT of hero, finale BELOW sim. Camera = fixed <main> viewport.
// % are of the 200vw × 200svh world → -50% = exactly one viewport over.
const WORLD_XY: Record<Stage, { x: string; y: string }> = {
  doubt: { x: "0%", y: "0%" },
  journey: { x: "-50%", y: "0%" },
  simulate: { x: "-50%", y: "0%" },
  scribble: { x: "-50%", y: "-50%" },
  finale: { x: "-50%", y: "-50%" },
};

export default function IntroPage() {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>("doubt");
  const [bubbles, setBubbles] = useState(0);
  const [bubblesGone, setBubblesGone] = useState(0);
  const [rects, setRects] = useState(0);

  useEffect(() => {
    let dead = false;
    const k = reduced ? 0.4 : 1;
    (async () => {
      // hero words finish first (~2.1s) + one beat, THEN bubbles pop in fast
      // ponytail: 350ms beat so the frame paints; breathing zoom covers the hold
      await wait(2450 * k);
      if (dead) return;
      for (let i = 1; i <= BUBBLES.length; i++) {
        if (i > 1) await wait(260 * k);
        if (dead) return;
        setBubbles(i);
      }
      await wait(1200 * k);
      if (dead) return;
      for (let i = 1; i <= BUBBLES.length; i++) {
        await wait(280 * k);
        if (dead) return;
        setBubblesGone(i);
        // last bubble out → camera + thread start the SAME tick, no gap
        if (i === BUBBLES.length) setStage("journey");
      }
      await wait(1900 * k);
      if (dead) return;
      // camera has arrived → sim words rise (same as hero, ~1.4s), THEN list drops in
      setStage("simulate");
      await wait(1800 * k);
      if (dead) return;
      for (let i = 1; i <= RECTS.length; i++) {
        if (i > 1) await wait(380 * k);
        if (dead) return;
        setRects(i);
      }
      // list stays put - camera glides down to Taro with text + list riding together
      await wait(1600 * k);
      if (dead) return;
      setStage("scribble");
      await wait(2000 * k);
      if (dead) return;
      setStage("finale");
    })();
    return () => {
      dead = true;
    };
  }, [reduced]);

  const journeyDone = stage !== "doubt";
  const scribbleDone = stage === "scribble" || stage === "finale";

  return (
    <main className="relative h-svh flex-col overflow-hidden" style={{ background: PAPER, display: "flex" }}>
      {/* camera: L-world pans inside this fixed viewport */}
      <motion.div
        className="absolute left-0 top-0 h-[200svh] w-[200vw]"
        initial={false}
        animate={WORLD_XY[stage]}
        transition={stage === "scribble" ? SCRIBBLE_T : PAN_T}
      >
        {/* panel 1 · hero (left) */}
        <section className="absolute left-0 top-0 flex h-svh w-screen items-center justify-center">
          <motion.div
            initial={false}
            animate={
              journeyDone
                ? { opacity: 0, x: -120, filter: "blur(6px)" }
                : { opacity: 1, x: 0, filter: "blur(0px)" }
            }
            transition={PAN_T}
          >
            <ArisingText lines={HERO} />
          </motion.div>
          <AnimatePresence initial={false}>
            {BUBBLES.map((b, i) =>
              i < bubbles && i >= bubblesGone ? (
                <motion.div
                  key={b}
                  initial={{ y: 26, opacity: 0, scale: 0.96, rotate: BPOS[i].r }}
                  animate={{ y: 0, opacity: 1, scale: 1, rotate: BPOS[i].r }}
                  exit={{ opacity: 0, y: -14, scale: 0.97, filter: "blur(4px)" }}
                  transition={{ duration: 0.4, ease: ENTER, delay: (i % 3) * 0.06 }}
                  className="absolute max-w-[240px] rounded-2xl rounded-bl-md border bg-white px-4 py-2.5 text-sm shadow-[0_4px_16px_rgba(17,17,17,0.08)] sm:max-w-[300px] sm:text-[15px]"
                  style={{ borderColor: LINE, left: BPOS[i].l, top: BPOS[i].t }}
                >
                  {b}
                </motion.div>
              ) : null
            )}
          </AnimatePresence>
        </section>

        {/* panel 2 · sim (right of hero - revealed by the camera, no intro) */}
        <section className="absolute left-[100vw] top-0 flex h-svh w-screen flex-col items-center justify-center gap-6 px-6">
          {/* text + list ride as one unit: no awkward split when the camera moves on */}
          <motion.div
            initial={false}
            animate={
              scribbleDone
                ? { opacity: 0, y: -80, filter: "blur(6px)" }
                : { opacity: 1, y: 0, filter: "blur(0px)" }
            }
            transition={SCRIBBLE_T}
            className="flex flex-col items-center gap-6"
          >
            <motion.div initial={reduced ? false : { scale: 1 }} animate={reduced ? undefined : { scale: 1.06 }} transition={BREATHE_T}>
              <StaticText text={SIM} active={stage === "simulate" || scribbleDone} />
            </motion.div>
            <div className="flex w-full max-w-md flex-col gap-2.5">
              {RECTS.map((r, i) =>
                i < rects ? (
                  <motion.div
                    key={r}
                    layout
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.35, ease: ENTER }}
                    className="border bg-white px-4 py-3 text-sm font-medium shadow-[0_2px_8px_rgba(17,17,17,0.06)] sm:text-[15px]"
                    style={{ borderColor: LINE, color: INK }}
                  >
                    {r}
                  </motion.div>
                ) : null
              )}
            </div>
          </motion.div>
        </section>

        {/* panel 3 · finale (below sim) */}
        <section className="absolute left-[100vw] top-[100svh] flex h-svh w-screen items-center justify-center">
          {/* wordmark reveal: mask rise + per-letter stagger (logo-animation skill), tagline unfurls last */}
          <motion.div
            className="px-6 text-center"
            initial={false}
            animate={{ opacity: stage === "finale" ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.p
              initial={false}
              animate={stage === "finale" ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.5, ease: ENTER }}
              className="text-sm font-semibold uppercase tracking-[0.3em]"
              style={{ color: MUTED }}
            >
              Introducing
            </motion.p>
            <div className="overflow-hidden py-2">
              <h1
                aria-label="Taro"
                className="text-7xl font-bold tracking-tight sm:text-9xl"
                style={{ color: OLIVE }}
              >
                {"Taro".split("").map((ch, i) => (
                  <span key={i} className="inline-block overflow-hidden pb-2 align-bottom">
                    <motion.span
                      className="inline-block will-change-transform"
                      initial={false}
                      animate={stage === "finale" ? { y: "0%", rotate: 0 } : { y: "110%", rotate: 4 }}
                      transition={{ duration: 0.7, ease: ENTER, delay: stage === "finale" ? 0.15 + i * 0.07 : 0 }}
                    >
                      {ch}
                    </motion.span>
                  </span>
                ))}
              </h1>
            </div>
            <div className="overflow-hidden">
              <motion.p
                initial={false}
                animate={stage === "finale" ? { y: "0%", opacity: 1 } : { y: "100%", opacity: 0 }}
                transition={{ duration: 0.6, ease: ENTER, delay: stage === "finale" ? 0.55 : 0 }}
                className="mt-3 text-xl sm:text-3xl"
                style={{ color: INK }}
              >
                the warehouse decision lab
              </motion.p>
            </div>
          </motion.div>
        </section>
      </motion.div>

    </main>
  );
}
