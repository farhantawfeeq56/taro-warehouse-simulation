'use client';

/**
 * Comparison dock — a compact left dock below the workspace dock.
 *
 * Holds the comparison content (previously the right sidebar's
 * ComparisonPanel). A single icon toggles an expandable panel outward
 * that hosts the same ComparisonPanel content.
 */

import { useEffect, useState } from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Comparison, ComparisonRunResult, WorkspaceWarehouse } from '@/lib/taro/types';
import { ComparisonPanel } from './comparison-panel';

interface ComparisonDockProps {
  comparison: Comparison | null;
  warehouses: WorkspaceWarehouse[];
  results: ComparisonRunResult[] | null;
  isRunning: boolean;
  isStale?: boolean;
  allWarehouseNames: Record<string, string>;
  onRun: (comparisonId: string) => void;
  onAddWarehouse: (comparisonId: string, warehouseId: string) => void;
  onRemoveWarehouse: (comparisonId: string, warehouseId: string) => void;
}

export function ComparisonDock(props: ComparisonDockProps) {
  const [dockOpen, setDockOpen] = useState(false);

  // Escape closes the dock panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-open when a comparison becomes active.
  useEffect(() => {
    if (props.comparison) setDockOpen(true);
  }, [props.comparison?.id]);

  /* ── Layout ───────────────────────────────────────────────────────── */

  return (
    <>
      {/* Click-outside overlay — closes the dock panel (kept under the dock) */}
      {dockOpen && <div className="fixed inset-0 z-30" onClick={() => setDockOpen(false)} />}

      {/* Comparison dock — below the workbench dock */}
      <div className="fixed left-0 top-[300px] z-40 flex items-start p-2">
        {/* Dock — compact icon cluster */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border-default bg-surface shadow-lg px-1.5 py-2">
          <button
            onClick={() => setDockOpen(!dockOpen)}
            title="Comparison"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              dockOpen
                ? 'bg-accent-soft text-accent'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <GitCompareArrows className="h-4 w-4" />
          </button>
        </div>

        {/* Mini panel — expands OUTWARD from the dock (hugging the left edge) */}
        <div
          className={cn(
            'flex h-96 w-[300px] flex-col overflow-hidden rounded-xl border border-border-default bg-[#F4F4F2] shadow-2xl transition-all duration-300',
            dockOpen ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center justify-between border-b border-border-default px-2.5 py-2 shrink-0">
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              <GitCompareArrows className="h-3 w-3" />
              Comparison
            </span>
            <button
              onClick={() => setDockOpen(false)}
              title="Close (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {props.comparison ? (
              <ComparisonPanel
                comparison={props.comparison}
                warehouses={props.warehouses}
                results={props.results}
                isRunning={props.isRunning}
                isStale={props.isStale}
                allWarehouseNames={props.allWarehouseNames}
                onRun={props.onRun}
                onAddWarehouse={props.onAddWarehouse}
                onRemoveWarehouse={props.onRemoveWarehouse}
              />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                Select a comparison to view it.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
