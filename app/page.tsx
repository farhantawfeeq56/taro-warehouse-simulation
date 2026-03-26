'use client';

import { useState } from 'react';
import { TaroApp } from '@/components/taro/taro-app';
import { WorkerMode } from '@/components/taro/worker-mode';
import type { PickTask } from '@/lib/taro/types';
import { cn } from '@/lib/utils';

type AppMode = 'manager' | 'worker';

export default function Page() {
  const [mode, setMode] = useState<AppMode>('manager');
  const [deployedTasks, setDeployedTasks] = useState<PickTask[]>([]);
  const [deployedAt, setDeployedAt] = useState<number>(0);

  const handleDeploy = (tasks: PickTask[]) => {
    setDeployedTasks(tasks);
    setDeployedAt(Date.now());
    setMode('worker');
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Mode switcher bar */}
      <div className="h-10 bg-muted/60 border-b border-border flex items-center justify-between px-4 shrink-0">
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
            Manager
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
            Worker
          </button>
        </div>

        {deployedTasks.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {deployedTasks.length} tasks deployed
            </span>
            {mode === 'manager' && (
              <button
                onClick={() => setMode('worker')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2"
              >
                View in Worker Mode
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mode content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'manager'
          ? <TaroApp onDeployStrategy={handleDeploy} />
          : <WorkerMode deployedTasks={deployedTasks} deployedAt={deployedAt} />
        }
      </div>
    </div>
  );
}
