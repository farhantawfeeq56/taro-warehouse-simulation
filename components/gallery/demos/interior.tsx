'use client';

/**
 * /components gallery - interior motion components (the app's micro-interactions).
 */

import { useEffect, useState } from 'react';
import { LoadingButton } from '@/components/interior/loading-button';
import { PressDepth } from '@/components/interior/press-depth';
import { ProgressBar } from '@/components/interior/progress-bar';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { ValueFlash } from '@/components/interior/value-flash';
import type { GalleryEntry } from '../registry';

/** Small framed stage so a component reads on its own page. */
function Stage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-[240px] items-center justify-center rounded-xl border border-border-default bg-surface p-8 ${className}`}>
      {children}
    </div>
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ── Loading button ───────────────────────────────────────────────────── */

function LoadingButtonDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Stage className="flex-col gap-4">
        <LoadingButton onAction={() => wait(1200)} pendingLabel="Saving">
          Save layout
        </LoadingButton>
      </Stage>
      <Stage className="flex-col gap-4">
        <LoadingButton tone="primary" onAction={() => wait(1200)}>
          Run simulation
        </LoadingButton>
      </Stage>
      <Stage className="flex-col gap-4">
        <LoadingButton onAction={() => Promise.reject(new Error('offline'))}>
          Import CSV
        </LoadingButton>
      </Stage>
      <Stage className="flex-col gap-4">
        <LoadingButton disabled onAction={() => wait(600)}>
          Generate
        </LoadingButton>
      </Stage>
    </div>
  );
}

/* ── Press depth ──────────────────────────────────────────────────────── */

function PressDepthDemo() {
  return (
    <Stage className="flex-wrap gap-6">
      <PressDepth depth={6}>Default key</PressDepth>
      <PressDepth className="border-accent bg-accent text-white" depth={6}>
        Accent key
      </PressDepth>
      <PressDepth className="border-foreground bg-foreground text-background" depth={3} tilt={10}>
        Tilt on press
      </PressDepth>
      <PressDepth className="border-foreground bg-foreground text-background" depth={8} tilt={0}>
        Deep key
      </PressDepth>
      <PressDepth disabled depth={4}>
        Disabled
      </PressDepth>
    </Stage>
  );
}

/* ── Progress bar ─────────────────────────────────────────────────────── */

function ProgressBarDemo() {
  const [value, setValue] = useState(8);

  useEffect(() => {
    const id = setInterval(() => setValue((v) => (v >= 100 ? 0 : v + 7)), 320);
    return () => clearInterval(id);
  }, []);

  return (
    <Stage className="flex-col items-stretch gap-8">
      <ProgressBar value={value} label="Running simulation" pendingLabel="Simulating" completeLabel="Simulation complete" />
      <ProgressBar value={value} max={50} label="Distance (m)" />
      <ProgressBar value={null} label="Generating warehouse" />
    </Stage>
  );
}

/* ── Skeleton swap ────────────────────────────────────────────────────── */

function SkeletonSwapDemo() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setReady((r) => !r), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <Stage className="items-stretch">
      <div className="w-full max-w-md">
        <SkeletonSwap ready={ready} lines={4} reserve={96} label="Warehouse summary">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">Default Warehouse</p>
            <p className="text-xs text-text-secondary">10 racks · 1 cross-aisle · 240 SKUs · 30 orders</p>
          </div>
        </SkeletonSwap>
      </div>
    </Stage>
  );
}

/* ── Value flash ──────────────────────────────────────────────────────── */

function ValueFlashDemo() {
  const [distance, setDistance] = useState(1240);

  return (
    <Stage className="flex-col gap-6">
      <ValueFlash
        value={distance}
        format={(v) => `${Math.round(v).toLocaleString()} m`}
        label="Total distance"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDistance((d) => d + 180)}
          className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-text-primary"
        >
          worsen
        </button>
        <button
          type="button"
          onClick={() => setDistance((d) => Math.max(0, d - 180))}
          className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-text-primary"
        >
          improve
        </button>
      </div>
    </Stage>
  );
}

export const interiorDemos: GalleryEntry[] = [
  {
    slug: 'loading-button',
    title: 'Loading button',
    group: 'Interior',
    tagline: 'Async action button: idle → pending → success / error, then back.',
    render: () => <LoadingButtonDemo />,
  },
  {
    slug: 'press-depth',
    title: 'Press depth',
    group: 'Interior',
    tagline: 'Physical key press - the surface sinks and leans toward the cursor.',
    render: () => <PressDepthDemo />,
  },
  {
    slug: 'progress-bar',
    title: 'Progress bar',
    group: 'Interior',
    tagline: 'Spring-filled bar with pending / complete crossfade and indeterminate mode.',
    render: () => <ProgressBarDemo />,
  },
  {
    slug: 'skeleton-swap',
    title: 'Skeleton swap',
    group: 'Interior',
    tagline: 'Minimum-visible skeleton that crossfades into loaded content.',
    render: () => <SkeletonSwapDemo />,
  },
  {
    slug: 'value-flash',
    title: 'Value flash',
    group: 'Interior',
    tagline: 'Metric that flashes up or down when its number changes.',
    render: () => <ValueFlashDemo />,
  },
];
