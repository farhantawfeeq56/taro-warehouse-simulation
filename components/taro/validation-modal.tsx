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
}

export function ValidationModal({
  open,
  validationContext,
  onClose,
  onFixItems,
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
              <AlertDialogTitle className="text-lg">Items missing from layout</AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="space-y-3 text-sm">
          <p>The simulation cannot start because some items in your orders are not placed in the warehouse layout:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{missingItems} items cannot be resolved</li>
            <li>{affectedOrders} orders affected</li>
          </ul>
          <p className="font-medium text-foreground">Please place these items on the layout to enable simulation.</p>
        </AlertDialogDescription>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onFixItems} className="w-full">
            Identify and fix items
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
