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

export type CompareGateState =
  | {
      /** Single warehouse — user clicked Compare with nothing to compare against. */
      mode: 'single';
      warehouseName: string;
    }
  | {
      /** Duplicate warehouses — identical layouts, comparison is meaningless. */
      mode: 'duplicates';
      groups: { names: string[] }[];
    };

interface CompareGateModalProps {
  state: CompareGateState | null;
  onClose: () => void;
  onAddWarehouse: () => void;
}

export function CompareGateModal({ state, onClose, onAddWarehouse }: CompareGateModalProps) {
  return (
    <AlertDialog open={!!state} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {state?.mode === 'duplicates'
                ? <AlertTriangle className="h-5 w-5 text-warning" />
                : <GitCompareArrows className="h-5 w-5 text-warning" />}
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg">
                {state?.mode === 'duplicates' ? 'Identical warehouses' : 'Nothing to compare'}
              </AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-3 text-sm">
          {state?.mode === 'single' ? (
            <p>
              You have only one warehouse — <span className="font-medium text-foreground">{state.warehouseName}</span>.
              Comparison needs at least two different warehouses to be meaningful.
              Add another warehouse to compare against, or go back.
            </p>
          ) : state && (
            <>
              <p>These warehouses are identical — comparing them would show no differences:</p>
              <ul className="list-disc pl-5 space-y-1">
                {state.groups.map((g, i) => (
                  <li key={i}>{g.names.join(' and ')}</li>
                ))}
              </ul>
              <p className="font-medium text-foreground">
                Change the layout of one of them (or its inventory) to make the comparison meaningful.
              </p>
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
