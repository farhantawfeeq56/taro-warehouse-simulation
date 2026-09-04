#!/usr/bin/env node
// Records /intro as a real-time 1920x1080 @ 60fps MP4.
//
// Captures the ACTUAL rendered page (layout, fonts, motion timing) —
// headless CDP screencast encoded to CFR 60fps MP4 (runs in the
// background, safe while you keep working). Pass --display for true-60
// display capture of a fullscreen kiosk Chrome (needs the machine
// untouched for ~30s). Nothing is re-implemented.
//
// Usage:
//   npm run video:intro
//   npm run video:intro -- --url http://localhost:3000/intro --ms 22000 --out out/intro-1080p60.mp4
//   npm run video:intro -- --display  # true-60, hands off mouse/keyboard
//
// Env overrides: INTRO_URL, INTRO_MS, INTRO_OUT
// If no server is up on the URL, a production server (`next start`) is
// spawned automatically (building first if .next is missing).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => (a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : [])),
);
const PAGE_URL = args.url || process.env.INTRO_URL || 'http://localhost:3100/intro'; // :3100 → script serves a clean production build (no dev badges)
const MS = Number(args.ms || process.env.INTRO_MS || 35_000); // cap; recording stops at the finale + hold
const OUT = resolve(ROOT, args.out || process.env.INTRO_OUT || 'out/intro-1080p60.mp4');
// Recording-only zoom (capture setting, design source untouched): 1.5 makes
// the site's fixed-px type fill a 1080p video frame instead of floating small.
const ZOOM = Number(args.zoom || process.env.INTRO_ZOOM || 1.1);
const FRAMES = join(ROOT, 'out', '.intro-frames');
const W = 1920;
const H = 1080;

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
];

function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch { /* already gone */ }
}

async function urlOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

// Spawn `next start` if nothing serves the URL yet. Returns a child to kill, or null.
async function ensureServer(url) {
  if (await urlOk(url)) {
    console.log(`[video] using running server: ${url}`);
    return null;
  }
  const port = new URL(url).port || '3100';
  // Rebuild if .next is missing or predates the /intro route (stale build → 404 → blank video).
  if (!existsSync(join(ROOT, '.next')) || !existsSync(join(ROOT, '.next', 'server', 'app', 'intro'))) {
    console.log('[video] (re)building production bundle for /intro…');
    const b = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
    if (b.status !== 0) throw new Error('next build failed');
  }
  console.log(`[video] starting production server on :${port}…`);
  const child = spawn('npx', ['next', 'start', '--port', port], { cwd: ROOT, shell: true, stdio: 'ignore' });
  const target = url;
  for (let i = 0; i < 60; i++) {
    if (await urlOk(target)) {
      console.log(`[video] server ready: ${target}`);
      return child;
    }
    await sleep(1000);
  }
  killTree(child);
  throw new Error(`server never came up: ${target}`);
}

const FFMPEG_COMMON = [
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '17',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
];

// True-60 path: fullscreen kiosk Chrome + ffmpeg gdigrab of the real screen.
async function recordGdigrab(exe, url, ms, out) {
  console.log(`[video] launching kiosk ${exe}`);
  const browser = await chromium.launch({
    executablePath: exe,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--start-maximized',
      '--window-position=0,0',
      `--window-size=${W},${H}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--disable-infobars',
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    // Warm-up load: compiles pages, caches fonts — the recorded pass then starts clean.
    console.log('[video] warm-up load…');
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(2500);
    await page.goto('about:blank', { waitUntil: 'commit' });
    await page.keyboard.press('F11').catch(() => {}); // true fullscreen: no tabs, no taskbar
    await page.bringToFront().catch(() => {}); // kiosk must be the top window for display capture
    await sleep(800);
    console.log("[video] heads up: capture runs ~30s — hands off mouse/keyboard meanwhile");

    mkdirSync(join(ROOT, 'out'), { recursive: true });
    const secs = (ms / 1000).toFixed(2);
    console.log(`[video] recording ${ms}ms @ ${W}x${H}60 via display capture (zoom ${ZOOM})…`);
    const ff = spawn(
      ffmpegPath,
      [
        '-y',
        '-f', 'gdigrab',
        '-framerate', '60',
        '-video_size', `${W}x${H}`,
        '-offset_x', '0',
        '-offset_y', '0',
        '-i', 'desktop',
        '-t', secs,
        '-r', '60',
        ...FFMPEG_COMMON,
        out,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let errTail = '';
    ff.stderr.on('data', (d) => { errTail = (errTail + d).slice(-2000); });
    const done = new Promise((res, rej) => {
      ff.on('error', rej);
      ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg gdigrab exited ${code}: ${errTail}`))));
    });
    await sleep(600); // let the grabber lock onto the fullscreen window
    await page.goto(url, { waitUntil: 'commit' }); // animation clock starts at first paint
    if (ZOOM !== 1) await page.evaluate((z) => { document.body.style.zoom = String(z); }, ZOOM);
    await done;
    console.log(`[video] done → ${out}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

// Fallback path: CDP screencast (unique fps lower — container still CFR 60).
async function recordScreencast(exe, url, ms, out) {
  console.log(`[video] launching headless ${exe}`);
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    console.log('[video] warm-up load…');
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(2500);

    rmSync(FRAMES, { recursive: true, force: true });
    mkdirSync(FRAMES, { recursive: true });
    const frames = [];
    const session = await context.newCDPSession(page);
    session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      session.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); // ack fast, write async
      const i = frames.length;
      const file = `frame-${String(i).padStart(6, '0')}.jpg`;
      frames.push({ file, t: metadata.timestamp });
      writeFile(join(FRAMES, file), Buffer.from(data, 'base64')).catch(() => {});
    });

    console.log(`[video] recording @ ${W}x${H} until finale (cap ${ms}ms)…`);
    await session.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
    await page.goto(url, { waitUntil: 'commit' });
    if (ZOOM !== 1) await page.evaluate((z) => { document.body.style.zoom = String(z); }, ZOOM);
    // Stop at the real end: Taro wordmark + tagline fully revealed, then a hold.
    try {
      await page.waitForFunction(() => {
        const h1 = document.querySelector('h1[aria-label="Taro"]');
        if (!h1) return false;
        const r = h1.getBoundingClientRect();
        if (r.height < 50 || r.width < 50) return false;
        const tag = [...document.querySelectorAll('p')].find((p) =>
          p.textContent.includes('warehouse decision lab'));
        return !!tag && getComputedStyle(tag).opacity === '1';
      }, null, { timeout: ms });
      await sleep(2500); // hold the finale card
    } catch { /* cap hit — keep what we captured */ }
    await sleep(1000); // drain in-flight frames
    const stopT = frames.length ? frames[frames.length - 1].t : 0;
    await session.send('Page.stopScreencast').catch(() => {});
    await browser.close();

    if (frames.length < 10) throw new Error(`only ${frames.length} frames captured — screencast failed`);
    console.log(`[video] captured ${frames.length} frames`);

    const lines = [];
    for (let i = 0; i < frames.length; i++) {
      const next = i + 1 < frames.length ? frames[i + 1].t : stopT + 0.25;
      const dur = Math.max(1 / 240, next - frames[i].t);
      lines.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`);
    }
    lines.push(`file '${frames[frames.length - 1].file}'`); // concat needs the last file repeated
    const listFile = join(FRAMES, 'list.txt');
    writeFileSync(listFile, lines.join('\n'));

    mkdirSync(join(ROOT, 'out'), { recursive: true });
    console.log('[video] encoding MP4…');
    await new Promise((resolveP, reject) => {
      const ff = spawn(
        ffmpegPath,
        ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vsync', 'cfr', '-r', '60',
          '-vf', `scale=${W}:${H}:flags=lanczos`, ...FFMPEG_COMMON, out],
        { stdio: 'inherit' },
      );
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolveP() : reject(new Error(`ffmpeg exited ${code}`))));
    });
    rmSync(FRAMES, { recursive: true, force: true });
    console.log(`[video] done → ${out}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

const serverChild = await ensureServer(PAGE_URL);
try {
  const exe = CHROME_PATHS.find((p) => existsSync(p));
  if (!exe) throw new Error('no system Chrome/Edge/Brave found');
  const useDisplay = args.display !== undefined || process.env.INTRO_DISPLAY;
  if (useDisplay) {
    await recordGdigrab(exe, PAGE_URL, MS, OUT);
  } else {
    await recordScreencast(exe, PAGE_URL, MS, OUT);
  }
} finally {
  killTree(serverChild);
}
