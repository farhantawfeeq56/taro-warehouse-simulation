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
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  const { totalItems, missingItems, affectedOrders, missingItemsByOrder } = validationContext;
  const canSimulatePartial = missingItems < totalItems;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {canSimulatePartial ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <div className="h-5 w-5 flex items-center justify-center">
                  <span className="text-lg">🚫</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg">
                {canSimulatePartial
                  ? 'Some items not found in warehouse'
                  : 'Cannot simulate - no valid items found'}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                {canSimulatePartial ? (
                  <>
                    The simulation can still run, but missing items will be excluded from the results.
                  </>
                ) : (
                  <>
                    None of the items in your orders exist in the warehouse. Please add items to shelves
                    or update your orders before simulating.
                  </>
                )}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{totalItems}</div>
              <div className="text-xs text-muted-foreground">Total Items</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${canSimulatePartial ? 'text-amber-600' : 'text-destructive'}`}>
                {missingItems}
              </div>
              <div className="text-xs text-muted-foreground">Missing Items</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${canSimulatePartial ? 'text-amber-600' : 'text-destructive'}`}>
                {affectedOrders}
              </div>
              <div className="text-xs text-muted-foreground">Affected Orders</div>
            </div>
          </div>

          {/* Missing items details */}
          {missingItemsByOrder.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Missing Items by Order
              </h3>
              <div className="border border-border rounded-lg overflow-hidden">
                {missingItemsByOrder.map((orderResult, idx) => (
                  <div
                    key={`${orderResult.orderId}-${idx}`}
                    className={`
                      px-3 py-2 flex flex-col gap-1
                      ${idx > 0 ? 'border-t border-border' : ''}
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{orderResult.orderId}</span>
                      <Badge variant="outline" className="text-xs">
                        {orderResult.missingItemIds.length} missing
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {orderResult.missingItemIds.map(itemId => (
                        <Badge
                          key={itemId}
                          variant="secondary"
                          className="text-xs font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          {itemId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid items note */}
          {canSimulatePartial && (
            <div className="flex items-start gap-2 p-3 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-300/70 dark:border-emerald-800/50 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800 dark:text-emerald-300">
                <strong className="font-semibold">Partial simulation:</strong> {totalItems - missingItems} of {totalItems} items
                will be simulated. Results will reflect the reduced item count.
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onFixItems} className="flex-1">
            {canSimulatePartial ? 'Fix items first' : 'Close'}
          </AlertDialogCancel>
          {canSimulatePartial && (
            <AlertDialogAction onClick={onSimulateAnyway} className="flex-1 bg-amber-600 hover:bg-amber-700">
              Simulate anyway
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
