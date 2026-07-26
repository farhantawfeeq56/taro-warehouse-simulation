'use client';

import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/taro/types';
import { Grid3X3, User, Eraser, Move, Trash2, Settings, Users, Plus } from 'lucide-react';

interface ToolbarProps {
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onClear: () => void;
  onOpenLayoutConfig: () => void;
  onNewWarehouse: () => void;
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
}

const tools: { type: ToolType; label: string; icon: typeof Grid3X3 }[] = [
  { type: 'hand', label: 'Pan', icon: Move },
  { type: 'shelf', label: 'Shelf', icon: Grid3X3 },
  { type: 'worker', label: 'Worker', icon: User },
  { type: 'erase', label: 'Erase', icon: Eraser },
];

const toolColors: Record<ToolType, { bg: string; textClass: string }> = {
  hand: { bg: '#6366F1', textClass: 'text-white' },
  shelf: { bg: '#374151', textClass: 'text-white' },
  worker: { bg: '#22C55E', textClass: 'text-white' },
  erase: { bg: '#EEEFF2', textClass: 'text-gray-900' },
};

export function Toolbar({ 
  selectedTool, 
  onToolChange, 
  onClear,
  onOpenLayoutConfig,
  onNewWarehouse,
  workerCount,
  onWorkerCountChange,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg border border-border">
        {tools.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onToolChange(type)}
            title={label}
            className={cn(
              'h-8 px-3 rounded transition-all flex items-center gap-1.5 text-xs font-medium',
              selectedTool === type
                ? `${toolColors[type].textClass} shadow-sm`
                : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
            )}
            style={selectedTool === type ? { backgroundColor: toolColors[type].bg } : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-border" />

      <button
        onClick={onClear}
        className="h-8 px-3 rounded-lg border border-border bg-background text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1.5 text-xs font-medium"
        title="Clear all warehouse data and orders"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Clear</span>
      </button>

      <div className="w-px h-6 bg-border" />

      <button
        onClick={onOpenLayoutConfig}
        className="h-8 px-3 rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors flex items-center gap-1.5 text-xs font-medium"
        title="Edit current warehouse layout configuration"
      >
        <Settings className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Layout Config</span>
      </button>

      <button
        onClick={onNewWarehouse}
        className="h-8 px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 transition-colors flex items-center gap-1.5 text-xs font-medium"
        title="Add a new warehouse to the project"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New Warehouse</span>
      </button>

      <div className="w-px h-6 bg-border" />

      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Workers:</span>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={workerCount}
          onChange={(e) => onWorkerCountChange(Number(e.target.value))}
          className="w-20 h-7 accent-primary cursor-pointer"
          title={`Worker count: ${workerCount}`}
        />
        <span className="text-xs font-mono font-semibold text-foreground w-4 text-center">
          {workerCount}
        </span>
      </div>
    </div>
  );
}
