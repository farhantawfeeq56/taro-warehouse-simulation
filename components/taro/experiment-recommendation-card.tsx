'use client';

/**
 * AiSuggestion — the AI experiment suggestion as a quiet nudge placed BELOW
 * the rankings on the compare page. It is deliberately not a big card in the
 * flow: just a small line inviting the user to look at a recommended
 * experiment. Clicking it expands the full recommendation downward (axis +
 * changes, why, disclaimer, generate flow).
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Sparkles, X } from 'lucide-react';
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
}

const AXIS_META: Record<string, { label: string; tone: string }> = {
  capacity: { label: 'More capacity', tone: 'border-border bg-muted text-muted-foreground' },
  throughput: { label: 'Denser storage', tone: 'border-border bg-muted text-muted-foreground' },
  density: { label: 'Denser layout', tone: 'border-border bg-muted text-muted-foreground' },
  'inventory-fit': { label: 'Better fit', tone: 'border-border bg-muted text-muted-foreground' },
  placement: { label: 'Smarter slotting', tone: 'border-border bg-muted text-muted-foreground' },
};

export function AiSuggestion({ insights, isRunning, onGenerate }: AiSuggestionProps) {
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

  const close = () => {
    setOpen(false);
    setShowConstraintStep(false);
    setConstraintsRaw('');
  };

  return (
    <div className="border-t border-border pt-4">
      {/* The nudge — one quiet line. */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-2 text-left text-sm text-muted-foreground"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span>
            The AI has a recommended experiment.{' '}
            <span className="font-medium text-primary underline-offset-2 group-hover:underline">
              View it
            </span>
          </span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          {/* Expanded header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Recommended experiment</h3>
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
              title="No model or API call — a fixed rule-based heuristic over your comparison numbers."
            >
              Mock AI
            </Badge>
            <button
              type="button"
              onClick={close}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Collapse
            </button>
          </div>

          <div className="p-4 space-y-4">
            {recommendation.constrainedToNoChange ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{recommendation.recommendation}</p>
                <p className="text-muted-foreground">{recommendation.rationale}</p>
              </div>
            ) : (
              <>
                {/* Recommendation body */}
                <div className="space-y-2">
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
                  <p className="text-base font-semibold leading-relaxed text-foreground">
                    {recommendation.shortSummary}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {recommendation.why}
                  </p>
                  {recommendation.details.constraints.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Constraints: {recommendation.details.constraints.join('; ')}
                    </p>
                  )}
                </div>

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

                {/* Constraint step (inline) OR the generate button. */}
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
                      <p className="text-xs font-medium text-foreground">
                        Any constraints for the experiment?
                      </p>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerate('')}
                        disabled={isGenerating}
                      >
                        No constraints
                      </Button>
                    </div>
                  </div>
                )}

                {/* Post-generate confirmation. */}
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
