'use client';

import { useState } from 'react';
import type { PickTask } from '@/lib/taro/types';
import { parseTaskCSV } from '@/lib/taro/csv';
import { cn } from '@/lib/utils';
import { ClipboardList, CheckCircle2, Circle, ChevronRight, Users } from 'lucide-react';

const WORKER_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#10b981',
};

export function WorkerMode() {
  const [csvText, setCsvText] = useState('');
  const [tasks, setTasks] = useState<PickTask[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const handleLoadTasks = () => {
    if (!csvText.trim()) {
      setParseError('Please paste a CSV first.');
      return;
    }
    try {
      const parsed = parseTaskCSV(csvText);
      if (parsed.length === 0) {
        setParseError('No valid tasks found. Check the CSV format.');
        return;
      }
      setTasks(parsed);
      setCompletedSteps(new Set());
      setParseError('');
      setLoaded(true);
      // Auto-select first available worker
      const firstWorker = parsed[0]?.workerId ?? null;
      setSelectedWorker(firstWorker);
    } catch {
      setParseError('Failed to parse CSV. Please check the format.');
    }
  };

  const availableWorkers = Array.from(new Set(tasks.map(t => t.workerId))).sort();

  const workerTasks = tasks
    .filter(t => t.workerId === selectedWorker)
    .sort((a, b) => a.step - b.step);

  const currentStepIndex = workerTasks.findIndex(
    t => !completedSteps.has(makeKey(t))
  );
  const currentTask = currentStepIndex >= 0 ? workerTasks[currentStepIndex] : null;
  const completedCount = workerTasks.filter(t => completedSteps.has(makeKey(t))).length;
  const allDone = workerTasks.length > 0 && completedCount === workerTasks.length;

  const handlePick = () => {
    if (!currentTask) return;
    setCompletedSteps(prev => new Set([...prev, makeKey(currentTask)]));
  };

  const handleReset = () => {
    setTasks([]);
    setCsvText('');
    setSelectedWorker(null);
    setCompletedSteps(new Set());
    setLoaded(false);
    setParseError('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-5 bg-background shrink-0">
        <div>
          <h1 className="text-base font-bold tracking-tight">Taro — Worker Mode</h1>
          <p className="text-xs text-muted-foreground leading-tight">Execute your assigned pick tasks</p>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4">

        {/* CSV Import */}
        {!loaded && (
          <section className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Paste Task CSV</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy the CSV from Manager Mode and paste it below. Each row is one pick step.
            </p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={6}
              placeholder={"workerId,step,location,item\n1,1,Aisle A Rack 1 Bin L1,Item (2,0)\n1,2,Aisle B Rack 2 Bin R3,Item (4,1)"}
              className="w-full text-xs font-mono border border-border rounded p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
            {parseError && (
              <p className="text-xs text-red-500">{parseError}</p>
            )}
            <button
              onClick={handleLoadTasks}
              className="w-full py-2 bg-primary text-primary-foreground text-sm rounded font-medium hover:bg-primary/90 transition-colors"
            >
              Load Tasks
            </button>
          </section>
        )}

        {/* Worker Selection */}
        {loaded && (
          <>
            <section className="border border-border rounded-lg p-4 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Select Worker</span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Load different CSV
                </button>
              </div>
              <div className="flex gap-2">
                {availableWorkers.map(wid => (
                  <button
                    key={wid}
                    onClick={() => {
                      setSelectedWorker(wid);
                      setCompletedSteps(new Set());
                    }}
                    className={cn(
                      'flex-1 py-2 text-sm font-medium rounded border transition-all',
                      selectedWorker === wid
                        ? 'text-white border-transparent'
                        : 'border-border bg-muted/30 text-foreground hover:bg-muted'
                    )}
                    style={selectedWorker === wid ? { backgroundColor: WORKER_COLORS[wid] ?? '#6366f1', borderColor: WORKER_COLORS[wid] ?? '#6366f1' } : {}}
                  >
                    Worker {wid}
                  </button>
                ))}
              </div>
            </section>

            {/* Progress */}
            {selectedWorker !== null && workerTasks.length > 0 && (
              <section className="border border-border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    Worker {selectedWorker}
                  </span>
                  <span className="text-muted-foreground text-xs font-mono">
                    Progress: {completedCount} / {workerTasks.length} completed
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(completedCount / workerTasks.length) * 100}%`,
                      backgroundColor: WORKER_COLORS[selectedWorker] ?? '#6366f1',
                    }}
                  />
                </div>
              </section>
            )}

            {/* Current Task */}
            {selectedWorker !== null && !allDone && currentTask && (
              <section className="border-2 rounded-lg p-5 space-y-4 bg-card"
                style={{ borderColor: WORKER_COLORS[selectedWorker] ?? '#6366f1' }}>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Current Task — Step {currentTask.step} of {workerTasks.length}
                </div>
                <div className="space-y-2">
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div className="text-lg font-bold text-foreground leading-tight">{currentTask.location}</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">Item</div>
                    <div className="text-base font-semibold text-foreground">{currentTask.item}</div>
                  </div>
                </div>
                <button
                  onClick={handlePick}
                  className="w-full py-3 rounded-lg text-white font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: WORKER_COLORS[selectedWorker] ?? '#6366f1' }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Picked
                </button>
              </section>
            )}

            {/* All Done */}
            {selectedWorker !== null && allDone && (
              <section className="border border-green-300 dark:border-green-800 rounded-lg p-6 bg-green-50 dark:bg-green-950/30 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                <div className="text-base font-bold text-green-700 dark:text-green-400">All picks completed!</div>
                <div className="text-xs text-green-600 dark:text-green-500">
                  {workerTasks.length} items picked for Worker {selectedWorker}.
                </div>
                <button
                  onClick={() => setCompletedSteps(new Set())}
                  className="text-xs text-green-700 dark:text-green-400 underline underline-offset-2 hover:no-underline"
                >
                  Restart tasks
                </button>
              </section>
            )}

            {/* Step List */}
            {selectedWorker !== null && workerTasks.length > 0 && (
              <section className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">All Steps</span>
                </div>
                <ul className="divide-y divide-border">
                  {workerTasks.map(task => {
                    const done = completedSteps.has(makeKey(task));
                    const isCurrent = currentTask && makeKey(task) === makeKey(currentTask);
                    return (
                      <li
                        key={makeKey(task)}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3 text-xs transition-colors',
                          done && 'opacity-50',
                          isCurrent && 'bg-muted/30'
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {done
                            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                            : isCurrent
                              ? <ChevronRight className="h-4 w-4 text-primary" />
                              : <Circle className="h-4 w-4 text-muted-foreground/40" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn('font-medium truncate', done && 'line-through')}>{task.location}</div>
                          <div className="text-muted-foreground truncate">{task.item}</div>
                        </div>
                        <div className="text-muted-foreground font-mono shrink-0">{task.step}</div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function makeKey(task: PickTask) {
  return `${task.workerId}-${task.step}`;
}
