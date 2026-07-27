'use client';

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { WarehouseCanvas } from './warehouse-canvas';
import { Copy, Trash2, Settings, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export type WarehouseNodeData = Record<string, unknown> & {
  warehouseId: string;
  warehouseName: string;
  warehouse: Warehouse;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onSelect?: (warehouseId: string, opts?: { additive?: boolean }) => void;
  onDuplicate?: (warehouseId: string) => void;
  onRename?: (warehouseId: string, name: string) => void;
  onDelete?: (warehouseId: string) => void;
  onOpenLayoutConfig?: (warehouseId: string) => void;
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
  canDelete?: boolean;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
  /** Whether this node is the currently active/selected warehouse. */
  isActive: boolean;
};

/**
 * Custom React Flow node that renders the existing WarehouseCanvas inside.
 * Interaction classes (`nodrag`, `nopan`, `nowheel`) are conditionally applied:
 * - When a drawing tool is active → React Flow ignores events on the canvas,
 *   allowing the canvas to handle drawing, internal pan, and hover.
 * - When the hand/pan tool is active → events bubble through so React Flow
 *   handles viewport pan/zoom; the canvas stops handling drawing.
 *
 * Title bar shows the warehouse name (not a truncated UUID), supports inline
 * rename on double-click, and provides layout config, workers, duplicate + delete actions.
 */
function WarehouseFlowNode({ data }: NodeProps<Node<WarehouseNodeData>>) {
  const isHandTool = data.selectedTool === 'hand';

  // Inline rename state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.warehouseName);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Workers popover state
  const [workersOpen, setWorkersOpen] = useState(false);
  const workersRef = useRef<HTMLDivElement>(null);

  // Close workers popover on outside click
  useEffect(() => {
    if (!workersOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (workersRef.current && !workersRef.current.contains(e.target as globalThis.Node)) {
        setWorkersOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [workersOpen]);

  // Hover affordance state
  const [isHovered, setIsHovered] = useState(false);

  // Highlighted when hovered OR active — drives border ring + bolder name
  const isHighlighted = isHovered || data.isActive;

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== data.warehouseName) {
      data.onRename?.(data.warehouseId, trimmed);
    }
    setIsEditing(false);
  }, [editValue, data]);

  const handleDoubleClick = useCallback(() => {
    setEditValue(data.warehouseName);
    setIsEditing(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [data.warehouseName]);

  const handleDeleteConfirm = useCallback(() => {
    setDeleteDialogOpen(false);
    data.onDelete?.(data.warehouseId);
  }, [data]);

  return (
    <div
      className={
        isHandTool
          ? 'relative w-full h-full'
          : 'nodrag nopan relative w-full h-full'
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Highlight ring overlay — layout-neutral, pointer-events-none so it doesn't block interaction */}
      {isHighlighted && (
        <div className="absolute inset-0 rounded-[5px] pointer-events-none ring-2 ring-primary/60 ring-inset z-10 transition-shadow duration-150" />
      )}
      {/* Title bar — always clickable for selection */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => data.onSelect?.(data.warehouseId, { additive: e.shiftKey })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.(data.warehouseId, { additive: e.shiftKey });
          }
        }}
        className={`
          flex items-center justify-between px-3 py-1.5 text-xs font-medium border-b select-none gap-2
          ${data.isActive
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
          }
        `}
        style={{ cursor: 'pointer' }}
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
            className="nodrag flex-1 min-w-0 h-5 px-1 text-xs font-medium bg-background border border-primary/50 rounded outline-none ring-1 ring-primary/30"
          />
        ) : (
          <span
            className={`truncate min-w-0 ${isHighlighted ? 'font-semibold' : 'font-medium'}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick();
            }}
            title="Double-click to rename"
          >
            {data.warehouseName}
          </span>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Layout Config button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onOpenLayoutConfig?.(data.warehouseId);
            }}
            title="Edit warehouse layout configuration"
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Layout config"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* Workers control */}
          <div className="relative" ref={workersRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setWorkersOpen(!workersOpen);
              }}
              title={`Workers: ${data.workerCount}`}
              className="p-1 rounded hover:bg-muted transition-colors flex items-center gap-0.5"
              aria-label="Worker count"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="text-[10px] font-mono font-semibold">{data.workerCount}</span>
            </button>
            {workersOpen && (
              <div
                className="nodrag absolute top-full right-0 mt-1 bg-background border border-border rounded-lg shadow-lg p-3 z-50 min-w-[140px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">Workers</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={data.workerCount}
                  onChange={(e) => data.onWorkerCountChange(Number(e.target.value))}
                  className="w-full h-6 accent-primary cursor-pointer"
                  title={`Worker count: ${data.workerCount}`}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>1</span>
                  <span className="font-mono font-semibold text-foreground">{data.workerCount}</span>
                  <span>10</span>
                </div>
              </div>
            )}
          </div>

          {/* Duplicate button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDuplicate?.(data.warehouseId);
            }}
            title="Duplicate this warehouse"
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Duplicate warehouse"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          {/* Delete button */}
          {data.canDelete !== false ? (
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="Delete this warehouse"
                  className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label="Delete warehouse"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete{' '}
                    <span className="font-semibold">{data.warehouseName}</span>?
                    This will permanently remove this warehouse and all its data.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteConfirm}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <button
              disabled
              title="Cannot delete the last warehouse"
              className="p-1 rounded text-muted-foreground/30 cursor-not-allowed"
              aria-label="Delete disabled"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {data.isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary ml-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <WarehouseCanvas
        warehouseId={data.warehouseId}
        warehouse={data.warehouse}
        onWarehouseChange={data.onWarehouseChange}
        selectedTool={data.selectedTool}
        activeRoute={data.activeRoute}
        animationProgressRef={data.animationProgressRef}
        zVisualizationMode={data.zVisualizationMode}
        animationReplayId={data.animationReplayId}
      />
    </div>
  );
}

export default memo(WarehouseFlowNode);
