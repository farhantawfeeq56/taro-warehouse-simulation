'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ProjectSummary } from '@/lib/db/actions';

// ── Shared row action icons (edit / rename / copy / delete) ──────────────

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

// ── Shared props for a single row/card renderer ───────────────────────────

interface ProjectViewProps {
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
}

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
  onClick: () => void;
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

// ── Reusable rename input row (used by list rows) ─────────────────────────

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

// ── Variant 1: Clean list (hover actions) ─────────────────────────────────

function VariantCleanList(props: ProjectViewProps) {
  const {
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
  } = props;

  const isRenaming = renamingId === project.id;

  return (
    <div className="group flex w-full items-center justify-between gap-4 rounded-md py-3 px-3 transition-colors duration-150 hover:bg-[#F4F4F3]">
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
          <button
            type="button"
            onClick={() => onOpenProject(project.id)}
            className="w-fit shrink-0 font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] text-base sm:text-[17px] leading-snug hover:underline text-left"
          >
            {project.name}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <IconButton title="Edit" label={`Edit ${project.name}`} onClick={() => onOpenProject(project.id)}>
          {EDIT_ICON}
        </IconButton>
        <IconButton title="Rename" label={`Rename ${project.name}`} onClick={() => onStartRename(project)}>
          {RENAME_ICON}
        </IconButton>
        <IconButton
          title="Copy"
          label={`Copy ${project.name}`}
          onClick={() => onCopy(project)}
          disabled={copyingProjectId === project.id}
        >
          {copyingProjectId === project.id ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
          ) : (
            COPY_ICON
          )}
        </IconButton>
        <IconButton title="Delete" label={`Delete ${project.name}`} onClick={() => onDelete(project)} danger>
          {DELETE_ICON}
        </IconButton>
      </div>
    </div>
  );
}

// ── Variant 2: Dense table ────────────────────────────────────────────────

function VariantTable(props: ProjectViewProps) {
  const {
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
  } = props;

  const isRenaming = renamingId === project.id;

  return (
    <div className="group grid grid-cols-[1fr_140px_100px_auto] items-center gap-4 px-4 py-2.5 border-b border-[#1C2118]/8 hover:bg-[#F4F4F3] transition-colors">
      <div className="min-w-0">
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
          <button
            type="button"
            onClick={() => onOpenProject(project.id)}
            className="truncate font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] text-sm font-medium hover:underline text-left"
          >
            {project.name}
          </button>
        )}
      </div>
      <span className="text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif] truncate">
        {timeAgo(project.updatedAt)}
      </span>
      <span className="text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif] text-right">
        {project.itemCount}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <IconButton title="Edit" label={`Edit ${project.name}`} onClick={() => onOpenProject(project.id)}>
          {EDIT_ICON}
        </IconButton>
        <IconButton title="Rename" label={`Rename ${project.name}`} onClick={() => onStartRename(project)}>
          {RENAME_ICON}
        </IconButton>
        <IconButton
          title="Copy"
          label={`Copy ${project.name}`}
          onClick={() => onCopy(project)}
          disabled={copyingProjectId === project.id}
        >
          {copyingProjectId === project.id ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
          ) : (
            COPY_ICON
          )}
        </IconButton>
        <IconButton title="Delete" label={`Delete ${project.name}`} onClick={() => onDelete(project)} danger>
          {DELETE_ICON}
        </IconButton>
      </div>
    </div>
  );
}

// ── Variant 3: Card grid ──────────────────────────────────────────────────

function VariantCards(props: ProjectViewProps) {
  const {
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
  } = props;

  const isRenaming = renamingId === project.id;

  return (
    <div className="group relative rounded-lg border border-[#1C2118]/10 bg-white p-4 hover:shadow-sm hover:border-[#1C2118]/20 transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
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
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] font-semibold text-base leading-tight hover:underline text-left line-clamp-2"
            >
              {project.name}
            </button>
          )}
        </div>
        {/* Actions always visible in cards */}
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton title="Edit" label={`Edit ${project.name}`} onClick={() => onOpenProject(project.id)}>
            {EDIT_ICON}
          </IconButton>
          <IconButton title="Rename" label={`Rename ${project.name}`} onClick={() => onStartRename(project)}>
            {RENAME_ICON}
          </IconButton>
          <IconButton
            title="Copy"
            label={`Copy ${project.name}`}
            onClick={() => onCopy(project)}
            disabled={copyingProjectId === project.id}
          >
            {copyingProjectId === project.id ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
            ) : (
              COPY_ICON
            )}
          </IconButton>
          <IconButton title="Delete" label={`Delete ${project.name}`} onClick={() => onDelete(project)} danger>
            {DELETE_ICON}
          </IconButton>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif] mt-auto">
        <span>Updated {timeAgo(project.updatedAt)}</span>
        <span className="w-1 h-1 rounded-full bg-[#1C2118]/20" />
        <span>{project.itemCount} locations</span>
      </div>
    </div>
  );
}

// ── Variant 4: Accordion / expandable list ────────────────────────────────

function VariantAccordion(props: ProjectViewProps) {
  const {
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
  } = props;

  const isRenaming = renamingId === project.id;

  return (
    <div className="group rounded-md border border-[#1C2118]/10 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#F4F4F3]">
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
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] text-base font-medium hover:underline text-left truncate"
            >
              {project.name}
            </button>
          )}
        </div>
        <span className="text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif] shrink-0">
          Updated {timeAgo(project.updatedAt)}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton title="Edit" label={`Edit ${project.name}`} onClick={() => onOpenProject(project.id)}>
            {EDIT_ICON}
          </IconButton>
          <IconButton title="Rename" label={`Rename ${project.name}`} onClick={() => onStartRename(project)}>
            {RENAME_ICON}
          </IconButton>
          <IconButton
            title="Copy"
            label={`Copy ${project.name}`}
            onClick={() => onCopy(project)}
            disabled={copyingProjectId === project.id}
          >
            {copyingProjectId === project.id ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
            ) : (
              COPY_ICON
            )}
          </IconButton>
          <IconButton title="Delete" label={`Delete ${project.name}`} onClick={() => onDelete(project)} danger>
            {DELETE_ICON}
          </IconButton>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-[#1C2118]/8 flex items-center gap-4 text-xs text-[#1C2118]/50 font-['Instrument_Sans',system-ui,sans-serif]">
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

// ── Variant 5: Sidebar-style nav list ─────────────────────────────────────

function VariantSidebarList(props: ProjectViewProps) {
  const {
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
  } = props;

  const isRenaming = renamingId === project.id;

  return (
    <div className="group flex items-center justify-between gap-2 rounded-md px-2.5 py-2 hover:bg-[#4C5C2D]/8 transition-colors">
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
          <button
            type="button"
            onClick={() => onOpenProject(project.id)}
            className="truncate font-['Instrument_Sans',system-ui,sans-serif] text-[#1C2118] text-sm hover:underline text-left"
          >
            {project.name}
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <IconButton title="Edit" label={`Edit ${project.name}`} onClick={() => onOpenProject(project.id)}>
          {EDIT_ICON}
        </IconButton>
        <IconButton title="Rename" label={`Rename ${project.name}`} onClick={() => onStartRename(project)}>
          {RENAME_ICON}
        </IconButton>
        <IconButton
          title="Copy"
          label={`Copy ${project.name}`}
          onClick={() => onCopy(project)}
          disabled={copyingProjectId === project.id}
        >
          {copyingProjectId === project.id ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#1C2118]/60" />
          ) : (
            COPY_ICON
          )}
        </IconButton>
        <IconButton title="Delete" label={`Delete ${project.name}`} onClick={() => onDelete(project)} danger>
          {DELETE_ICON}
        </IconButton>
      </div>
    </div>
  );
}

// ── timeAgo helper (shared by dense variants) ─────────────────────────────

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

// ── Variant definitions ────────────────────────────────────────────────────

const VARIANTS = [
  { id: 1, name: 'List' },
  { id: 2, name: 'Table' },
  { id: 3, name: 'Cards' },
  { id: 4, name: 'Accordion' },
  { id: 5, name: 'Sidebar' },
] as const;

// ── Main component: segmented control + variant renderer ──────────────────

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
  const [activeVariant, setActiveVariant] = useState(1);

  // Keyboard shortcuts: 1-5 switch variants
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      const num = Number(key);
      if (num >= 1 && num <= 5) {
        setActiveVariant(num);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const renderVariant = (project: ProjectSummary) => {
    const props: ProjectViewProps = {
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
    };
    switch (activeVariant) {
      case 1:
        return <VariantCleanList {...props} />;
      case 2:
        return <VariantTable {...props} />;
      case 3:
        return <VariantCards {...props} />;
      case 4:
        return <VariantAccordion {...props} />;
      case 5:
        return <VariantSidebarList {...props} />;
      default:
        return <VariantCleanList {...props} />;
    }
  };

  return (
    <div>
      {/* ── Segmented control ─────────────────────────────────────────── */}
      <div className="mb-6 inline-flex items-center rounded-lg bg-[#1C2118]/5 p-1 gap-1" role="tablist" aria-label="View variants">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={activeVariant === v.id}
            onClick={() => setActiveVariant(v.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-['Instrument_Sans',system-ui,sans-serif] font-medium transition-colors ${
              activeVariant === v.id
                ? 'bg-white text-[#1C2118] shadow-sm'
                : 'text-[#1C2118]/60 hover:text-[#1C2118]'
            }`}
          >
            <span className="mr-1 text-[#1C2118]/40">{v.id}</span>
            {v.name}
          </button>
        ))}
      </div>

      {/* ── Variant content ───────────────────────────────────────────── */}
      {projects.map((project) => (
        <div key={project.id}>{renderVariant(project)}</div>
      ))}
    </div>
  );
}
