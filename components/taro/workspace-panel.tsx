'use client';

import type { WorkspaceWarehouse } from '@/lib/taro/types';
import { Layers, Plus, GitCompareArrows, Warehouse as WarehouseIcon } from 'lucide-react';

export interface Comparison {
  id: string;
  name: string;
}

interface WorkspacePanelProps {
  // App header
  onBackToDashboard?: () => void;
  projectName: string;
  importSummary: string;

  // Warehouses
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  selectedWarehouseIds: Set<string>;
  onSelectWarehouse: (id: string, opts?: { additive?: boolean }) => void;

  // Comparisons (placeholder)
  comparisons: Comparison[];

  // Actions
  onAddWarehouse: () => void;
  onNewComparison: () => void;
}

export function WorkspacePanel(props: WorkspacePanelProps) {
  return (
    <div className="w-72 border-r border-border bg-background flex flex-col">
      {/* App header: Logo + Project name */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border shrink-0">
        {props.onBackToDashboard ? (
          <button
            onClick={props.onBackToDashboard}
            title="Back to dashboard"
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src="/taro%20transpara%20svg.svg"
              alt="Taro logo"
              width={28}
              height={28}
              className="rounded"
            />
          </button>
        ) : (
          <div className="shrink-0 opacity-70">
            <img
              src="/taro%20transpara%20svg.svg"
              alt="Taro logo"
              width={28}
              height={28}
              className="rounded"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground truncate">
            {props.projectName}
          </div>
          {props.importSummary && (
            <div className="text-[10px] text-emerald-600 truncate leading-tight">
              {props.importSummary}
            </div>
          )}
        </div>
      </div>

      {/* Workspace body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5 min-h-0">
        {/* Warehouses section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              <WarehouseIcon className="h-3 w-3" />
              <span>Warehouses</span>
              <span className="text-muted-foreground/50 font-mono">({props.warehouses.length})</span>
            </div>
          </div>
          {props.warehouses.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1 py-2">
              No warehouses yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {props.warehouses.map((w) => {
                const isActive = w.id === props.activeWarehouseId;
                const isSelected = props.selectedWarehouseIds.has(w.id);
                return (
                  <li key={w.id}>
                    <button
                      onClick={(e) => props.onSelectWarehouse(w.id, { additive: e.shiftKey })}
                      className={`
                        w-full text-left px-2 py-1.5 rounded-md text-xs truncate
                        flex items-center gap-2 transition-colors
                        ${isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : isSelected
                            ? 'bg-primary/5 text-foreground ring-1 ring-primary/30'
                            : 'text-foreground hover:bg-muted'
                        }
                      `}
                      title={w.name}
                    >
                      <span
                        className={`
                          inline-block w-1.5 h-1.5 rounded-full shrink-0
                          ${isActive ? 'bg-primary' : isSelected ? 'bg-primary/50' : 'bg-muted-foreground/30'}
                        `}
                      />
                      <span className="truncate">{w.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Comparisons section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              <GitCompareArrows className="h-3 w-3" />
              <span>Comparisons</span>
              <span className="text-muted-foreground/50 font-mono">({props.comparisons.length})</span>
            </div>
          </div>
          {props.comparisons.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-1 py-2">
              No comparisons yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {props.comparisons.map((c) => (
                <li key={c.id}>
                  <div
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs truncate
                      flex items-center gap-2 text-foreground hover:bg-muted transition-colors cursor-default"
                    title={c.name}
                  >
                    <Layers className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer: action buttons */}
      <div className="p-3 border-t border-border shrink-0 space-y-1.5">
        <button
          onClick={props.onAddWarehouse}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
            text-foreground hover:bg-muted active:bg-muted/80 transition-colors
            border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Warehouse
        </button>
        <button
          onClick={props.onNewComparison}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
            text-foreground hover:bg-muted active:bg-muted/80 transition-colors
            border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
        >
          <Plus className="h-3.5 w-3.5" />
          New Comparison
        </button>
      </div>
    </div>
  );
}
