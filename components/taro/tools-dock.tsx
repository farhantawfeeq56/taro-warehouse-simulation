'use client';

/**
 * Tools dock — a compact floating dock at the LEFT edge (vertical).
 *
 * Reuses the classic toolbar design: a rounded floating card of icon
 * buttons. Vertical orientation, hugging the left edge, separate from the
 * right sidebar (which hosts Config + Simulation).
 *
 * Tools: Select (default) / Shelf / Worker / Erase. There is no Pan/Hand —
 * the default select tool inspects shelves on hover/click; only the shelf
 * tool adds new shelves.
 */

import { cn } from '@/lib/utils';
import type { ToolType } from '@/lib/taro/types';
import { MousePointer, Grid3X3, User, Eraser } from 'lucide-react';

interface ToolsDockProps {
  selectedTool: ToolType;
  onToolChange: (tool: ToolType) => void;
}

const tools: { type: Exclude<ToolType, 'hand'>; label: string; icon: typeof MousePointer }[] = [
  { type: 'select', label: 'Select', icon: MousePointer },
  { type: 'shelf', label: 'Shelf', icon: Grid3X3 },
  { type: 'worker', label: 'Worker', icon: User },
  { type: 'erase', label: 'Erase', icon: Eraser },
];

const toolColors: Record<Exclude<ToolType, 'hand'>, { bg: string; textClass: string }> = {
  select: { bg: '#F59E0B', textClass: 'text-white' },
  shelf: { bg: '#374151', textClass: 'text-white' },
  worker: { bg: '#22C55E', textClass: 'text-white' },
  erase: { bg: '#EEEFF2', textClass: 'text-gray-900' },
};

export function ToolsDock({ selectedTool, onToolChange }: ToolsDockProps) {
  return (
    <div className="flex flex-col items-center gap-1 px-1.5 py-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg">
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
  );
}