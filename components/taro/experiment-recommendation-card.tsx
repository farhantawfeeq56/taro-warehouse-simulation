'use client';

/**
 * ExperimentRecommendationCard — the "AI" block inside CompareView.
 *
 * After a comparison run produces results, this card:
 *   1. Studies the results + configurations (heuristic engine in
 *      lib/taro/experiment-recommendation.ts — mock AI, no LLM).
 *   2. Shows the recommended experiment with an explicit "this is just an
 *      experiment" disclaimer and a rationale.
 *   3. On "Generate", asks for constraints (free text OR "No constraints").
 *   4. Generates a real warehouse via the existing session pipeline and
 *      hands it up to TaroApp, which adds it to the workspace and opens it.
 *
 * vartest5: the recommendation body has 5 presentations that match the
 * table-led compare screen, switched by the floating segmented control in
 * the bottom-right corner (keys 1–5):
 *   1 Hero    — headline + one-liner (kept from before)
 *   2 Rows    — the recommendation as stacked label → value rows
 *   3 Table   — a two-column fact table (Axis / Why / What / Changes)
 *   4 Cards   — the three parts as small cards
 *   5 Verdict — a single verdict sentence + change badges
 */

import { useMemo, useState } from 'react';
import { FlaskConical, Sparkles, X } from 'lucide-react';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
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

interface ExperimentRecommendationCardProps {
  /** Every warehouse in the comparison, with its simulation results. */
  insights: WarehouseInsight[];
  isRunning: boolean;
  /** Generates the experiment warehouse and adds it to the workspace. */
  onGenerate: (
    constraintsRaw: string,
    recommendation: ExperimentRecommendation,
  ) => Promise<void>;
  /** vartest5: which presentation variant to render (1–5). */
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

export function ExperimentRecommendationCard({
  insights,
  isRunning,
  onGenerate,
  variant = 1,
  onVariantChange,
}: ExperimentRecommendationCardProps) {
  // Preview recommendation (no constraints yet) — recompute when results land.
  const recommendation = useMemo(() => {
    if (insights.length === 0) return null;
    return generateExperiment(insights, '');
  }, [insights]);

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

  return (
    <section className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">AI experiment suggestion</h2>
        <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">
          mock AI · heuristic engine
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        {!hasResults || isRunning || !recommendation ? (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Run the comparison above and the AI will study your warehouses to suggest
              the most promising experiment to test next.
            </p>
          </div>
        ) : recommendation.constrainedToNoChange ? (
          <div className="flex items-start gap-3 text-sm">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">{recommendation.recommendation}</p>
              <p className="text-muted-foreground">{recommendation.rationale}</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── vartest5: the recommendation body, 5 presentations ── */}
            {variant === 1 && (
              <div className="space-y-3">
                {axMeta && (
                  <Badge variant="outline" className={cn('text-[10px]', axMeta.tone)}>
                    {axMeta.label}
                  </Badge>
                )}
                <p className="text-base font-semibold leading-relaxed text-foreground">
                  {recommendation.shortSummary}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {recommendation.why}
                </p>
                {recommendation.details.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recommendation.details.changes.map((change) => (
                      <Badge key={change} variant="secondary" className="text-[10px]">
                        {change}
                      </Badge>
                    ))}
                  </div>
                )}
                {recommendation.details.constraints.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Constraints: {recommendation.details.constraints.join('; ')}
                  </p>
                )}
              </div>
            )}

            {variant === 2 && (
              <div className="divide-y divide-border rounded-lg border border-border">
                {[
                  { label: 'Axis', value: axMeta?.label ?? recommendation.axis },
                  { label: 'From', value: recommendation.seedWarehouseName },
                  { label: 'Suggestion', value: recommendation.shortSummary },
                  { label: 'Why', value: recommendation.why },
                ].map((row) => (
                  <div key={row.label} className="flex items-start gap-4 px-3 py-2.5">
                    <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="text-sm text-foreground">{row.value}</span>
                  </div>
                ))}
                {recommendation.details.changes.length > 0 && (
                  <div className="flex items-start gap-4 px-3 py-2.5">
                    <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Changes
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {recommendation.details.changes.map((change) => (
                        <Badge key={change} variant="secondary" className="text-[10px]">
                          {change}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {variant === 3 && (
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-border/60">
                    <th className="w-24 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Axis
                    </th>
                    <td className="px-3 py-2.5">
                      {axMeta && (
                        <Badge variant="outline" className={cn('text-[10px]', axMeta.tone)}>
                          {axMeta.label}
                        </Badge>
                      )}
                      <span className="ml-2 text-xs text-muted-foreground">from {recommendation.seedWarehouseName}</span>
                    </td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className="w-24 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      What
                    </th>
                    <td className="px-3 py-2.5 font-medium text-foreground">{recommendation.shortSummary}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <th className="w-24 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Why
                    </th>
                    <td className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{recommendation.why}</td>
                  </tr>
                  <tr>
                    <th className="w-24 px-3 py-2.5 text-left align-top text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Changes
                    </th>
                    <td className="px-3 py-2.5">
                      {recommendation.details.changes.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {recommendation.details.changes.map((change) => (
                            <Badge key={change} variant="secondary" className="text-[10px]">
                              {change}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {variant === 4 && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Axis</p>
                  {axMeta && (
                    <Badge variant="outline" className={cn('mt-1.5 text-[10px]', axMeta.tone)}>
                      {axMeta.label}
                    </Badge>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-background p-3 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggestion</p>
                  <p className="mt-1.5 text-sm font-semibold leading-relaxed text-foreground">{recommendation.shortSummary}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 sm:col-span-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Why</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{recommendation.why}</p>
                </div>
                {recommendation.details.changes.length > 0 && (
                  <div className="rounded-lg border border-border bg-background p-3 sm:col-span-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Changes</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {recommendation.details.changes.map((change) => (
                        <Badge key={change} variant="secondary" className="text-[10px]">
                          {change}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {variant === 5 && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm font-semibold leading-relaxed text-foreground">
                    {recommendation.shortSummary}
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{recommendation.why}</p>
                {recommendation.details.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recommendation.details.changes.map((change) => (
                      <Badge key={change} variant="secondary" className="text-[10px]">
                        {change}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
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

      {/* vartest5: floating segmented toolbar — switches the AI presentation (keys 1–5). */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex items-center gap-1.5">
        <span className="rounded bg-surface/90 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
          AI 1–5
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-surface px-1 py-0.5 shadow-lg">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onVariantChange(v as 1 | 2 | 3 | 4 | 5)}
              title={`AI presentation variant ${v}`}
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
    </section>
  );
}
