'use client';

import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/taro/types';
import { Button } from '@/components/ui/button';
import { Grid3X3, Package, User, Eraser } from 'lucide-react';

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
  { type: 'worker', label: 'Worker', icon: User },
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
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded border border-border">
      <span className="text-xs text-muted-foreground px-2 font-medium">Tools</span>
      <div className="w-px h-5 bg-border" />
      {tools.map(({ type, label, icon: Icon }) => (
        <Button
          key={type}
          variant={selectedTool === type ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onToolChange(type)}
          className={cn(
            'h-8 px-2 gap-1.5 text-xs',
            selectedTool === type && 'bg-secondary'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Button>
      ))}
      {hasHeatmap && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant={showHeatmap ? 'secondary' : 'ghost'}
            size="sm"
            onClick={onHeatmapToggle}
            className="h-8 px-2 text-xs"
          >
            {showHeatmap ? 'Hide' : 'Show'} Heatmap
          </Button>
        </>
      )}
    </div>
  );
}
