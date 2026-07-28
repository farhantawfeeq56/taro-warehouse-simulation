'use client';

import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/taro/types';
import { Grid3X3, User, Eraser, Move, MousePointer } from 'lucide-react';

interface ToolbarProps {
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const tools: { type: ToolType; label: string; icon: typeof Grid3X3 }[] = [
  { type: 'hand', label: 'Pan', icon: Move },
  { type: 'select', label: 'Select', icon: MousePointer },
  { type: 'shelf', label: 'Shelf', icon: Grid3X3 },
  { type: 'worker', label: 'Worker', icon: User },
  { type: 'erase', label: 'Erase', icon: Eraser },
];

const toolColors: Record<ToolType, { bg: string; textClass: string }> = {
  hand: { bg: '#6366F1', textClass: 'text-white' },
  select: { bg: '#F59E0B', textClass: 'text-white' },
  shelf: { bg: '#374151', textClass: 'text-white' },
  worker: { bg: '#22C55E', textClass: 'text-white' },
  erase: { bg: '#EEEFF2', textClass: 'text-gray-900' },
};

export function Toolbar({ selectedTool, onToolChange }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg">
      <div className="flex items-center gap-0.5">
        {tools.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onToolChange(type)}
            title={label}
            className={cn(
              'h-8 w-8 rounded-lg transition-all flex items-center justify-center',
              selectedTool === type
                ? `${toolColors[type].textClass} shadow-sm`
                : 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80'
            )}
            style={selectedTool === type ? { backgroundColor: toolColors[type].bg } : undefined}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
