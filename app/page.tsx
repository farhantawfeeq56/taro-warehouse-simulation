'use client';

import { useState, useCallback } from 'react';
import { ProjectDashboard } from '@/components/taro/project-dashboard';
import { TaroApp } from '@/components/taro/taro-app';

type ViewState =
  | { mode: 'dashboard' }
  | { mode: 'workspace'; projectId: string };

export default function Page() {
  const [view, setView] = useState<ViewState>({ mode: 'dashboard' });

  const handleOpenProject = useCallback((projectId: string) => {
    setView({ mode: 'workspace', projectId });
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setView({ mode: 'dashboard' });
  }, []);

  if (view.mode === 'workspace') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <TaroApp
          initialProjectId={view.projectId}
          onBackToDashboard={handleBackToDashboard}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ProjectDashboard onOpenProject={handleOpenProject} />
    </div>
  );
}
