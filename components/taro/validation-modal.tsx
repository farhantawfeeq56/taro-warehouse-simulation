'use client';

import type { SimulationValidationContext } from '@/lib/taro/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface ValidationModalProps {
  open: boolean;
  validationContext: SimulationValidationContext;
  onClose: () => void;
  onFixItems: () => void;
  onSimulateAnyway: () => void;
}

export function ValidationModal({
  open,
  validationContext,
  onClose,
  onFixItems,
  onSimulateAnyway,
}: ValidationModalProps) {
  const { missingItems, affectedOrders } = validationContext;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg">Some items are missing from layout</AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-1 text-sm">
          <p>{missingItems} items cannot be resolved</p>
          <p>{affectedOrders} orders affected</p>
          <p>Simulation will ignore these items. Results may underestimate distance, time, and cost.</p>
        </AlertDialogDescription>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onFixItems} className="flex-1">
            Fix items first
          </AlertDialogCancel>
          <AlertDialogAction onClick={onSimulateAnyway} className="flex-1 bg-amber-600 hover:bg-amber-700">
            Simulate anyway (partial results)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
