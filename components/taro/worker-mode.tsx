'use client';

import { useState, useEffect } from 'react';
import type { PickTask } from '@/lib/taro/types';
import { parseTaskCSV } from '@/lib/taro/csv';
import { cn } from '@/lib/utils';
import {
  ClipboardList, CheckCircle2, Circle, ChevronRight,
  Users, MapPin, Package, Timer, ArrowRight,
} from 'lucide-react';

const WORKER_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#10b981',
  3: '#f59e0b',
};

function workerColor(id: number) {
  return WORKER_COLORS[id] ?? '#6366f1';
}

function makeKey(task: PickTask) {
  return `${task.workerId}-${task.step}`;
}

/** Group tasks by zone (aisle), preserving step order within each zone */
function groupByZone(tasks: PickTask[]): { zone: string; tasks: PickTask[] }[] {
  const map = new Map<string, PickTask[]>();
  for (const t of tasks) {
    const z = t.zone || 'General';
    if (!map.has(z)) map.set(z, []);
    map.get(z)!.push(t);
  }
  return Array.from(map.entries()).map(([zone, tasks]) => ({ zone, tasks }));
}

interface WorkerModeProps {
  deployedTasks?: PickTask[];
  deployedAt?: number;
}

export function WorkerMode({ deployedTasks = [], deployedAt = 0 }: WorkerModeProps) {
  const [csvText, setCsvText] = useState('');
  const [tasks, setTasks] = useState<PickTask[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<number | null>(null);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every second for live ETA
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-load when manager deploys tasks
  useEffect(() => {
    if (deployedTasks.length > 0 && deployedAt > 0) {
      setTasks(deployedTasks);
      setCompletedKeys(new Set());
      setLoaded(true);
      setStartedAt(null);
      const firstWorker = deployedTasks[0]?.workerId ?? null;
      setSelectedWorker(firstWorker);
    }
  }, [deployedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadCSV = () => {
    if (!csvText.trim()) { setParseError('Please paste a CSV first.'); return; }
    try {
      const parsed = parseTaskCSV(csvText);
      if (parsed.length === 0) { setParseError('No valid tasks found. Check the CSV format.'); return; }
      setTasks(parsed);
      setCompletedKeys(new Set());
      setParseError('');
      setLoaded(true);
      setStartedAt(null);
      setSelectedWorker(parsed[0]?.workerId ?? null);
    } catch {
      setParseError('Failed to parse CSV. Check the format.');
    }
  };

  const handleReset = () => {
    setTasks([]); setCsvText(''); setSelectedWorker(null);
    setCompletedKeys(new Set()); setLoaded(false); setParseError(''); setStartedAt(null);
  };

  const availableWorkers = Array.from(new Set(tasks.map(t => t.workerId))).sort();

  const workerTasks = tasks
    .filter(t => t.workerId === selectedWorker)
    .sort((a, b) => a.step - b.step);

  const zones = groupByZone(workerTasks);

  const completedCount = workerTasks.filter(t => completedKeys.has(makeKey(t))).length;
  const totalCount = workerTasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  const currentTask = workerTasks.find(t => !completedKeys.has(makeKey(t))) ?? null;

  // ETA calculation: avg seconds per pick × remaining picks
  const elapsedSec = startedAt ? (now - startedAt) / 1000 : 0;
  const avgSecPerPick = completedCount > 0 ? elapsedSec / completedCount : 45;
  const remainingPicks = totalCount - completedCount;
  const etaSec = Math.round(avgSecPerPick * remainingPicks);
  const etaMin = Math.floor(etaSec / 60);
  const etaSecRem = etaSec % 60;
  const etaLabel = completedCount === 0
    ? `~${Math.round(avgSecPerPick * totalCount / 60)} min`
    : allDone ? 'Done'
    : `~${etaMin}m ${etaSecRem}s`;

  const handlePick = () => {
    if (!currentTask) return;
    if (!startedAt) setStartedAt(Date.now());
    setCompletedKeys(prev => new Set([...prev, makeKey(currentTask)]));
  };

  return (
    <div className="min-h-full bg-background flex flex-col overflow-auto">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-5 bg-background shrink-0">
        <div className="flex-1">
          <h1 className="text-base font-bold tracking-tight">Worker Mode</h1>
          <p className="text-xs text-muted-foreground leading-tight">Follow your assigned pick tasks step by step</p>
        </div>
        {loaded && (
          <button
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Load different tasks
          </button>
        )}
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4">

        {/* ── CSV Import (only shown when no tasks loaded and no deployed tasks) ── */}
        {!loaded && deployedTasks.length === 0 && (
          <section className="border border-border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Paste Task CSV</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Copy the CSV from Manager Mode and paste it below, or use the Deploy Strategy button to load tasks automatically.
            </p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={6}
              placeholder={"workerId,step,zone,location,item\n1,1,Aisle A,Aisle A\\, Rack 1\\, Bin 1,Item 3"}
              className="w-full text-xs font-mono border border-border rounded-lg p-3 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
            {parseError && <p className="text-xs text-red-500">{parseError}</p>}
            <button
              onClick={handleLoadCSV}
              className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Load Tasks
            </button>
          </section>
        )}

        {/* ── Waiting for deploy ── */}
        {!loaded && deployedTasks.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground space-y-2">
            <div className="w-8 h-8 border-2 border-border rounded-full mx-auto flex items-center justify-center">
              <Timer className="h-4 w-4" />
            </div>
            <p>Waiting for Manager to deploy a strategy, or paste a CSV above.</p>
          </div>
        )}

        {loaded && (
          <>
            {/* ── Worker selector ── */}
            <section className="border border-border rounded-xl p-4 space-y-3 bg-card">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Select Your Worker ID</span>
              </div>
              <div className="flex gap-2">
                {availableWorkers.map(wid => (
                  <button
                    key={wid}
                    onClick={() => { setSelectedWorker(wid); setCompletedKeys(new Set()); setStartedAt(null); }}
                    className={cn(
                      'flex-1 py-2 text-sm font-medium rounded-lg border transition-all',
                      selectedWorker === wid
                        ? 'text-white border-transparent shadow-sm'
                        : 'border-border bg-muted/30 text-foreground hover:bg-muted'
                    )}
                    style={selectedWorker === wid ? { backgroundColor: workerColor(wid), borderColor: workerColor(wid) } : {}}
                  >
                    Worker {wid}
                  </button>
                ))}
              </div>
            </section>

            {selectedWorker !== null && totalCount > 0 && (
              <>
                {/* ── Stats bar ── */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Picks Done', value: `${completedCount} / ${totalCount}` },
                    { label: 'Progress', value: `${Math.round(progressPct)}%` },
                    { label: 'ETA', value: etaLabel },
                  ].map(({ label, value }) => (
                    <div key={label} className="border border-border rounded-xl p-3 bg-card text-center space-y-0.5">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-sm font-bold font-mono text-foreground">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, backgroundColor: workerColor(selectedWorker) }}
                  />
                </div>

                {/* ── Current active pick (big card) ── */}
                {!allDone && currentTask && (
                  <section
                    className="border-2 rounded-xl p-5 bg-card space-y-4"
                    style={{ borderColor: workerColor(selectedWorker) }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Next Pick — Step {currentTask.step} of {totalCount}
                      </span>
                      {currentTask.zone && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: workerColor(selectedWorker) }}
                        >
                          {currentTask.zone}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Location</div>
                          <div className="text-lg font-bold leading-tight">{currentTask.location}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Package className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground mb-0.5">Item</div>
                          <div className="text-base font-semibold">{currentTask.item}</div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handlePick}
                      className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
                      style={{ backgroundColor: workerColor(selectedWorker) }}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      Confirm Pick
                    </button>
                  </section>
                )}

                {/* ── All done ── */}
                {allDone && (
                  <section className="border border-emerald-300 dark:border-emerald-800 rounded-xl p-6 bg-emerald-50 dark:bg-emerald-950/30 text-center space-y-3">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">All {totalCount} picks completed!</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-500">
                      Finished in {Math.floor(elapsedSec / 60)}m {Math.round(elapsedSec % 60)}s
                    </div>
                    <button
                      onClick={() => { setCompletedKeys(new Set()); setStartedAt(null); }}
                      className="text-xs text-emerald-700 dark:text-emerald-400 underline underline-offset-2 hover:no-underline"
                    >
                      Restart tasks
                    </button>
                  </section>
                )}

                {/* ── Zone-grouped step list ── */}
                <section className="border border-border rounded-xl overflow-hidden bg-card">
                  <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      All Picks — by Zone
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {zones.map(({ zone, tasks: zoneTasks }) => {
                      const zoneDone = zoneTasks.every(t => completedKeys.has(makeKey(t)));
                      const zoneActive = !zoneDone && zoneTasks.some(t => !completedKeys.has(makeKey(t)));

                      return (
                        <div key={zone}>
                          {/* Zone header */}
                          <div className={cn(
                            'flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide',
                            zoneDone
                              ? 'bg-muted/20 text-muted-foreground'
                              : zoneActive
                                ? 'bg-muted/40 text-foreground'
                                : 'bg-muted/10 text-muted-foreground/60'
                          )}>
                            <MapPin className="h-3 w-3 shrink-0" />
                            {zone}
                            {zoneDone && (
                              <span className="ml-auto text-emerald-600 text-xs font-medium normal-case tracking-normal">Done</span>
                            )}
                          </div>

                          {/* Picks within this zone */}
                          <ul className="divide-y divide-border/50">
                            {zoneTasks.map(task => {
                              const done = completedKeys.has(makeKey(task));
                              const isCurrent = currentTask && makeKey(task) === makeKey(currentTask);
                              return (
                                <li
                                  key={makeKey(task)}
                                  className={cn(
                                    'flex items-start gap-3 px-5 py-2.5 text-xs transition-colors',
                                    done ? 'opacity-40' : isCurrent ? 'bg-muted/30' : ''
                                  )}
                                >
                                  <div className="mt-0.5 shrink-0">
                                    {done
                                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      : isCurrent
                                        ? <ArrowRight className="h-3.5 w-3.5 text-primary" />
                                        : <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-0.5">
                                    <div className={cn('font-medium truncate', done && 'line-through')}>
                                      {task.location}
                                    </div>
                                    <div className="text-muted-foreground truncate">{task.item}</div>
                                  </div>
                                  <div className="text-muted-foreground font-mono shrink-0 mt-0.5">
                                    {task.step}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
