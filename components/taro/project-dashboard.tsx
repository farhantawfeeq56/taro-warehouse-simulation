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
import { ProjectListView } from '@/components/taro/project-list-variants';

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

  // In-progress rename / copy tracking
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [copyingProjectId, setCopyingProjectId] = useState<string | null>(null);

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

  // ── Copy ────────────────────────────────────────────────────────────────

  const handleCopy = useCallback(
    async (project: ProjectSummary) => {
      setCopyingProjectId(project.id);
      try {
        const copy = await createProjectAction(`${project.name} (Copy)`);
        // Navigate to the empty copy; user can re-configure from scratch
        onOpenProject(copy.id);
      } catch (err) {
        console.error('Failed to copy project:', err);
        setCopyingProjectId(null);
      }
    },
    [onOpenProject],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="[font-synthesis:none] relative bg-[#FBF6F6] antialiased w-full min-h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-5 py-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 mb-8">
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
          <ProjectListView
            projects={projects}
            onOpenProject={onOpenProject}
            onStartRename={startRename}
            onCopy={handleCopy}
            onDelete={setDeleteTarget}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onCommitRename={commitRename}
            onCancelRename={() => setRenamingId(null)}
            renameInputRef={renameInputRef}
            renamingProjectId={renamingProjectId}
            copyingProjectId={copyingProjectId}
          />
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
