// TaroMotion - the full film.
// 8 scenes, 1280×720 @ 30fps, 88s (2640 frames). Each scene fades in/out
// over its neighbours so every cut is a smooth dissolve.

import React from 'react';
import { AbsoluteFill, delayRender, continueRender, staticFile } from 'remotion';
import { useEffect, useState } from 'react';
import { FONT } from './tokens';
import { Scene1 } from './scenes/Scene1';
import { Scene2 } from './scenes/Scene2';
import { Scene3 } from './scenes/Scene3';
import { Scene4 } from './scenes/Scene4';
import { Scene5 } from './scenes/Scene5';
import { Scene6 } from './scenes/Scene6';
import { Scene7 } from './scenes/Scene7';
import { Scene8 } from './scenes/Scene8';

// scene timeline (frames) - 88s total at 30fps
const TIMELINE: { scene: React.FC<{ start: number }>; from: number; dur: number }[] = [
  { scene: Scene1, from: 0, dur: 300 },      // The Problem
  { scene: Scene2, from: 300, dur: 300 },    // The Decision Problem
  { scene: Scene3, from: 600, dur: 240 },    // Meet Taro
  { scene: Scene4, from: 840, dur: 360 },    // Configure
  { scene: Scene5, from: 1200, dur: 360 },   // Simulate
  { scene: Scene6, from: 1560, dur: 390 },   // Compare
  { scene: Scene7, from: 1950, dur: 350 },   // Experiment
  { scene: Scene8, from: 2300, dur: 340 },   // Feedback loop + outro
];
export const TOTAL_FRAMES = 2640;

let fontLoaded = false;
const WAIT = (): Promise<void> => {
  const handle = delayRender('loading font');
  return new Promise((resolve) => {
    const load = async () => {
      try {
        const face = new FontFace('InstrumentSans', `url(${staticFile('fonts/instrument-sans.woff2')})`);
        await face.load();
        document.fonts.add(face);
        fontLoaded = true;
      } catch {
        console.warn('font load failed - falling back to sans-serif');
      }
      continueRender(handle);
      resolve();
    };
    if (fontLoaded || typeof document === 'undefined') {
      continueRender(handle);
      resolve();
    } else load();
  });
};

const useAppFont = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    WAIT().then(() => setReady(true));
  }, []);
  return ready;
};

export const TaroMotion: React.FC = () => {
  useAppFont();
  return (
    <AbsoluteFill style={{ background: '#FBF6F6', fontFamily: FONT }}>
      {TIMELINE.map(({ scene: S, from }, i) => (
        <S key={i} start={from} />
      ))}
    </AbsoluteFill>
  );
};