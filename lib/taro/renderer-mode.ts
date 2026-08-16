/**
 * Temporary A/B/C renderer experiment.
 *
 * This module is a throwaway harness for comparing three rendering
 * strategies of the warehouse node. It will be deleted once the experiment
 * concludes. It intentionally does NOT change the warehouse data model, the
 * React Flow viewport, or the simulation logic.
 */

/** The three rendering variants under test. */
export type RendererMode = 'A' | 'B' | 'C';

/** Human-readable labels for the indicator badge. */
export const RENDERER_MODE_LABELS: Record<RendererMode, string> = {
  A: 'Baseline',
  B: 'Canvas',
  C: 'SVG',
};

/**
 * True when the event target is an editable control. Used to make the
 * keyboard shortcut safe: pressing A/B/C while typing in an input, textarea,
 * or contenteditable must NOT switch renderers.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Subscribes to `keydown` on `window` and calls `onChange` when one of the
 * renderer keys (A/B/C, case-insensitive) is pressed outside an editable
 * control. Returns an unsubscribe function.
 */
export function subscribeRendererKeys(
  onChange: (mode: RendererMode) => void,
): () => void {
  const KEYS: Record<string, RendererMode> = {
    a: 'A',
    b: 'B',
    c: 'C',
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditableTarget(e.target)) return;
    const mode = KEYS[e.key.toLowerCase()];
    if (mode) {
      e.preventDefault();
      onChange(mode);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
