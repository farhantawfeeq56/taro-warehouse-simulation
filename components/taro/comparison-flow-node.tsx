'use client';

import { memo, useState, useRef, useCallback } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { GitCompareArrows, Trash2, Trophy } from 'lucide-react';
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

export type ComparisonNodeData = Record<string, unknown> & {
  comparisonId: string;
  comparisonName: string;
  warehouseIds: string[];
  warehouseNames: Record<string, string>; // warehouseId → name for display
  score: { winnerId: string | null; winnerName: string; winnerEfficiency: number } | null;
  onSelect?: (comparisonId: string, opts?: { additive?: boolean }) => void;
  onRename?: (comparisonId: string, name: string) => void;
  onDelete?: (comparisonId: string) => void;
  /** Number of member warehouses */
  memberCount: number;
  isActive: boolean;
};

function ComparisonFlowNode({ data }: NodeProps<Node<ComparisonNodeData>>) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.comparisonName);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isHighlighted = isHovered || data.isActive;

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== data.comparisonName) {
      data.onRename?.(data.comparisonId, trimmed);
    }
    setIsEditing(false);
  }, [editValue, data]);

  const handleDoubleClick = useCallback(() => {
    setEditValue(data.comparisonName);
    setIsEditing(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [data.comparisonName]);

  const handleDeleteConfirm = useCallback(() => {
    setDeleteDialogOpen(false);
    data.onDelete?.(data.comparisonId);
  }, [data]);

  return (
    <div
      className="nodrag nopan relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Highlight ring */}
      {isHighlighted && (
        <div className="absolute inset-0 rounded-[5px] pointer-events-none ring-2 ring-emerald-500/60 ring-inset z-10 transition-shadow duration-150" />
      )}

      {/* Title bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => data.onSelect?.(data.comparisonId, { additive: e.shiftKey })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.(data.comparisonId, { additive: e.shiftKey });
          }
        }}
        className={`
          flex items-center justify-between px-3 py-1.5 text-xs font-medium border-b select-none gap-2
          ${data.isActive
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
          }
        `}
        style={{ cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
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
              className="nodrag flex-1 min-w-0 h-5 px-1 text-xs font-medium bg-background border border-emerald-500/50 rounded outline-none ring-1 ring-emerald-500/30"
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
              {data.comparisonName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {data.isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mr-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            title="Delete this comparison"
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body — the scoreboard */}
      <div
        className="px-3 py-3 bg-background border-b border-border rounded-b-[4px]"
        style={{ cursor: 'pointer' }}
        onClick={(e) => data.onSelect?.(data.comparisonId, { additive: e.shiftKey })}
      >
        {data.memberCount === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No warehouses connected
          </p>
        ) : data.score ? (
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-foreground truncate">
                {data.score.winnerName}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {data.score.winnerEfficiency}% efficiency
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {data.memberCount} warehouse{data.memberCount !== 1 ? 's' : ''} —
            <span className="font-medium text-foreground ml-1">ready to run</span>
          </p>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogTrigger asChild>
          <span />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comparison</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{data.comparisonName}</span>?
              This cannot be undone.
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
    </div>
  );
}

export default memo(ComparisonFlowNode);
