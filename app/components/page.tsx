'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { GALLERY, GALLERY_GROUPS, type GalleryEntry } from '@/components/gallery/registry';

/**
 * /components - index of every component in the app, one page each.
 * Built for sharing individual screens on Dribbble: every card links to a
 * page that renders the real component against generated data.
 */

function Card({ entry }: { entry: GalleryEntry }) {
  return (
    <Link
      href={`/components/${entry.slug}`}
      className="group flex flex-col justify-between gap-6 rounded-xl border border-border-default bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{entry.title}</h3>
          <ArrowUpRight className="size-3.5 shrink-0 text-text-muted transition-colors group-hover:text-accent" />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{entry.tagline}</p>
      </div>
      <p className="font-mono text-[10px] tracking-tight text-text-muted">/components/{entry.slug}</p>
    </Link>
  );
}

export default function ComponentsIndexPage() {
  return (
    <main className="relative min-h-screen bg-background font-sans">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--border-subtle) 1px, transparent 1px), linear-gradient(to bottom, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          opacity: 0.5,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
        <header className="mb-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-accent">Taro</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Component gallery
          </h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            Every surface in the warehouse simulator, one link each. Pages render the real
            components against generated warehouse data - nothing is mocked up.
          </p>
          <p className="mt-4 font-mono text-[11px] text-text-muted">
            {GALLERY.length} components · the-warehouse-decision-lab
          </p>
        </header>

        <div className="space-y-12">
          {GALLERY_GROUPS.map((group) => {
            const entries = GALLERY.filter((entry) => entry.group === group.id);
            if (entries.length === 0) return null;
            return (
              <section key={group.id}>
                <div className="mb-4 flex items-baseline justify-between border-b border-border-subtle pb-2">
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-text-primary">
                    {group.id}
                  </h2>
                  <p className="text-[11px] text-text-muted">{group.blurb}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <Card key={entry.slug} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
