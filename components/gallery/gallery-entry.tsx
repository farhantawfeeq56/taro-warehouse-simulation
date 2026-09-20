'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { galleryEntry } from './registry';

/**
 * Renders one gallery entry - the component and nothing else.
 *
 * No title block, no description: just the component centred in the viewport
 * so each page can be screenshotted as-is. The only chrome is a small back
 * button in the corner, floating above the component.
 *
 * The component mounts client-side only: the demos generate real warehouse
 * data (randomised, expensive), so rendering them on the server would both
 * waste the work and mismatch on hydration.
 */
export function GalleryEntryView({ slug }: { slug: string }) {
  const entry = galleryEntry(slug);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (!entry) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-text-secondary">No component named “{slug}”.</p>
        <Link href="/components" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
          Back to all components
        </Link>
      </main>
    );
  }

  const back = (
    <Link
      href="/components"
      aria-label="All components"
      title="All components"
      className="pointer-events-auto z-[300] flex size-8 items-center justify-center rounded-full border border-border-default bg-surface/85 text-text-secondary shadow-sm backdrop-blur transition-colors hover:text-text-primary"
    >
      <ArrowLeft className="size-3.5" />
    </Link>
  );

  if (entry.bleed) {
    return (
      <main className="relative h-screen w-full overflow-hidden bg-background">
        {ready ? (
          entry.render()
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <Loading />
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-4">{back}</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface p-4 font-sans sm:p-10">
      <div className="pointer-events-none absolute left-4 top-4">{back}</div>
      <div className="relative flex w-full max-w-5xl items-center justify-center p-2 sm:p-4">
        {ready ? entry.render() : <Loading />}
      </div>
    </main>
  );
}

/** Placeholder shown while the browser generates the demo warehouse. */
function Loading() {
  return (
    <div className="flex h-40 w-full max-w-md items-center justify-center rounded-xl border border-dashed border-border-default bg-surface/60">
      <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Generating…</p>
    </div>
  );
}
