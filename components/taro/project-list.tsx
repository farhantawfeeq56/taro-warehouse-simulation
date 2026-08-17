'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ProjectSummary } from '@/lib/db/actions';

// ── Row action icons (folder / pencil / boxes / trash) ────────────────────

const EDIT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M135 20H55a5 5 0 0 0-5 5V50H25a5 5 0 0 0-5 5V135a5 5 0 0 0 5 5H105a5 5 0 0 0 5-5V110h25a5 5 0 0 0 5-5V25A5 5 0 0 0 135 20ZM100 130H30V60H100Zm30-30H110V55a5 5 0 0 0-5-5H60V30H130Z" fill="#000000" />
  </svg>
);

const RENAME_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M142.069 45.856L114.144 17.925a10 10 0 0 0-14.144 0L22.931 95A9.912 9.912 0 0 0 20 102.069V130a10 10 0 0 0 10 10H57.931A9.912 9.912 0 0 0 65 137.069L142.069 60a10 10 0 0 0 0-14.144ZM57.931 130H30V102.069l55-55L112.931 75ZM120 67.925L92.069 40l15-15L135 52.925Z" fill="#000000" />
  </svg>
);

const COPY_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M115.001 130a5 5 0 0 1-5 5H100.001a25 25 0 0 1-20-10 25 25 0 0 1-20 10H50.001a5 5 0 0 1 0-10H60.001a15 15 0 0 0 15-15V85H65.001a5 5 0 0 1 0-10h10V50A15 15 0 0 0 60.001 35H50.001a5 5 0 0 1 0-10H60.001a25 25 0 0 1 20 10 25 25 0 0 1 20-10h10a5 5 0 0 1 0 10H100.001a15 15 0 0 0-15 15v25h10a5 5 0 0 1 0 10H85.001v25a15 15 0 0 0 15 15h10A5 5 0 0 1 115.001 130Z" fill="#000000" />
  </svg>
);

const DELETE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 160 160" style={{ flexShrink: '0' }}>
    <path d="M135 30H110V25a15 15 0 0 0-15-15H65A15 15 0 0 0 50 25v5H25a5 5 0 0 0 0 10h5V130a10 10 0 0 0 10 10H120a10 10 0 0 0 10-10V40h5a5 5 0 0 0 0-10ZM60 25a5 5 0 0 1 5-5h30a5 5 0 0 1 5 5v5H60Zm60 105H40V40H120ZM70 65v40a5 5 0 0 1-10 0V65a5 5 0 0 1 10 0Zm30 0v40a5 5 0 0 1-10 0V65a5 5 0 0 1 10 0Z" fill="#D96868" />
  </svg>
);

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

// ── Action button ─────────────────────────────────────────────────────────

function IconButton({
  title,
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      className={
        danger
          ? 'p-1.5 rounded-md text-[#D96868]/60 hover:text-[#D96868] hover:bg-[#D96868]/10 transition-colors disabled:opacity-40'
          : 'p-1.5 rounded-md text-black/50 hover:text-black hover:bg-black/5 transition-colors disabled:opacity-40'
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ── Inline rename input ───────────────────────────────────────────────────

function RenameInput({
  renameValue,
  onChange,
  onCommit,
  onCancel,
  inputRef,
  saving,
}: {
  renameValue: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={renameValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        disabled={saving}
        className="h-8 w-full text-base font-['Instrument_Sans',system-ui,sans-serif] px-2 bg-transparent border border-[#1C2118]/20 rounded-md focus:outline-none focus:ring-2 focus:ring-[#4C5C2D]/40"
      />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1C2118]/50 shrink-0" />}
    </div>
  );
}

// ── Project card (card-grid style) ────────────────────────────────────────

function ProjectCard({
  project,
  onOpenProject,
  onStartRename,
  onCopy,
  onDelete,
  renamingId,
  renameValue,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  renameInputRef,
  renamingProjectId,
  copyingProjectId,
}: {
  project: ProjectSummary;
  onOpenProject: (id: string) => void;
  onStartRename: (project: ProjectSummary) => void;
  onCopy: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renamingProjectId: string | null;
  copyingProjectId: string | null;
}) {
  const isRenaming = renamingId === project.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!isRenaming) onOpenProject(project.id);
      }}
      onKeyDown={(e) => {
        if (isRenaming) return;
        // Ignore keydown originating from an inner control (action button).
        // Enter/Space there should activate the button, not open the project.
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProject(project.id);
        }
      }}
      className="group relative rounded-lg border border-[#1C2118]/10 bg-white p-4 hover:shadow-sm hover:border-[#1C2118]/20 transition-all flex flex-col gap-3 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <RenameInput
              renameValue={renameValue}
              onChange={onRenameChange}
              onCommit={onCommitRename}
              onCancel={onCancelRename}
              inputRef={renameInputRef}
              saving={renamingProjectId === project.id}
            />
          ) : (
            <span className="font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] font-semibold text-base leading-tight text-left line-clamp-2">
              {project.name}
            </span>
          )}
        </div>
        {/* Hover-only actions — visual order: folder, pencil, boxes, trash */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto transition-opacity duration-150">
          <IconButton
            title="Duplicate"
            label={`Duplicate ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopy(project);
            }}
            disabled={copyingProjectId === project.id}
          >
            {copyingProjectId === project.id ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
            ) : (
              EDIT_ICON
            )}
          </IconButton>
          <IconButton
            title="Edit"
            label={`Edit ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenProject(project.id);
            }}
          >
            {RENAME_ICON}
          </IconButton>
          <IconButton
            title="Rename"
            label={`Rename ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(project);
            }}
          >
            {COPY_ICON}
          </IconButton>
          <IconButton
            title="Delete"
            label={`Delete ${project.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project);
            }}
            danger
          >
            {DELETE_ICON}
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif] mt-auto">
        <span>Updated {timeAgo(project.updatedAt)}</span>
        <span className="w-1 h-1 rounded-full bg-[#1C2118]/20" />
        <span>{project.itemCount} storage locations</span>
        {project.hasWarehouse ? (
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4C5C2D]" />
            Configured
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D96868]" />
            Draft
          </span>
        )}
      </div>
    </div>
  );
}

// ── Project list (final — card grid) ──────────────────────────────────────

export function ProjectListView({
  projects,
  onOpenProject,
  onStartRename,
  onCopy,
  onDelete,
  renamingId,
  renameValue,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  renameInputRef,
  renamingProjectId,
  copyingProjectId,
}: {
  projects: ProjectSummary[];
  onOpenProject: (id: string) => void;
  onStartRename: (project: ProjectSummary) => void;
  onCopy: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renamingProjectId: string | null;
  copyingProjectId: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onOpenProject={onOpenProject}
          onStartRename={onStartRename}
          onCopy={onCopy}
          onDelete={onDelete}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
          renameInputRef={renameInputRef}
          renamingProjectId={renamingProjectId}
          copyingProjectId={copyingProjectId}
        />
      ))}
    </div>
  );
}
