'use client';

import { useState } from 'react';
import { TaroApp } from '@/components/taro/taro-app';
import { WorkerMode } from '@/components/taro/worker-mode';
import { cn } from '@/lib/utils';

type AppMode = 'manager' | 'worker';

export default function Page() {
  const [mode, setMode] = useState<AppMode>('manager');

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Mode switcher bar */}
      <div className="h-8 bg-muted/60 border-b border-border flex items-center justify-center shrink-0">
        <div className="flex items-center gap-0.5 bg-background border border-border rounded-md p-0.5 text-xs">
          <button
            onClick={() => setMode('manager')}
            className={cn(
              'px-3 py-1 rounded transition-colors font-medium',
              mode === 'manager'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Manager Mode
          </button>
          <button
            onClick={() => setMode('worker')}
            className={cn(
              'px-3 py-1 rounded transition-colors font-medium',
              mode === 'worker'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Worker Mode
          </button>
        </div>
      </div>

      {/* Mode content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'manager' ? <TaroApp /> : <WorkerMode />}
      </div>
    </div>
  );
}
