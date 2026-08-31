'use client';

/**
 * AiSuggestion — the AI experiment suggestion, deliberately NOT a card in
 * the page flow. After the comparison auto-runs, the recommender studies the
 * results (heuristic engine in lib/taro/experiment-recommendation.ts — mock
 * AI, no LLM) and this component surfaces the suggestion in one of 5 light
 * forms, switched by the floating segmented toolbar bottom-right (keys 1–5):
 *
 *   1 Banner  — slim strip pinned at the top of the page
 *   2 Bubble  — floating sparkle button (bottom-left) expanding a popover
 *   3 Rail    — vertical tab on the right edge sliding out a panel
 *   4 Toast   — slim bar fixed bottom-center, expands on click
 *   5 Line    — one quiet line above the rankings
 *
 * The Generate flow (constraint input → generate → confirmation) lives
 * inside the opened surface in every variant, alongside the "this is just an
 * experiment" disclaimer — always present, non-negotiable.
 */

import { useMemo, useState } from 'react';
import { FlaskConical, Sparkles, X } from 'lucide-react';
import {
  generateExperiment,
  type ExperimentRecommendation,
  type WarehouseInsight,
} from '@/lib/taro/experiment-recommendation';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/interior/loading-button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface AiSuggestionProps {
  /** Every warehouse in the comparison, with its simulation results. */
  insights: WarehouseInsight[];
  isRunning: boolean;
  /** Generates the experiment warehouse and adds it to the workspace. */
  onGenerate: (
    constraintsRaw: string,
    recommendation: ExperimentRecommendation,
  ) => Promise<void>;
  /** vartest5: which suggestion form to render (1–5). */
  variant: 1 | 2 | 3 | 4 | 5;
  /** vartest5: parent (CompareView) owns the variant state + keyboard. */
  onVariantChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}

const AXIS_META: Record<string, { label: string; tone: string }> = {
  capacity: { label: 'More capacity', tone: 'border-border bg-muted text-muted-foreground' },
  throughput: { label: 'Denser storage', tone: 'border-border bg-muted text-muted-foreground' },
  density: { label: 'Denser layout', tone: 'border-border bg-muted text-muted-foreground' },
  'inventory-fit': { label: 'Better fit', tone: 'border-border bg-muted text-muted-foreground' },
  placement: { label: 'Smarter slotting', tone: 'border-border bg-muted text-muted-foreground' },
};

export function AiSuggestion({
  insights,
  isRunning,
  onGenerate,
  variant = 1,
  onVariantChange,
}: AiSuggestionProps) {
  const recommendation = useMemo(() => {
    if (insights.length === 0) return null;
    return generateExperiment(insights, '');
  }, [insights]);

  const [open, setOpen] = useState(false);
  const [showConstraintStep, setShowConstraintStep] = useState(false);
  const [constraintsRaw, setConstraintsRaw] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedName, setGeneratedName] = useState<string | null>(null);

  const handleGenerate = async (constraints: string) => {
    if (!recommendation) return;
    setError(null);
    setIsGenerating(true);
    try {
      // Re-run the engine WITH the user's constraints — the recommendation
      // may change (e.g. a max-rack constraint clamps the suggestion).
      const withConstraints = generateExperiment(insights, constraints);
      await onGenerate(constraints, withConstraints);
      setGeneratedName(`Experiment — ${withConstraints.axis}`);
    } catch (err) {
      console.error('Failed to generate experiment:', err);
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const axMeta = recommendation ? AXIS_META[recommendation.axis] : undefined;
  const hasResults = insights.length > 0;

  // Nothing to suggest yet — render nothing (auto-run fills results quickly).
  if (!hasResults || isRunning || !recommendation) return null;

  // Shared detail surface: why, changes, disclaimer, generate flow.
  const detail = recommendation.constrainedToNoChange ? (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-foreground">{recommendation.recommendation}</p>
      <p className="text-muted-foreground">{recommendation.rationale}</p>
    </div>
  ) : (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {axMeta && (
          <Badge variant="outline" className={cn('text-[10px]', axMeta.tone)}>
            {axMeta.label}
          </Badge>
        )}
        {recommendation.details.changes.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {recommendation.details.changes.map((change) => (
              <Badge key={change} variant="secondary" className="text-[10px]">
                {change}
              </Badge>
            ))}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{recommendation.why}</p>
      {recommendation.details.constraints.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Constraints: {recommendation.details.constraints.join('; ')}
        </p>
      )}

      {/* The experiment disclaimer — always present, non-negotiable. */}
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft/60 px-3 py-2">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-[11px] leading-relaxed text-warning">
          <span className="font-semibold">This is just an experiment.</span> It is not a
          guarantee. The AI is hypothesizing what might improve things based on your
          current warehouses. Add it, run the comparison again, and judge by the numbers.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {!showConstraintStep && !generatedName && (
        <div className="flex flex-wrap gap-2">
          <LoadingButton
            onAction={() => setShowConstraintStep(true)}
            disabled={isGenerating}
            tone="primary"
            className="gap-1.5"
          >
            Generate experiment
          </LoadingButton>
        </div>
      )}

      {showConstraintStep && !generatedName && (
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Any constraints for the experiment?</p>
            <button
              type="button"
              onClick={() => {
                setShowConstraintStep(false);
                setConstraintsRaw('');
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
          <Textarea
            value={constraintsRaw}
            onChange={(e) => setConstraintsRaw(e.target.value)}
            placeholder="e.g. max 12 racks, height at least 20, budget $4000… (or leave empty)"
            rows={2}
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <LoadingButton
              onAction={() => handleGenerate(constraintsRaw.trim())}
              disabled={isGenerating}
              pendingLabel="Generating…"
              successLabel="Generated"
              tone="primary"
              className="gap-1.5"
            >
              Generate
            </LoadingButton>
            <Button size="sm" variant="outline" onClick={() => handleGenerate('')} disabled={isGenerating}>
              No constraints
            </Button>
          </div>
        </div>
      )}

      {generatedName && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs">
            <p className="font-medium text-foreground">
              Generated "{generatedName}" — it's in your workspace now.
            </p>
            <p className="text-muted-foreground">
              Run the comparison again to test it against the others.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const header = (
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">AI experiment suggestion</span>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setShowConstraintStep(false);
          setConstraintsRaw('');
        }}
        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <>
      {/* ── V1 · Banner — slim strip at the top of the page ─────────────── */}
      {variant === 1 && (
        <div className="rounded-md border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-sm text-foreground">
              <span className="font-semibold">AI suggests:</span>{' '}
              <span className="text-muted-foreground">{recommendation.shortSummary}</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Close' : 'Details'}
            </Button>
          </div>
          {open && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {header}
              {detail}
            </div>
          )}
        </div>
      )}

      {/* ── V2 · Bubble — floating button bottom-left with popover ──────── */}
      {variant === 2 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title="AI suggestion"
            className="fixed bottom-4 left-4 z-[120] flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105"
          >
            <Sparkles className="h-5 w-5" />
          </button>
          {open && (
            <div className="fixed bottom-16 left-4 z-[120] max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl">
              {header}
              <div className="mt-3">{detail}</div>
            </div>
          )}
        </>
      )}

      {/* ── V3 · Rail — vertical tab on the right edge, slide-out panel ─── */}
      {variant === 3 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title="AI suggestion"
            className="fixed right-0 top-1/2 z-[120] -translate-y-1/2 rounded-l-md bg-foreground px-2 py-4 text-[10px] font-semibold uppercase tracking-widest text-background shadow-lg"
          >
            AI
          </button>
          {open && (
            <div className="fixed bottom-0 right-0 top-0 z-[110] w-80 overflow-y-auto border-l border-border bg-surface p-5 shadow-xl">
              {header}
              <div className="mt-3">{detail}</div>
            </div>
          )}
        </>
      )}

      {/* ── V4 · Toast — slim bar fixed bottom-center ───────────────────── */}
      {variant === 4 && (
        <>
          <div className="fixed bottom-4 left-1/2 z-[120] flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-lg">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 truncate text-sm text-foreground">
              <span className="font-semibold">AI suggests:</span>{' '}
              <span className="text-muted-foreground">{recommendation.shortSummary}</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
              {open ? 'Close' : 'Generate'}
            </Button>
          </div>
          {open && (
            <div className="fixed bottom-16 left-1/2 z-[120] max-h-[70vh] w-[26rem] max-w-[90vw] -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl">
              {header}
              <div className="mt-3">{detail}</div>
            </div>
          )}
        </>
      )}

      {/* ── V5 · Line — one quiet line above the rankings ──────────────── */}
      {variant === 5 && (
        <div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">AI suggests:</span>{' '}
            {recommendation.shortSummary}{' '}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {open ? 'hide' : 'details'}
            </button>
          </p>
          {open && (
            <div className="mt-3 space-y-3 rounded-md border border-border bg-surface p-4">
              {header}
              {detail}
            </div>
          )}
        </div>
      )}

      {/* vartest5: floating segmented toolbar — switches the suggestion form (keys 1–5). */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[130] flex items-center gap-1.5">
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
          AI 1–5
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shadow-lg">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onVariantChange(v as 1 | 2 | 3 | 4 | 5)}
              title={`AI suggestion form ${v}`}
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold transition-colors',
                variant === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
