'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// ── Row action icons (rename / duplicate / open / delete) ─────────────────

const RENAME_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M142.069 45.856L114.144 17.925a10 10 0 0 0-14.144 0L22.931 95A9.912 9.912 0 0 0 20 102.069V130a10 10 0 0 0 10 10H57.931A9.912 9.912 0 0 0 65 137.069L142.069 60a10 10 0 0 0 0-14.144ZM57.931 130H30V102.069l55-55L112.931 75ZM120 67.925L92.069 40l15-15L135 52.925Z" fill="#000000" />
  </svg>
);

const DUPLICATE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M115.001 130a5 5 0 0 1-5 5H100.001a25 25 0 0 1-20-10 25 25 0 0 1-20 10H50.001a5 5 0 0 1 0-10H60.001a15 15 0 0 0 15-15V85H65.001a5 5 0 0 1 0-10h10V50A15 15 0 0 0 60.001 35H50.001a5 5 0 0 1 0-10H60.001a25 25 0 0 1 20 10 25 25 0 0 1 20-10h10a5 5 0 0 1 0 10H100.001a15 15 0 0 0-15 15v25h10a5 5 0 0 1 0 10H85.001v25a15 15 0 0 0 15 15h10A5 5 0 0 1 115.001 130Z" fill="#000000" />
  </svg>
);

const OPEN_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M135 20H55a5 5 0 0 0-5 5V50H25a5 5 0 0 0-5 5V135a5 5 0 0 0 5 5H105a5 5 0 0 0 5-5V110h25a5 5 0 0 0 5-5V25A5 5 0 0 0 135 20ZM100 130H30V60H100Zm30-30H110V55a5 5 0 0 0-5-5H60V30H130Z" fill="#000000" />
  </svg>
);

const DELETE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M135 30H110V25a15 15 0 0 0-15-15H65A15 15 0 0 0 50 25v5H25a5 5 0 0 0 0 10h5V130a10 10 0 0 0 10 10H120a10 10 0 0 0 10-10V40h5a5 5 0 0 0 0-10ZM60 25a5 5 0 0 1 5-5h30a5 5 0 0 1 5 5v5H60Zm60 105H40V40H120ZM70 65v40a5 5 0 0 1-10 0V65a5 5 0 0 1 10 0Zm30 0v40a5 5 0 0 1-10 0V65a5 5 0 0 1 10 0Z" fill="#D96868" />
  </svg>
);

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

  // In-progress rename / duplicate tracking
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [duplicatingProjectId, setDuplicatingProjectId] = useState<string | null>(null);

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
    setRenamingProjectId(renamingId);
    try {
      await updateProjectNameAction(renamingId, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === renamingId ? { ...p, name: trimmed, updatedAt: new Date() } : p)),
      );
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
    setRenamingProjectId(null);
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

  // ── Duplicate ───────────────────────────────────────────────────────────

  const handleDuplicate = useCallback(
    async (project: ProjectSummary) => {
      setDuplicatingProjectId(project.id);
      try {
        const copy = await createProjectAction(`${project.name} (Copy)`);
        // Navigate to the empty copy; user can re-configure from scratch
        onOpenProject(copy.id);
      } catch (err) {
        console.error('Failed to duplicate project:', err);
        setDuplicatingProjectId(null);
      }
    },
    [onOpenProject],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="[font-synthesis:none] relative bg-[#FBF6F6] antialiased w-full min-h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-10 sm:px-10 md:px-14">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 mb-12">
          <div className="flex flex-col items-start gap-1">
            <h1 className="font-['Instrument_Sans',system-ui,sans-serif] font-bold text-[#1C2118] text-2xl sm:text-[26px] leading-tight">
              Projects
            </h1>
            <p className="font-['Instrument_Sans',system-ui,sans-serif] font-medium text-black/70 text-sm sm:text-base">
              Manage warehouse layouts and simulations
            </p>
          </div>
          <div
            className="flex items-center rounded-lg justify-center py-2 px-5 bg-[#4C5C2D] cursor-pointer select-none hover:bg-[#3f4d25] transition-colors"
            onClick={() => setShowNewDialog(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowNewDialog(true);
              }
            }}
          >
            <span className="whitespace-pre font-['Instrument_Sans',system-ui,sans-serif] font-semibold text-[#F5F5F5] text-sm sm:text-base">
              +{'  '}New Project
            </span>
          </div>
        </div>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[#1C2118]/50" />
              <p className="text-sm text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif]">
                Loading projects...
              </p>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {!isLoading && error && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertCircle className="h-10 w-10 text-[#D96868]" />
              <p className="text-sm text-[#D96868] font-medium font-['Instrument_Sans',system-ui,sans-serif]">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchProjects}
                className="font-['Instrument_Sans',system-ui,sans-serif]"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!isLoading && !error && projects.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
              <h2 className="text-lg font-semibold font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118]">
                No projects yet
              </h2>
              <p className="text-sm text-[#1C2118]/60 font-['Instrument_Sans',system-ui,sans-serif]">
                Create your first warehouse simulation project to get started with layout design, inventory
                placement, and picking strategy analysis.
              </p>
              <div
                className="flex items-center rounded-lg justify-center py-2 px-5 bg-[#4C5C2D] cursor-pointer select-none hover:bg-[#3f4d25] transition-colors mt-2"
                onClick={() => setShowNewDialog(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowNewDialog(true);
                  }
                }}
              >
                <span className="whitespace-pre font-['Instrument_Sans',system-ui,sans-serif] font-semibold text-[#F5F5F5] text-sm sm:text-base">
                  +{'  '}Create Project
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── All Projects List ──────────────────────────────────────────── */}
        {!isLoading && !error && projects.length > 0 && (
          <div className="flex flex-col items-stretch">
            {projects.map((project) => {
              const isRenaming = renamingId === project.id;

              return (
                <div
                  key={project.id}
                  className="group flex w-full items-center justify-between gap-4 rounded-md py-3 px-3 transition-colors duration-150 hover:bg-[#F4F4F3]"
                >
                  {/* Name / rename input */}
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="h-8 text-base font-['Instrument_Sans',system-ui,sans-serif] px-2 flex-1 bg-transparent border-[#1C2118]/20"
                          disabled={renamingProjectId === project.id}
                        />
                        {renamingProjectId === project.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1C2118]/50 shrink-0" />
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenProject(project.id)}
                        className="w-fit shrink-0 font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] text-base sm:text-[17px] leading-snug hover:underline text-left"
                      >
                        {project.name}
                      </button>
                    )}
                  </div>

                  {/* Row action controls — visible only on hover */}
                  <div className="flex items-center gap-1.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      title="Rename"
                      aria-label={`Rename ${project.name}`}
                      className="p-1.5 rounded-md text-black/50 hover:text-black hover:bg-black/5 transition-colors"
                      onClick={() => startRename(project)}
                    >
                      {RENAME_ICON}
                    </button>
                    <button
                      type="button"
                      title="Duplicate"
                      aria-label={`Duplicate ${project.name}`}
                      className="p-1.5 rounded-md text-black/50 hover:text-black hover:bg-black/5 transition-colors"
                      onClick={() => handleDuplicate(project)}
                      disabled={duplicatingProjectId === project.id}
                    >
                      {duplicatingProjectId === project.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
                      ) : (
                        DUPLICATE_ICON
                      )}
                    </button>
                    <button
                      type="button"
                      title="Open"
                      aria-label={`Open ${project.name}`}
                      className="p-1.5 rounded-md text-black/50 hover:text-black hover:bg-black/5 transition-colors"
                      onClick={() => onOpenProject(project.id)}
                    >
                      {OPEN_ICON}
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${project.name}`}
                      className="p-1.5 rounded-md text-[#D96868]/60 hover:text-[#D96868] hover:bg-[#D96868]/10 transition-colors"
                      onClick={() => setDeleteTarget(project)}
                    >
                      {DELETE_ICON}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Delete Confirmation Dialog ──────────────────────────────── */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Instrument_Sans',system-ui,sans-serif]">
                Delete Project
              </DialogTitle>
              <DialogDescription className="font-['Instrument_Sans',system-ui,sans-serif]">
                Are you sure you want to delete{' '}
                <span className="font-semibold">{deleteTarget?.name}</span>? This will permanently remove the
                project and all its warehouse data. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="font-['Instrument_Sans',system-ui,sans-serif]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="font-['Instrument_Sans',system-ui,sans-serif]"
              >
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
              <DialogTitle className="font-['Instrument_Sans',system-ui,sans-serif]">
                Create Project
              </DialogTitle>
              <DialogDescription className="font-['Instrument_Sans',system-ui,sans-serif]">
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
                className="font-['Instrument_Sans',system-ui,sans-serif]"
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
                className="font-['Instrument_Sans',system-ui,sans-serif]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !newProjectName.trim()}
                className="font-['Instrument_Sans',system-ui,sans-serif]"
              >
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
    </div>
  );
}
