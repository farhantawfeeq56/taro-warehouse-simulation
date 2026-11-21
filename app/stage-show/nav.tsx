'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const SHOTS = [
  { n: '1', label: 'Bento' },
  { n: '2', label: 'Simulate click' },
  { n: '3', label: 'Compare' },
  { n: '4', label: 'Layouts' },
  { n: '5', label: 'AI suggestion' },
  { n: '6', label: 'Everything' },
  { n: '7', label: 'Flow' },
];

/** Floating switcher — keys 1–5 jump between versions. */
export function StageNav() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const shot = SHOTS.find((s) => s.n === e.key);
      if (shot) router.push(`/stage-show/${shot.n}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="shot-nav" role="navigation" aria-label="Stage show versions">
      <Link href="/stage-show" className="shot-nav-home">
        Stage show
      </Link>
      <div className="shot-nav-seg" role="tablist" aria-label="Versions">
        {SHOTS.map((s) => {
          const active = pathname === `/stage-show/${s.n}`;
          return (
            <Link
              key={s.n}
              href={`/stage-show/${s.n}`}
              role="tab"
              aria-selected={active}
              data-on={active || undefined}
              className="shot-nav-item"
              title={`${s.label} (press ${s.n})`}
            >
              <span className="shot-nav-key">{s.n}</span>
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
