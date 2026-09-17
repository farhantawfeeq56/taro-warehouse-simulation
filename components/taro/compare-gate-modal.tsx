'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { GitCompareArrows, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CompareGateState =
  | {
      /** Single warehouse — user clicked Compare with nothing to compare against. */
      mode: 'single';
      warehouseName: string;
    }
  | {
      /** Duplicate warehouses — identical layouts, comparison is meaningless. */
      mode: 'duplicates';
      groups: { id: string; name: string }[][];
    };

interface CompareGateModalProps {
  state: CompareGateState | null;
  onClose: () => void;
  onAddWarehouse: () => void;
  /** Navigate to a warehouse (closes the modal, scrolls to it). */
  onNavigate: (id: string) => void;
}

export function CompareGateModal({ state, onClose, onAddWarehouse, onNavigate }: CompareGateModalProps) {
  return (
    <AlertDialog open={!!state} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                state?.mode === 'duplicates' ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent',
              )}
            >
              {state?.mode === 'duplicates'
                ? <AlertTriangle className="size-5" />
                : <GitCompareArrows className="size-5" />}
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-base">
                {state?.mode === 'duplicates' ? 'Identical warehouses' : 'Nothing to compare'}
              </AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-3 text-sm leading-relaxed">
          {state?.mode === 'single' ? (
            <p>
              You have only one warehouse — <span className="font-medium text-foreground">{state.warehouseName}</span>.
              Comparison needs at least two different warehouses to be meaningful.
              Add another warehouse to compare against, or go back.
            </p>
          ) : state && (
            <>
              <p>These warehouses are identical — comparing them would show no differences:</p>
              <ul className="space-y-1.5">
                {state.groups.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {g.map((w, j) => (
                      <span key={w.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onNavigate(w.id)}
                          className="font-semibold text-primary underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          {w.name}
                        </button>
                        {j < g.length - 1 && <span className="text-muted-foreground">and</span>}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How to make them different</p>
                <p>Click a warehouse above to go to it, then use <span className="font-medium text-foreground">Edit</span> in its bottom dock to change the layout or inventory — then Compare again.</p>
              </div>
            </>
          )}
        </AlertDialogDescription>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Back</AlertDialogCancel>
          {state?.mode === 'single' && (
            <AlertDialogAction onClick={onAddWarehouse}>Add another warehouse</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
