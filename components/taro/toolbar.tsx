'use client';

import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/taro/types';
import { Grid3X3, Package, Eraser, Flame } from 'lucide-react';

interface ToolbarProps {
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  showHeatmap: boolean;
  onHeatmapToggle: () => void;
  hasHeatmap: boolean;
}

const tools: { type: ToolType; label: string; icon: typeof Grid3X3 }[] = [
  { type: 'shelf', label: 'Shelf', icon: Grid3X3 },
  { type: 'item', label: 'Item', icon: Package },
  { type: 'erase', label: 'Erase', icon: Eraser },
];

export function Toolbar({ 
  selectedTool, 
  onToolChange, 
  showHeatmap, 
  onHeatmapToggle,
  hasHeatmap 
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg border border-border">
        {tools.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onToolChange(type)}
            title={label}
            className={cn(
              'h-8 px-3 rounded transition-all flex items-center gap-1.5 text-xs font-medium',
              selectedTool === type
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
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
