// TaroIntro - the intro film (single composition, 1280×720 @ 30fps).
// Timeline (~32s):
//  hero words rise + slow zoom WHILE 7 chat bubbles pop in scattered
//  over the screen → bubbles leave in arrival order → thread draws below
//  the hero → sim text (same format) → 7 rectangles pop in scattered over
//  the sim text → rects leave in arrival order → random scribble thread
//  starts 1 frame later → finale: Introducing / Taro / decision lab.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, EASE_OUT, EASE_IN_OUT, clamp01 } from './tokens';

export const TOTAL_INTRO_FRAMES = 980;

const HERO = ['Building a warehouse from scratch is hard…', 'What if you messed up?'];
const SIM = ['What if we just simulate the warehouse', 'before creating it?'];

const BUBBLES: { text: string; left: number; top: number; w: number; rot: number }[] = [
  { text: 'Could we have used a better layout?', left: 64, top: 84, w: 300, rot: -3 },
  { text: 'What if we added another cross aisle?', left: 896, top: 70, w: 320, rot: 2 },
  { text: 'Are the fast movers in the right place?', left: 48, top: 300, w: 290, rot: 2 },
  { text: 'Could better placement reduce walking?', left: 936, top: 290, w: 296, rot: -2 },
  { text: 'What if demand changes?', left: 70, top: 520, w: 270, rot: -2 },
  { text: 'Should we batch these orders?', left: 890, top: 528, w: 300, rot: 2.5 },
  { text: 'Would zone picking work better?', left: 480, top: 566, w: 320, rot: -1 },
];

const RECTS: { text: string; left: number; top: number; w: number; rot: number }[] = [
  { text: 'Complex interactions', left: 80, top: 80, w: 280, rot: -2 },
  { text: 'Hard to model accurately', left: 920, top: 92, w: 280, rot: 2 },
  { text: 'Real-world constraints', left: 60, top: 292, w: 270, rot: 1.5 },
  { text: 'Requires specialized expertise', left: 948, top: 300, w: 272, rot: -2 },
  { text: 'Expensive to build', left: 92, top: 522, w: 270, rot: 2 },
  { text: 'Difficult to experiment', left: 900, top: 526, w: 290, rot: -2.5 },
  { text: 'Hard to compare scenarios', left: 490, top: 78, w: 300, rot: 1 },
];

// ---- timing (frames @30fps) ----
const WORD_STAGGER = 6;
const WORD_DUR = 22;
const BUBBLE_START = 55;
const BUBBLE_GAP = 22;
const BUBBLE_OUT = 265;
const BUBBLE_OUT_GAP = 10; // last bubble starts leaving 325, fully gone ~337
const THREAD1_START = 340; // strictly after all bubbles gone
const THREAD1_DUR = 45;
const HERO_OUT = 390; // after thread finishes drawing
const SIM_START = 405;
const RECT_START = 480;
const RECT_GAP = 20;
const RECT_OUT = 670;
const RECT_OUT_GAP = 10;
const SIM_OUT = 725;
const SCRIBBLE_START = 731; // ~1 frame after rects start leaving
const SCRIBBLE_DUR = 70;
const FINALE_START = 810;

/** one word rising out of an overflow mask, eased out */
const Word: React.FC<{ frame: number; at: number; children: string; big: boolean }> = ({
  frame, at, children, big,
}) => {
  const k = EASE_OUT(clamp01((frame - at) / WORD_DUR));
  if (k <= 0) return <span style={{ opacity: 0 }}>{children} </span>;
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em', marginBottom: '-0.08em', verticalAlign: 'bottom' }}>
      <span
        style={{
          display: 'inline-block',
          transform: `translateY(${(1 - k) * 110}%)`,
          opacity: k,
          fontSize: big ? 56 : 32,
          fontWeight: big ? 750 : 500,
          color: big ? C.ink : C.text2,
        }}
      >
        {children}
        {'\u00A0'}
      </span>
    </span>
  );
};

const Arising: React.FC<{ frame: number; start: number; lines: [string, string]; outAt?: number }> = ({
  frame, start, lines, outAt = Infinity,
}) => {
  const outK = clamp01((frame - outAt) / 18);
  const e = 1 - EASE_OUT(outK);
  let n = 0;
  return (
    <div style={{ textAlign: 'center', padding: '0 60px', opacity: e, transform: `translateY(${outK * -26}px)`, filter: outK > 0 ? `blur(${outK * 6}px)` : undefined }}>
      {lines.map((line, li) => (
        <p key={li} style={{ margin: li === 1 ? '14px 0 0' : 0, lineHeight: 1.18 }}>
          {line.split(' ').map((w, i) => {
            const at = start + n++ * WORD_STAGGER;
            return <Word key={i} frame={frame} at={at} big={li === 0}>{w}</Word>;
          })}
        </p>
      ))}
    </div>
  );
};

/** scattered pop-in card; null before arrival, fades after outAt */
const Card: React.FC<{
  frame: number; inAt: number; outAt: number;
  left: number; top: number; w: number; rot: number;
  rect?: boolean; children: string;
}> = ({ frame, inAt, outAt, left, top, w, rot, rect, children }) => {
  const kIn = EASE_OUT(clamp01((frame - inAt) / 14));
  if (kIn <= 0) return null;
  const kOut = EASE_OUT(clamp01((frame - outAt) / 12));
  const o = kIn * (1 - kOut);
  if (o <= 0.01) return null;
  return (
    <div
      style={{
        position: 'absolute', left, top, width: w,
        opacity: o,
        transform: `translateY(${(1 - kIn) * 26 + kOut * -18}px) scale(${0.94 + 0.06 * kIn}) rotate(${rot}deg)`,
        filter: kOut > 0 ? `blur(${kOut * 4}px)` : undefined,
        background: C.surface,
        border: `1px solid ${C.borderDefault}`,
        borderLeft: rect ? `4px solid ${C.accent}` : undefined,
        borderRadius: rect ? 8 : 16,
        borderBottomLeftRadius: rect ? 8 : 4,
        padding: rect ? '10px 14px' : '9px 14px',
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: rect ? 600 : 400,
        color: C.ink,
        boxShadow: '0 4px 16px rgba(17,17,17,0.08)',
      }}
    >
      {children}
    </div>
  );
};

/** hand-drawn thread: draws via normalized pathLength */
const Thread: React.FC<{ frame: number; start: number; dur: number; d: string; outAt?: number; width?: number }> = ({
  frame, start, dur, d, outAt = Infinity, width = 4,
}) => {
  const p = clamp01((frame - start) / dur);
  if (p <= 0) return null;
  const pe = EASE_IN_OUT(p);
  const o = 1 - EASE_OUT(clamp01((frame - outAt) / 12));
  if (o <= 0) return null;
  return (
    <svg viewBox="0 0 1280 720" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: o }} fill="none">
      <path
        d={d}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - pe}
        stroke={C.accent}
        strokeWidth={width}
        strokeLinecap="round"
      />
    </svg>
  );
};

export const TaroIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const master = clamp01(frame / 10) * clamp01((TOTAL_INTRO_FRAMES - frame) / 15);

  // slow zoom lives for the whole hero+bubble act
  const zoom = 0.97 + 0.065 * EASE_OUT(clamp01(frame / 280));
  const heroVisible = frame >= 0 && frame < HERO_OUT + 18;
  const simVisible = frame >= SIM_START - 10 && frame < SIM_OUT + 18;

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, opacity: master }}>
      {/* blueprint grid */}
      <div
        style={{
          position: 'absolute', inset: 0, opacity: 0.6,
          backgroundImage: `linear-gradient(to right, ${C.borderSubtle} 1px, transparent 1px), linear-gradient(to bottom, ${C.borderSubtle} 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
        }}
      />

      {/* hero: centered, zooming */}
      {heroVisible && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${zoom})` }}>
          <Arising frame={frame} start={8} lines={[HERO[0], HERO[1]]} outAt={HERO_OUT} />
        </div>
      )}

      {/* bubbles scattered OVER the hero */}
      {BUBBLES.map((b, i) => (
        <Card key={b.text} frame={frame} inAt={BUBBLE_START + i * BUBBLE_GAP} outAt={BUBBLE_OUT + i * BUBBLE_OUT_GAP}
          left={b.left} top={b.top} w={b.w} rot={b.rot}>
          {b.text}
        </Card>
      ))}

      {/* thread below the hero text → leads to sim */}
      <Thread
        frame={frame} start={THREAD1_START} dur={THREAD1_DUR} outAt={SIM_START + 70}
        d="M 640 445 C 628 480, 652 505, 640 545 S 632 590, 640 620"
      />

      {/* sim text, same format as hero */}
      {simVisible && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.97 + 0.05 * EASE_OUT(clamp01((frame - SIM_START) / 200))})` }}>
          <Arising frame={frame} start={SIM_START} lines={[SIM[0], SIM[1]]} outAt={SIM_OUT} />
        </div>
      )}

      {/* rectangles scattered OVER the sim text, same behaviour as bubbles */}
      {RECTS.map((r, i) => (
        <Card key={r.text} frame={frame} inAt={RECT_START + i * RECT_GAP} outAt={RECT_OUT + i * RECT_OUT_GAP}
          left={r.left} top={r.top} w={r.w} rot={r.rot} rect>
          {r.text}
        </Card>
      ))}

      {/* random scribble over the whole page → finale */}
      <Thread
        frame={frame} start={SCRIBBLE_START} dur={SCRIBBLE_DUR} outAt={FINALE_START + 40} width={4}
        d="M 80 120 C 320 60, 620 190, 900 100 S 1210 250, 1000 330 S 320 390, 150 430 S 820 560, 1110 520 S 520 660, 200 600 S 700 690, 1120 645 M 100 250 L 1180 230 M 90 470 L 1190 490"
      />

      {/* finale */}
      {frame >= FINALE_START - 5 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ opacity: EASE_OUT(clamp01((frame - FINALE_START) / 16)), fontSize: 15, fontWeight: 700, letterSpacing: 5, color: C.muted }}>
            INTRODUCING
          </div>
          <div style={{ overflow: 'hidden', marginTop: 6 }}>
            <div
              style={{
                fontSize: 150, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: C.accent,
                transform: `translateY(${(1 - EASE_OUT(clamp01((frame - (FINALE_START + 12)) / 24))) * 100}%)`,
                opacity: EASE_OUT(clamp01((frame - (FINALE_START + 12)) / 16)),
              }}
            >
              Taro
            </div>
          </div>
          <div
            style={{
              marginTop: 10, fontSize: 34, fontWeight: 500, color: C.ink,
              opacity: EASE_OUT(clamp01((frame - (FINALE_START + 38)) / 18)),
              transform: `translateY(${(1 - EASE_OUT(clamp01((frame - (FINALE_START + 38)) / 18))) * 18}px)`,
            }}
          >
            the warehouse decision lab
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
