'use client';

/**
 * /components gallery - UI primitives (components/ui).
 */

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Info, Package, Plus, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Tabs } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { GalleryEntry } from '../registry';

function Stage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border-default bg-surface p-8 ${className}`}>
      {children}
    </div>
  );
}

/* ── Button ───────────────────────────────────────────────────────────── */

function ButtonDemo() {
  return (
    <Stage className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Simulate</Button>
        <Button variant="secondary">Duplicate</Button>
        <Button variant="outline">Edit config</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Clear layout</Button>
        <Button variant="link">Docs</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Add warehouse">
          <Plus />
        </Button>
        <Button variant="outline">
          <Warehouse /> With icon
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Confirm">
          <Check />
        </Button>
      </div>
    </Stage>
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

function BadgeDemo() {
  return (
    <Stage className="flex flex-wrap items-center gap-3">
      <Badge>Best</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">base</Badge>
      <Badge variant="destructive">Blocked</Badge>
      <Badge className="bg-positive-soft text-positive">+12.4%</Badge>
      <Badge className="bg-warning-soft text-warning">Unplaced SKUs</Badge>
      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
        240 SKUs
      </Badge>
    </Stage>
  );
}

/* ── Alert ────────────────────────────────────────────────────────────── */

function AlertDemo() {
  return (
    <div className="space-y-4">
      <Alert>
        <Info />
        <AlertTitle>Simulation ready</AlertTitle>
        <AlertDescription>All requirements met. Press Simulate to run all three strategies.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Unreachable locations</AlertTitle>
        <AlertDescription>
          The layout blocks workers from reaching some pick locations. Check the aisles before running.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/* ── Input ────────────────────────────────────────────────────────────── */

function InputDemo() {
  return (
    <Stage className="space-y-4">
      <Input placeholder="Warehouse name" defaultValue="Default Warehouse" />
      <Input placeholder="Search SKU" />
      <Input type="number" defaultValue={30} min={1} className="w-32" />
      <Input disabled defaultValue="Locked during simulation" />
    </Stage>
  );
}

/* ── Textarea ─────────────────────────────────────────────────────────── */

function TextareaDemo() {
  return (
    <Stage>
      <Textarea
        rows={5}
        defaultValue={'Keep the aisle width fixed, but try 3 cross-aisles and demand-based slotting.'}
        placeholder="Describe the experiment constraints"
      />
    </Stage>
  );
}

/* ── Slider ───────────────────────────────────────────────────────────── */

function SliderDemo() {
  const [bias, setBias] = useState([60]);
  const [workers, setWorkers] = useState([4]);

  return (
    <Stage className="space-y-8">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-text-primary">Slotting bias</span>
          <span className="text-text-secondary">{bias[0]}</span>
        </div>
        <Slider value={bias} onValueChange={setBias} max={100} step={1} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-text-primary">Workers</span>
          <span className="text-text-secondary">{workers[0]}</span>
        </div>
        <Slider value={workers} onValueChange={setWorkers} min={1} max={20} step={1} />
      </div>
    </Stage>
  );
}

/* ── Progress ─────────────────────────────────────────────────────────── */

function ProgressDemo() {
  const [value, setValue] = useState(35);

  return (
    <Stage className="space-y-6">
      <Progress value={value} />
      <Progress value={value} className="h-3" />
      <div className="flex gap-2">
        {[10, 35, 65, 100].map((v) => (
          <Button key={v} size="sm" variant="outline" onClick={() => setValue(v)}>
            {v}%
          </Button>
        ))}
      </div>
    </Stage>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

function TabsDemo() {
  const [value, setValue] = useState('geometry');

  return (
    <Stage className="space-y-6">
      <Tabs
        label="Layout config sections"
        value={value}
        onValueChange={setValue}
        items={[
          { value: 'geometry', label: 'Geometry' },
          { value: 'inventory', label: 'Inventory' },
          { value: 'placement', label: 'Placement' },
        ]}
      />
      <Tabs
        label="Sidebar section"
        defaultValue="config"
        className="max-w-[200px] !rounded-md border-0 bg-transparent p-0.5 [&_button]:h-5 [&_button]:text-[10px] [&_button]:px-1.5"
        items={[
          { value: 'config', label: 'Config' },
          { value: 'simulation', label: 'Simulation' },
        ]}
      />
    </Stage>
  );
}

/* ── Dialog ───────────────────────────────────────────────────────────── */

function DialogDemo() {
  const [open, setOpen] = useState(true);

  return (
    <Stage>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Package /> Open dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate warehouse</DialogTitle>
            <DialogDescription>
              The copy inherits the layout and the order set. It starts with no simulation results.
            </DialogDescription>
          </DialogHeader>
          <Input defaultValue="Default Warehouse (copy)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stage>
  );
}

/* ── Alert dialog ─────────────────────────────────────────────────────── */

function AlertDialogDemo() {
  const [open, setOpen] = useState(true);

  return (
    <Stage>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Clear warehouse
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire layout?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every shelf, all placement and all generated orders. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep layout</AlertDialogCancel>
            <AlertDialogAction onClick={() => setOpen(false)}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stage>
  );
}

/* ── Popover ──────────────────────────────────────────────────────────── */

function PopoverDemo() {
  return (
    <Stage>
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="outline">
            4 workers <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Worker count</p>
          <p className="mt-2 text-sm text-text-primary">
            Four pickers walk the floor in parallel. Routes are balanced by order volume.
          </p>
        </PopoverContent>
      </Popover>
    </Stage>
  );
}

/* ── Tooltip ──────────────────────────────────────────────────────────── */

function TooltipDemo() {
  return (
    <Stage className="flex items-center justify-center gap-6">
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Add warehouse">
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Add a new warehouse</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Compare warehouses">
            <Warehouse />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Compare warehouses</TooltipContent>
      </Tooltip>
    </Stage>
  );
}

/* ── Empty ────────────────────────────────────────────────────────────── */

function EmptyDemo() {
  return (
    <Stage className="p-0">
      <Empty className="border border-dashed border-border-default">
        <EmptyMedia variant="icon">
          <Warehouse className="h-6 w-6" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No warehouse configured</EmptyTitle>
          <EmptyDescription>
            Generate a layout to start simulating picking strategies.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm">Configure warehouse</Button>
        </EmptyContent>
      </Empty>
    </Stage>
  );
}

export const uiDemos: GalleryEntry[] = [
  { slug: 'button', title: 'Button', group: 'UI', tagline: 'Six variants, five sizes, icon and disabled states.', render: () => <ButtonDemo /> },
  { slug: 'badge', title: 'Badge', group: 'UI', tagline: 'Status pills used across results, headers and tables.', render: () => <BadgeDemo /> },
  { slug: 'alert', title: 'Alert', group: 'UI', tagline: 'Inline info and destructive callouts.', render: () => <AlertDemo /> },
  { slug: 'input', title: 'Input', group: 'UI', tagline: 'Text, number and disabled field states.', render: () => <InputDemo /> },
  { slug: 'textarea', title: 'Textarea', group: 'UI', tagline: 'Multi-line field used for experiment constraints.', render: () => <TextareaDemo /> },
  { slug: 'slider', title: 'Slider', group: 'UI', tagline: 'Radix slider with value readouts.', render: () => <SliderDemo /> },
  { slug: 'progress', title: 'Progress', group: 'UI', tagline: 'Determinate progress bar in two weights.', render: () => <ProgressDemo /> },
  { slug: 'tabs', title: 'Tabs', group: 'UI', tagline: 'Animated active-plate tab bar, standard and compact.', render: () => <TabsDemo /> },
  { slug: 'dialog', title: 'Dialog', group: 'UI', tagline: 'Modal dialog with header, body and footer actions.', render: () => <DialogDemo /> },
  { slug: 'alert-dialog', title: 'Alert dialog', group: 'UI', tagline: 'Destructive confirmation dialog.', render: () => <AlertDialogDemo /> },
  { slug: 'popover', title: 'Popover', group: 'UI', tagline: 'Anchored floating panel for compact choices.', render: () => <PopoverDemo /> },
  { slug: 'tooltip', title: 'Tooltip', group: 'UI', tagline: 'Hover hint attached to icon buttons.', render: () => <TooltipDemo /> },
  { slug: 'empty', title: 'Empty state', group: 'UI', tagline: 'Icon, title, description and action for empty surfaces.', render: () => <EmptyDemo /> },
];
