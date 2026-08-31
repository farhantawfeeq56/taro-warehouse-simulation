'use client';

import { Agentation } from 'agentation';

/**
 * Visual feedback toolbar (bottom-right) — click an element to annotate it
 * and copy structured selectors/paths for AI coding agents.
 *
 * `enabled` is computed in the server layout from Vercel env, so this stays
 * out of production:
 *   • Vercel Preview deployment → true
 *   • Local dev (npm run dev)    → true
 *   • Vercel Production / prod build → false
 */
export function AgentationToolbar({ enabled }: { enabled?: boolean }) {
  if (!enabled) return null;
  return <Agentation />;
}
