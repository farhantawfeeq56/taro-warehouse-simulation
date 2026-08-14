'use client';

import { useState, useCallback } from 'react';
import { ProjectDashboard } from '@/components/taro/project-dashboard';
import { TaroApp } from '@/components/taro/taro-app';
import { ShelfVisualVariantsTest } from '@/components/taro/shelf-visual-variants-test';

type ViewState =
  | { mode: 'dashboard' }
  | { mode: 'workspace'; projectId: string }
  | { mode: 'shelf-test' };

export default function Page() {
  const [view, setView] = useState<ViewState>({ mode: 'shelf-test' });

  // FEAT123 testing: start directly on the shelf-visual-variants test screen.
  // Change the initial state above to { mode: 'dashboard' } to restore the app.

  const handleOpenProject = useCallback((projectId: string) => {
    setView({ mode: 'workspace', projectId });
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setView({ mode: 'dashboard' });
  }, []);

  if (view.mode === 'shelf-test') {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <ShelfVisualVariantsTest />
      </div>
    );
  }

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
