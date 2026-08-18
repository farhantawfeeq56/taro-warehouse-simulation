'use client';

/**
 * Section tabs — shared tab bar for option groups (Geometry / Inventory /
 * Placement). vartest5: five tab-navigation visual directions, switched by
 * a floating segmented toolbar (bottom-right, keys 1–5).
 *   1. Pills     — rounded pill tabs, active = filled accent
 *   2. Ruled     — underline ruler, active tab shows a bottom bar
 *   3. Segmented — one shared track, active segment is a raised chip
 *   4. Deck      — three side-by-side tab cards, active one lifts
 *   5. Stepped   — numbered step tabs joined by a rail
 */

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface SectionTab {
  id: string;
  title: string;
  icon: LucideIcon;
  subtitle: string;
}

export type TabVariant = 1 | 2 | 3 | 4 | 5;

/**
 * Tab bar — five visual directions for the same set of tabs.
 * 1 = Pills · 2 = Ruled · 3 = Segmented · 4 = Deck · 5 = Stepped.
 */
export function TabBar({
  cards,
  active,
  onSelect,
  variant,
}: {
  cards: SectionTab[];
  active: string;
  onSelect: (id: string) => void;
  variant: TabVariant;
}) {
  const base = 'flex-1 min-w-0 text-left transition-all duration-200';

  if (variant === 5) {
    // Stepped — numbered chips joined by a rail; the active step pops.
    return (
      <div className="flex items-stretch gap-0 p-0.5">
        {cards.map((c, i) => {
          const Icon = c.icon;
          const isActive = active === c.id;
          return (
            <div key={c.id} className="flex flex-1 min-w-0 items-center">
              {i > 0 && (
                <div
                  className={cn(
                    'h-px w-3 shrink-0 transition-colors',
                    isActive || cards.findIndex((x) => x.id === active) >= i
                      ? 'bg-accent'
                      : 'bg-border-default'
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                title={`${c.title} — ${c.subtitle}`}
                className={cn(
                  base,
                  'flex items-center justify-center gap-1.5 rounded-lg py-1.5',
                  isActive ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-muted hover:text-text-primary'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    isActive ? 'bg-accent text-accent-soft' : 'bg-muted text-text-muted'
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate text-[11px] font-semibold">{c.title}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 4) {
    // Deck — three side-by-side tab cards; the active one lifts.
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {cards.map((c) => {
          const Icon = c.icon;
          const isActive = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all duration-200',
                isActive
                  ? 'border-accent/60 bg-accent-subtle shadow-sm -translate-y-px'
                  : 'border-border-default bg-surface hover:border-accent/40'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md',
                  isActive ? 'bg-accent text-accent-soft' : 'bg-accent-soft text-accent'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className={cn('text-[11px] font-bold truncate', isActive ? 'text-text-primary' : 'text-text-secondary')}>
                {c.title}
              </span>
              {isActive && <span className="text-[9px] text-text-muted truncate">{c.subtitle}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 3) {
    // Segmented — one shared track; the active segment is a raised chip.
    return (
      <div className="flex gap-1 rounded-xl border border-border-default bg-muted/40 p-1">
        {cards.map((c) => {
          const Icon = c.icon;
          const isActive = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                base,
                'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5',
                isActive ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-accent' : '')} />
              <span className="truncate text-[11px] font-semibold">{c.title}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 2) {
    // Ruled — underline ruler; active tab gets a bottom bar.
    return (
      <div className="flex border-b border-border-default">
        {cards.map((c) => {
          const Icon = c.icon;
          const isActive = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                base,
                'relative flex items-center justify-center gap-1.5 px-2.5 pb-2 pt-1',
                isActive ? 'text-accent' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[11px] font-bold">{c.title}</span>
              {isActive && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Pills (default) — rounded pill tabs, active = filled accent.
  return (
    <div className="flex gap-1.5">
      {cards.map((c) => {
        const Icon = c.icon;
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200',
              isActive
                ? 'border-accent bg-accent text-accent-soft shadow-sm'
                : 'border-border-default bg-surface text-text-muted hover:border-accent/40 hover:text-text-primary'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-[11px] font-bold">{c.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Floating segmented toolbar — bottom-right, keyboard-driven (1–5). */
export function TabVariantToolbar({
  active,
  onSelect,
}: {
  active: TabVariant;
  onSelect: (v: TabVariant) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[120] flex items-center gap-0.5 rounded-full border border-border-default bg-surface shadow-lg px-1.5 py-1">
      {([1, 2, 3, 4, 5] as TabVariant[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          title={`Tab direction ${v}`}
          className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold transition-colors',
            active === v ? 'bg-accent text-accent-soft' : 'text-text-muted hover:bg-muted hover:text-text-primary'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
