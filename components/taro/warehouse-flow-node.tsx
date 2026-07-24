'use client';

import { memo, useState, useRef, useCallback } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { WarehouseCanvas } from './warehouse-canvas';
import { Copy, Trash2 } from 'lucide-react';
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
  onSelect?: (warehouseId: string) => void;
  onDuplicate?: (warehouseId: string) => void;
  onRename?: (warehouseId: string, name: string) => void;
  onDelete?: (warehouseId: string) => void;
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
 * rename on double-click, and provides duplicate + delete actions.
 */
function WarehouseFlowNode({ data }: NodeProps<Node<WarehouseNodeData>>) {
  const isHandTool = data.selectedTool === 'hand';

  // Inline rename state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.warehouseName);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Hover affordance state — must be before isHighlighted
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
    // Focus input after render
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
        onClick={() => data.onSelect?.(data.warehouseId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.(data.warehouseId);
          }
        }}
        className={`
          flex items-center justify-between px-3 py-1.5 text-xs font-medium border-b select-none
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
            className={`truncate flex-1 min-w-0 ${isHighlighted ? 'font-semibold' : 'font-medium'}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleDoubleClick();
            }}
            title="Double-click to rename"
          >
            {data.warehouseName}
          </span>
        )}

        <div className="flex items-center gap-1 ml-2 shrink-0">
          {/* Duplicate button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDuplicate?.(data.warehouseId);
            }}
            title="Duplicate this warehouse"
            className="p-0.5 rounded hover:bg-muted transition-colors"
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
                  className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
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
              className="p-0.5 rounded text-muted-foreground/30 cursor-not-allowed"
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
