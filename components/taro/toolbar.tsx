'use client';

import { cn } from '@/lib/utils';
import type { ToolType, ZVisualizationMode } from '@/lib/taro/types';
import { Grid3X3, User, Eraser, Flame, Layers } from 'lucide-react';

interface ToolbarProps {
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  showHeatmap: boolean;
  onHeatmapToggle: () => void;
  hasHeatmap: boolean;
  zVisualizationMode: ZVisualizationMode;
  onZVisualizationChange: (mode: ZVisualizationMode) => void;
}

const tools: { type: ToolType; label: string; icon: typeof Grid3X3 }[] = [
  { type: 'shelf', label: 'Shelf', icon: Grid3X3 },
  { type: 'worker', label: 'Worker', icon: User },
  { type: 'erase', label: 'Erase', icon: Eraser },
];

const toolColors: Record<ToolType, { bg: string; textClass: string }> = {
  shelf: { bg: '#374151', textClass: 'text-white' },
  worker: { bg: '#22C55E', textClass: 'text-white' },
  erase: { bg: '#EEEFF2', textClass: 'text-gray-900' },
};

const zModeOptions: { value: ZVisualizationMode; label: string }[] = [
  { value: 'collapsed', label: 'Collapsed (all levels)' },
  { value: 'level1', label: 'Show Level 1' },
  { value: 'level2', label: 'Show Level 2' },
  { value: 'level3', label: 'Show Level 3' },
  { value: 'level4', label: 'Show Level 4' },
];

export function Toolbar({ 
  selectedTool, 
  onToolChange, 
  showHeatmap, 
  onHeatmapToggle,
  hasHeatmap,
  zVisualizationMode,
  onZVisualizationChange,
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

      {/* Z Visualization Mode Dropdown */}
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={zVisualizationMode}
          onChange={(e) => onZVisualizationChange(e.target.value as ZVisualizationMode)}
          className="h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
          title="Z-Level Visualization Mode"
        >
          {zModeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {hasHeatmap && (
        <>
          <div className="w-px h-6 bg-border" />
          <button
            onClick={onHeatmapToggle}
            title="Toggle traffic heatmap visualization"
            className={cn(
              'h-8 px-3 rounded-lg transition-all flex items-center gap-1.5 text-xs font-medium',
              showHeatmap
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
            )}
          >
            <Flame className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Heatmap</span>
          </button>
        </>
      )}
    </div>
  );
}
