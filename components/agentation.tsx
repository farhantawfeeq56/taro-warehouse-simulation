'use client';

import { Agentation } from 'agentation';

/**
 * Dev-only visual feedback toolbar (bottom-right). Click an element to
 * annotate it and copy structured output (selectors, paths, classes) that
 * helps AI coding agents locate the exact code.
 *
 * Only rendered when NODE_ENV === 'development' so it never ships to prod.
 */
export function AgentationToolbar() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Agentation />;
}
