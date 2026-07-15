'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MoreVertical,
  Plus,
  Clock,
  ChevronRight,
  Layout as LayoutIcon,
  Trash2,
  Copy,
  Edit2,
  Package,
  ArrowRight,
  Warehouse,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  listProjects,
  createProjectAction,
  deleteProjectAction,
  updateProjectNameAction,
} from '@/lib/db/actions';
import type { ProjectSummary } from '@/lib/db/actions';

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

type ProjectStatus = 'Draft' | 'In Progress';

function getStatus(project: ProjectSummary): ProjectStatus {
  if (!project.hasWarehouse) return 'Draft';
  if (project.itemCount > 0) return 'In Progress';
  return 'Draft';
}

// ── Props ──────────────────────────────────────────────────────────────────

interface ProjectDashboardProps {
  onOpenProject: (projectId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ProjectDashboard({ onOpenProject }: ProjectDashboardProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New project dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch projects ──────────────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to list projects:', err);
      setError('Could not load projects. Make sure the database is connected.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ── Rename ──────────────────────────────────────────────────────────────

  const startRename = useCallback((project: ProjectSummary) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
    // Focus input on next tick after render
    requestAnimationFrame(() => renameInputRef.current?.focus());
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await updateProjectNameAction(renamingId, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === renamingId ? { ...p, name: trimmed, updatedAt: new Date() } : p)),
      );
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
    setRenamingId(null);
  }, [renamingId, renameValue]);

  // ── Delete ──────────────────────────────────────────────────────────────

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProjectAction(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  // ── Create ──────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const name = newProjectName.trim() || undefined;
      const project = await createProjectAction(name);
      setShowNewDialog(false);
      setNewProjectName('');
      // Navigate straight into the new project
      onOpenProject(project.id);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsCreating(false);
    }
  }, [newProjectName, onOpenProject]);

  // ── Duplicate (placeholder – not in repo yet) ──────────────────────────

  // For now "Duplicate" creates a new untitled project.
  // Full warehouse-duplication logic can be added later.
  const handleDuplicate = useCallback(
    async (project: ProjectSummary) => {
      try {
        const copy = await createProjectAction(`${project.name} (Copy)`);
        // Navigate to the empty copy; user can re-configure from scratch
        onOpenProject(copy.id);
      } catch (err) {
        console.error('Failed to duplicate project:', err);
      }
    },
    [onOpenProject],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  // Derive latest project for "continue" section
  const latestProject = projects.length > 0 ? projects[0] : null;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Project Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your warehouse simulations and layouts.</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* ── Loading ────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading projects...</p>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────── */}
        {!isLoading && error && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchProjects}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {!isLoading && !error && projects.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
              <div className="rounded-full bg-muted p-4">
                <Warehouse className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold">No projects yet</h2>
              <p className="text-sm text-muted-foreground">
                Create your first warehouse simulation project to get started with layout design, inventory
                placement, and picking strategy analysis.
              </p>
              <Button onClick={() => setShowNewDialog(true)} className="gap-2 mt-2">
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
            </div>
          </div>
        )}

        {/* ── Continue Section (most recent project) ─────────────────── */}
        {!isLoading && !error && latestProject && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Continue Working
            </h2>
            <Card className="border-2 border-primary/10 shadow-md hover:border-primary/20 transition-colors bg-white dark:bg-slate-900 overflow-hidden">
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant="secondary"
                      className={
                        getStatus(latestProject) === 'Draft'
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-none'
                          : 'bg-primary/10 text-primary hover:bg-primary/20 border-none'
                      }
                    >
                      {getStatus(latestProject)}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Updated {timeAgo(latestProject.updatedAt)}
                    </span>
                  </div>
                  <CardTitle className="text-2xl mb-2">{latestProject.name}</CardTitle>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      {latestProject.itemCount} Storage Locations
                    </span>
                    <span className="flex items-center gap-1">
                      <LayoutIcon className="h-4 w-4" />
                      {latestProject.hasWarehouse ? 'Warehouse configured' : 'No warehouse'}
                    </span>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center border-l border-slate-100 dark:border-slate-800">
                  <Button
                    size="lg"
                    onClick={() => onOpenProject(latestProject.id)}
                    className="gap-2 px-8"
                  >
                    Continue Project
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </section>
        )}

        {/* ── All Projects Grid ──────────────────────────────────────── */}
        {!isLoading && !error && projects.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              All Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => {
                const isRenaming = renamingId === project.id;
                const status = getStatus(project);

                return (
                  <Card
                    key={project.id}
                    className="group hover:shadow-md transition-shadow bg-white dark:bg-slate-900"
                  >
                    <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                      <div className="space-y-1 flex-1 min-w-0">
                        {isRenaming ? (
                          <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="h-7 text-base font-semibold px-1"
                          />
                        ) : (
                          <CardTitle
                            className="text-base group-hover:text-primary transition-colors cursor-pointer truncate"
                            onClick={() => onOpenProject(project.id)}
                          >
                            {project.name}
                          </CardTitle>
                        )}
                        <CardDescription className="text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          {timeAgo(project.updatedAt)}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground shrink-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => startRename(project)}>
                            <Edit2 className="h-4 w-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleDuplicate(project)}>
                            <Copy className="h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <Separator className="my-1" />
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(project)}
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardFooter className="p-4 pt-2 flex justify-between items-center">
                      <div className="flex gap-2">
                        <Badge
                          variant={status === 'Draft' ? 'outline' : 'secondary'}
                          className="text-[10px] py-0 h-5"
                        >
                          {status === 'Draft' ? 'Draft' : `${project.itemCount} items`}
                        </Badge>
                        {!project.hasWarehouse && (
                          <Badge variant="outline" className="text-[10px] py-0 h-5 text-muted-foreground">
                            No warehouse
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenProject(project.id)}
                        className="h-8 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ──────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget?.name}</span>? This will permanently remove the
              project and all its warehouse data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Project Dialog ──────────────────────────────────────── */}
      <Dialog
        open={showNewDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewDialog(false);
            setNewProjectName('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Give your new warehouse simulation a name. You will configure the layout and inventory next.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewDialog(false);
                setNewProjectName('');
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !newProjectName.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                'Create & Open'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
