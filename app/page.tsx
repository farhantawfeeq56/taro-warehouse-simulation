'use client';

import { useState } from 'react';
import { TaroApp } from '@/components/taro/taro-app';
import { ProjectDashboard } from '@/components/taro/project-dashboard';

export default function Page() {
  const [view, setView] = useState<'dashboard' | 'app'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setView('app');
  };

  const handleBackToDashboard = () => {
    setView('dashboard');
    setSelectedProjectId(null);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {view === 'dashboard' ? (
        <ProjectDashboard onOpenProject={handleOpenProject} />
      ) : (
        <TaroApp onBack={handleBackToDashboard} />
      )}
    </div>
  );
}
