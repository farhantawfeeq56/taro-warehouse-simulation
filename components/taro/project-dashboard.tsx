'use client';

import React from 'react';
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
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  status: 'In Progress' | 'Completed' | 'Draft';
  itemCount: number;
  workerCount: number;
}

interface SavedLayout {
  id: string;
  name: string;
  thumbnail: string;
}

const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Q1 Peak Season Optimization',
    updatedAt: '2 hours ago',
    status: 'In Progress',
    itemCount: 1250,
    workerCount: 3,
  },
  {
    id: '2',
    name: 'North Wing Reorganization',
    updatedAt: 'Yesterday',
    status: 'Draft',
    itemCount: 450,
    workerCount: 1,
  },
  {
    id: '3',
    name: 'Automated Picking Test',
    updatedAt: '3 days ago',
    status: 'Completed',
    itemCount: 3200,
    workerCount: 5,
  },
  {
    id: '4',
    name: 'Holiday Rush Simulation',
    updatedAt: '1 week ago',
    status: 'Completed',
    itemCount: 5000,
    workerCount: 8,
  },
];

const MOCK_LAYOUTS: SavedLayout[] = [
  { id: 'l1', name: 'Main Distribution Center', thumbnail: 'MDC' },
  { id: 'l2', name: 'West Coast Hub', thumbnail: 'WCH' },
  { id: 'l3', name: 'Regional Sorting Facility', thumbnail: 'RSF' },
  { id: 'l4', name: 'Urban Micro-fulfillment', thumbnail: 'UMF' },
  { id: 'l5', name: 'E-commerce Dark Store', thumbnail: 'EDS' },
];

interface ProjectDashboardProps {
  onOpenProject: (projectId: string) => void;
}

export function ProjectDashboard({ onOpenProject }: ProjectDashboardProps) {
  const latestProject = MOCK_PROJECTS[0];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Project Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your warehouse simulations and layouts.</p>
          </div>
          <Button onClick={() => onOpenProject('new')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Continue Section */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Continue Working</h2>
          <Card className="border-2 border-primary/10 shadow-md hover:border-primary/20 transition-colors bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-none">
                    {latestProject.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Updated {latestProject.updatedAt}
                  </span>
                </div>
                <CardTitle className="text-2xl mb-2">{latestProject.name}</CardTitle>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    {latestProject.itemCount} Items
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutIcon className="h-4 w-4" />
                    {latestProject.workerCount} Workers
                  </span>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center border-l border-slate-100 dark:border-slate-800">
                <Button size="lg" onClick={() => onOpenProject(latestProject.id)} className="gap-2 px-8">
                  Continue Project
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Projects Grid */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">All Projects</h2>
            <Button variant="ghost" size="sm" className="text-xs">View All</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_PROJECTS.map((project) => (
              <Card key={project.id} className="group hover:shadow-md transition-shadow bg-white dark:bg-slate-900">
                <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base group-hover:text-primary transition-colors cursor-pointer" onClick={() => onOpenProject(project.id)}>
                      {project.name}
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {project.updatedAt}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2">
                        <Edit2 className="h-4 w-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Copy className="h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      <Separator className="my-1" />
                      <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardFooter className="p-4 pt-2 flex justify-between items-center">
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] py-0 h-5">
                      {project.itemCount} items
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onOpenProject(project.id)} className="h-8 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        {/* Saved Layouts */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Saved Layouts</h2>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <Plus className="h-3 w-3" /> Create layout
            </Button>
          </div>
          <ScrollArea className="w-full whitespace-nowrap rounded-md border-none pb-4">
            <div className="flex w-max space-x-4 p-1">
              {MOCK_LAYOUTS.map((layout) => (
                <div key={layout.id} className="w-48 group cursor-pointer">
                  <div className="aspect-video mb-2 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-800 group-hover:border-primary/30 transition-colors">
                    <span className="text-2xl font-bold text-slate-400 dark:text-slate-600">{layout.thumbnail}</span>
                  </div>
                  <h3 className="text-sm font-medium truncate group-hover:text-primary transition-colors">{layout.name}</h3>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
