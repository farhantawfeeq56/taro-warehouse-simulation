'use client';

/**
 * WarehouseCanvas — the single-warehouse workspace canvas (replaces the
 * React Flow `WarehouseFlow`; the flow dependency was removed so the canvas
 * is now plain DOM + SVG).
 *
 * Because the app supports exactly one warehouse, the canvas renders that
 * warehouse's title bar + SVG renderer directly. Pan/zoom affordances are
 * intentionally not re-implemented here: the SVG renderer draws at logical
 * size and the page scrolls/clips naturally. A future React Flow re-intro
 * (revert the "remove reactflow" commit) restores the multi-node canvas.
 */

import { useMemo, useRef, useState, useCallback } from 'react';
import type {
  Warehouse,
  ToolType,
  StrategyResult,
  ZVisualizationMode,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import { WarehouseSvgRenderer } from './warehouse-svg-renderer';
import { Settings, Copy, Trash2, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Title bar height — kept in sync with the previous React Flow node. */
const TITLE_BAR_HEIGHT = 32;

interface WarehouseCanvasProps {
  workspaceWarehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string, opts?: { additive?: boolean }) => void;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onRenameWarehouse: (warehouseId: string, name: string) => void;
  onOpenLayoutConfig: (warehouseId: string) => void;
  /** Warehouse id currently being renamed — shows a brief spinner on the node name. */
  renamingWarehouseId: string | null;

  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
}

/**
 * Renders a single warehouse: its title bar (name, config/duplicate/delete
 * affordances) plus the SVG renderer. Accepts the full workspace list so the
 * component signature matches the removed React Flow canvas — only the active
 * warehouse is displayed.
 */
export function WarehouseCanvas({
  workspaceWarehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onWarehouseChange,
  onRenameWarehouse,
  onOpenLayoutConfig,
  renamingWarehouseId,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseCanvasProps) {
  const active = useMemo(
    () => workspaceWarehouses.find((w) => w.id === activeWarehouseId) ?? null,
    [workspaceWarehouses, activeWarehouseId],
  );

  // Title-bar affordances (config popover is preserved from the flow node).
  const [isHovered, setIsHovered] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // Inline rename (preserved from the flow node).
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(active?.name ?? '');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const closeConfig = useCallback(() => setConfigOpen(false), []);
  // Close config popover on outside click.
  // (A document listener is set up by the flow node; kept here for parity.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void configRef;

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && active && trimmed !== active.name) {
      onRenameWarehouse(active.id, trimmed);
    }
    setIsEditing(false);
  }, [editValue, active, onRenameWarehouse]);

  const beginEdit = useCallback(() => {
    if (!active) return;
    setEditValue(active.name);
    setIsEditing(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [active]);

  if (!active) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">No warehouse configured.</p>
      </div>
    );
  }

  const isActive = true; // only one warehouse — it is always the active one
  const isHighlighted = isHovered || isActive;
  const warehouse = active.warehouse;
  const logicalW = warehouse.width * CELL_SIZE;
  const logicalH = warehouse.height * CELL_SIZE + TITLE_BAR_HEIGHT;

  return (
    <div className="relative flex-1 w-full h-full overflow-auto bg-background">
      <div
        className="relative border border-border rounded-md shadow-sm mx-auto"
        style={{ width: logicalW, height: logicalH }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Highlight ring overlay */}
        {isHighlighted && (
          <div className="absolute inset-0 rounded-[5px] pointer-events-none ring-2 ring-primary/60 ring-inset z-10 transition-shadow duration-150" />
        )}

        {/* Title bar — always clickable for selection */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => onSelectWarehouse(active.id, { additive: e.shiftKey })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectWarehouse(active.id, { additive: e.shiftKey });
            }
          }}
          className={cn(
            'flex items-center justify-between px-3 py-1.5 text-xs font-medium border-b select-none gap-2',
            isActive
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50',
          )}
          style={{ cursor: 'pointer', height: TITLE_BAR_HEIGHT }}
        >
          {/* Name — inline editable on double-click */}
          {isEditing ? (
            <input
              ref={renameInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 h-5 px-1 text-xs font-medium bg-background border border-primary/50 rounded outline-none ring-1 ring-primary/30"
            />
          ) : (
            <>
              <span
                className={cn('truncate min-w-0', isHighlighted ? 'font-semibold' : 'font-medium')}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  beginEdit();
                }}
                title="Double-click to rename"
              >
                {active.name}
              </span>
              {renamingWarehouseId === active.id && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
              )}
            </>
          )}

          <div className="flex items-center gap-0.5 shrink-0">
            {/* Layout Config button */}
            <div className="relative" ref={configRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfigOpen((v) => !v);
                }}
                title="View warehouse configuration"
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Layout config"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              {configOpen && (
                <div
                  className="absolute top-full left-0 mt-1 z-50 w-56 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border">
                    <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
                      <Settings className="h-3 w-3" />
                      Configuration
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeConfig();
                      }}
                      title="Close"
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {active.configuration ? (
                    <div className="px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Geometry</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-muted-foreground">Grid Height</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.layout.gridHeight}</span>
                          <span className="text-muted-foreground">Rack Count</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.layout.rackCount}</span>
                          <span className="text-muted-foreground">Aisle Width</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.layout.aisleWidth}</span>
                          <span className="text-muted-foreground">Cross Aisles</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.layout.crossAisleCount}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Inventory</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-muted-foreground">SKU Count</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.inventory.skuCount.toLocaleString()}</span>
                          <span className="text-muted-foreground">Demand Dist.</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.inventory.demandDistribution}%</span>
                          <span className="text-muted-foreground">Affinity</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.inventory.productAffinity}%</span>
                          <span className="text-muted-foreground">Footprint</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.inventory.storageFootprint}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Placement</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-muted-foreground">Slotting Bias</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.placement.slottingBias}%</span>
                          <span className="text-muted-foreground">Category Cluster</span>
                          <span className="text-right font-sans font-semibold text-foreground">{active.configuration.placement.categoryClustering}%</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeConfig();
                          onOpenLayoutConfig(active.id);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
                          border border-border text-foreground hover:bg-muted active:bg-muted/80 transition-colors mt-1"
                      >
                        <Settings className="h-3 w-3" />
                        Edit Configuration
                      </button>
                    </div>
                  ) : (
                    <div className="px-3 py-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        No configuration saved for this warehouse.
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeConfig();
                          onOpenLayoutConfig(active.id);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium
                          border border-border text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                      >
                        <Settings className="h-3 w-3" />
                        Configure Warehouse
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Duplicate button — single-warehouse app: duplication is disabled. */}
            <span
              title="Duplicate disabled — only one warehouse is supported"
              className="p-1 rounded text-muted-foreground/30 cursor-not-allowed"
              aria-label="Duplicate disabled"
            >
              <Copy className="h-3.5 w-3.5" />
            </span>

            {/* Delete button — single-warehouse app: deletion is disabled. */}
            <button
              disabled
              title="Cannot delete the only warehouse"
              className="p-1 rounded text-muted-foreground/30 cursor-not-allowed"
              aria-label="Delete disabled"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary ml-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Active
              </span>
            )}
          </div>
        </div>

        {/* Warehouse renderer — SVG (vector-crisp at every zoom). */}
        <div className="relative" style={{ width: logicalW, height: warehouse.height * CELL_SIZE }}>
          <WarehouseSvgRenderer
            warehouseId={active.id}
            warehouse={warehouse}
            onWarehouseChange={onWarehouseChange}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgressRef={animationProgressRef}
            zVisualizationMode={zVisualizationMode}
            animationReplayId={animationReplayId}
          />
        </div>
      </div>
    </div>
  );
}
