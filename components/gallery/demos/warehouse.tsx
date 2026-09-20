'use client';

/**
 * /components gallery - warehouse (Taro) components.
 *
 * Each demo wires the real component to a generated demo session. No
 * component is modified: they receive exactly the props the app passes.
 */

import { useMemo, useState } from 'react';
import type { WorkspaceWarehouse } from '@/lib/taro/types';
import { DEFAULT_LABOR_PROFILE, DEFAULT_WAREHOUSE_PROFILE } from '@/lib/taro/constants';
import { collectSkuMetadata } from '@/lib/taro/inventory';
import { computePlacementPreview, PREVIEW_MAX_ITEMS } from '@/lib/taro/inventory-placement';
import { toWarehouseInsight } from '@/lib/taro/experiment-recommendation';
import { WarehouseSvgRenderer } from '@/components/taro/warehouse-svg-renderer';
import { MultiWarehouseScroll } from '@/components/taro/multi-warehouse-scroll';
import { RightSidebar } from '@/components/taro/right-sidebar';
import { SimulationPanel } from '@/components/taro/simulation-panel';
import { ConfigTab } from '@/components/taro/config-tab';
import { CompareView } from '@/components/taro/compare-view';
import { CompareGateModal, type CompareGateState } from '@/components/taro/compare-gate-modal';
import { ValidationModal } from '@/components/taro/validation-modal';
import { LayoutConfigOverlay } from '@/components/taro/layout-config-overlay';
import { PreviewStats } from '@/components/taro/layout-config-variants';
import { AiSuggestion } from '@/components/taro/experiment-recommendation-card';
import { AffinityGrid } from '@/components/taro/affinity-view';
import { TaroApp } from '@/components/taro/taro-app';
import { Button } from '@/components/ui/button';
import { DEMO_WORKER_COUNT, useDemoSession, useReplayProgress } from '../session';
import type { GalleryEntry } from '../registry';

const noop = () => {};

/** The warehouse list the app would hand the canvas. */
function toWorkspace(demos: ReturnType<typeof useDemoSession>['warehouses']): WorkspaceWarehouse[] {
  return demos.map((d) => ({
    id: d.id,
    name: d.name,
    position: null,
    warehouse: d.warehouse,
    configuration: d.configuration,
  }));
}

function bestRoute(demo: { results: ReturnType<typeof useDemoSession>['base']['results'] }) {
  if (!demo.results) return null;
  return demo.results.strategies.find((s) => s.strategy === demo.results!.bestStrategy) ?? null;
}

/* ── Full app shell ───────────────────────────────────────────────────── */

function AppShellDemo() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TaroApp />
    </div>
  );
}

/* ── Warehouse canvas ─────────────────────────────────────────────────── */

function CanvasDemo() {
  const { base } = useDemoSession();
  const progressRef = useReplayProgress();

  return (
    <div className="flex h-[70vh] min-h-[420px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface">
      <WarehouseSvgRenderer
        warehouseId={base.id}
        warehouse={base.warehouse}
        onWarehouseChange={noop}
        selectedTool="select"
        activeRoute={bestRoute(base)}
        animationProgressRef={progressRef}
        zVisualizationMode="all"
        animationReplayId={0}
        zoom={1}
      />
    </div>
  );
}

/* ── Workspace scroll (page-per-warehouse) ────────────────────────────── */

function ScrollDemo() {
  const { warehouses } = useDemoSession();
  const [activeId, setActiveId] = useState(warehouses[0].id);
  const progressRef = useReplayProgress();
  const list = useMemo(() => toWorkspace(warehouses), [warehouses]);
  const active = warehouses.find((w) => w.id === activeId) ?? warehouses[0];

  return (
    <div className="h-[78vh] min-h-[520px] w-full max-w-5xl overflow-hidden rounded-xl border border-border-default bg-surface">
      <MultiWarehouseScroll
        warehouses={list}
        activeWarehouseId={activeId}
        onActiveChange={setActiveId}
        onWarehouseChange={noop}
        onAddWarehouse={noop}
        onDuplicateWarehouse={noop}
        onRenameWarehouse={noop}
        onDeleteWarehouse={noop}
        onCompareWarehouse={noop}
        onEditWarehouse={noop}
        selectedTool="select"
        activeRoute={bestRoute(active)}
        animationProgressRef={progressRef}
        zVisualizationMode="all"
        animationReplayId={0}
      />
    </div>
  );
}

/* ── Right sidebar ────────────────────────────────────────────────────── */

function SidebarDemo() {
  const { base } = useDemoSession();
  const [orderCount, setOrderCount] = useState(30);
  const [avgOrderSize, setAvgOrderSize] = useState(3);
  const [workerCount, setWorkerCount] = useState(DEMO_WORKER_COUNT);

  return (
    <div className="flex h-[760px] w-80 overflow-hidden rounded-xl border border-border-default bg-secondary">
      <RightSidebar
        orders={base.orders}
        onGenerateOrders={noop}
        orderCount={orderCount}
        avgOrderSize={avgOrderSize}
        onOrderCountChange={setOrderCount}
        onAvgOrderSizeChange={setAvgOrderSize}
        warehouse={base.warehouse}
        simulationResults={base.results}
        readiness={base.readiness}
        isSimulating={false}
        activeStrategy={base.results?.bestStrategy ?? null}
        onStrategySelect={noop}
        animationProgress={0.4}
        workerCount={workerCount}
        onWorkerCountChange={setWorkerCount}
        executionPlan={null}
        onSimulate={noop}
        configuration={base.configuration}
        onEditConfig={noop}
      />
    </div>
  );
}

/* ── Simulation panel ─────────────────────────────────────────────────── */

function SimulationPanelDemo() {
  const { base } = useDemoSession();
  const [workerCount, setWorkerCount] = useState(DEMO_WORKER_COUNT);

  return (
    <div className="flex flex-wrap items-start gap-6">
      {(['setup', 'simulation'] as const).map((step) => (
        <div key={step} className="flex h-[720px] w-80 flex-col overflow-hidden rounded-xl border border-border-default bg-surface">
          <SimulationPanel
            embedded
            flowStep={step}
            orders={base.orders}
            onGenerateOrders={noop}
            orderCount={30}
            avgOrderSize={3}
            onOrderCountChange={noop}
            onAvgOrderSizeChange={noop}
            warehouse={base.warehouse}
            results={base.results}
            readiness={base.readiness}
            isSimulating={false}
            activeStrategy={base.results?.bestStrategy ?? null}
            onStrategySelect={noop}
            animationProgress={0.4}
            workerCount={workerCount}
            onWorkerCountChange={setWorkerCount}
            executionPlan={null}
            onSimulate={noop}
            onFlowStepChange={noop}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Config tab ───────────────────────────────────────────────────────── */

function ConfigDemo() {
  const { base } = useDemoSession();
  return (
    <div className="w-80 overflow-hidden rounded-xl border border-border-default bg-secondary">
      <ConfigTab configuration={base.configuration} onEdit={noop} />
    </div>
  );
}

/* ── Compare view ─────────────────────────────────────────────────────── */

function CompareDemo() {
  const { warehouses } = useDemoSession();
  const list = useMemo(() => toWorkspace(warehouses).slice(0, 2), [warehouses]);
  const ordersByWarehouse = useMemo(
    () => Object.fromEntries(warehouses.slice(0, 2).map((w) => [w.id, w.orders])),
    [warehouses],
  );

  return (
    <div className="h-full w-full overflow-hidden">
      <CompareView
        warehouses={list}
        ordersByWarehouse={ordersByWarehouse}
        baseWarehouseId={list[0]?.id ?? null}
        workerCount={DEMO_WORKER_COUNT}
        warehouseProfile={DEFAULT_WAREHOUSE_PROFILE}
        laborProfile={DEFAULT_LABOR_PROFILE}
        onExit={noop}
        onGenerateExperiment={async () => {}}
      />
    </div>
  );
}

/* ── Compare gate modal ───────────────────────────────────────────────── */

function CompareGateDemo() {
  const [state, setState] = useState<CompareGateState | null>({
    mode: 'single',
    warehouseName: 'Default Warehouse',
  });

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setState({ mode: 'single', warehouseName: 'Default Warehouse' })}
        className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-text-primary"
      >
        Single warehouse
      </button>
      <button
        type="button"
        onClick={() =>
          setState({
            mode: 'duplicates',
            groups: [[
              { id: 'a', name: 'Default Warehouse' },
              { id: 'b', name: 'Default Warehouse (copy)' },
            ]],
          })
        }
        className="rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-text-primary"
      >
        Duplicate layouts
      </button>
      <CompareGateModal
        state={state}
        onClose={() => setState(null)}
        onAddWarehouse={noop}
        onNavigate={noop}
      />
    </div>
  );
}

/* ── Validation modal ─────────────────────────────────────────────────── */

function ValidationDemo() {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Reopen missing-items alert
      </Button>
      <ValidationModal
        open={open}
        validationContext={{ totalItems: 12, missingItems: 7, affectedOrders: 3, missingItemsByOrder: [] }}
        onClose={() => setOpen(false)}
        onFixItems={() => setOpen(false)}
      />
    </div>
  );
}

/* ── Layout config overlay ────────────────────────────────────────────── */

function LayoutConfigDemo() {
  return <LayoutConfigOverlay onClose={noop} canClose onApply={noop} />;
}

/* ── Preview stats ────────────────────────────────────────────────────── */

function PreviewStatsDemo() {
  return <PreviewStats />;
}

/* ── AI experiment suggestion ─────────────────────────────────────────── */

function AiSuggestionDemo() {
  const { warehouses } = useDemoSession();
  const insights = useMemo(
    () =>
      warehouses
        .filter((w) => w.results)
        .map((w) => toWarehouseInsight(w.id, w.name, w.configuration, w.results!)),
    [warehouses],
  );

  return (
    <div className="w-full max-w-2xl rounded-xl border border-border-default bg-surface p-4">
      <AiSuggestion insights={insights} isRunning={false} onGenerate={async () => {}} />
    </div>
  );
}

/* ── Affinity grid ────────────────────────────────────────────────────── */

function AffinityDemo() {
  const { base } = useDemoSession();

  const preview = useMemo(
    () =>
      computePlacementPreview(base.warehouse, {
        items: collectSkuMetadata(base.warehouse).map((meta) => ({
          id: meta.skuId,
          demandScore: meta.demandScore,
          affinityGroup: meta.affinityGroup,
          totalQuantity: 50,
        })),
        slottingBias: base.configuration.placement.slottingBias,
        categoryClustering: base.configuration.placement.categoryClustering,
        previewMaxItems: PREVIEW_MAX_ITEMS,
      }),
    [base],
  );

  const shelfLookup = useMemo(
    () => new Map(preview.shelves.map((s) => [`${s.x},${s.y}`, s])),
    [preview],
  );

  return (
    <div className="w-max rounded-xl border border-border-default bg-surface p-4">
      <AffinityGrid
        grid={base.warehouse.grid}
        shelfLookup={shelfLookup}
        cellSize={16}
        fullWidth={base.warehouse.width}
        fullHeight={base.warehouse.height}
      />
    </div>
  );
}

/* ── Entries ──────────────────────────────────────────────────────────── */

export const warehouseDemos: GalleryEntry[] = [
  {
    slug: 'app-shell',
    title: 'App shell',
    group: 'Warehouse',
    tagline: 'The full TaroApp - a real session that boots into the layout config.',
    bleed: true,
    render: () => <AppShellDemo />,
  },
  {
    slug: 'warehouse-canvas',
    title: 'Warehouse canvas',
    group: 'Warehouse',
    tagline: 'SVG picking floor with paper bays, worker trails and replay.',
    render: () => <CanvasDemo />,
  },
  {
    slug: 'workspace-scroll',
    title: 'Workspace scroll',
    group: 'Warehouse',
    tagline: 'Page-per-warehouse scroll with the inline page header and actions.',
    render: () => <ScrollDemo />,
  },
  {
    slug: 'right-sidebar',
    title: 'Right sidebar',
    group: 'Warehouse',
    tagline: 'Config / Simulation tab shell that sits in-flow beside the canvas.',
    render: () => <SidebarDemo />,
  },
  {
    slug: 'simulation-panel',
    title: 'Simulation panel',
    group: 'Warehouse',
    tagline: 'Orders, workers, readiness checklist and ranked strategy results.',
    render: () => <SimulationPanelDemo />,
  },
  {
    slug: 'config-tab',
    title: 'Config tab',
    group: 'Warehouse',
    tagline: 'Read-only geometry / inventory / placement summary.',
    render: () => <ConfigDemo />,
  },
  {
    slug: 'compare-view',
    title: 'Compare view',
    group: 'Warehouse',
    tagline: 'Side-by-side warehouse comparison with ranked metrics.',
    bleed: true,
    render: () => <CompareDemo />,
  },
  {
    slug: 'compare-gate-modal',
    title: 'Compare gate modal',
    group: 'Warehouse',
    tagline: 'The two guard states before a comparison can run.',
    render: () => <CompareGateDemo />,
  },
  {
    slug: 'validation-modal',
    title: 'Validation modal',
    group: 'Warehouse',
    tagline: 'Missing-items alert that blocks a simulation run.',
    render: () => <ValidationDemo />,
  },
  {
    slug: 'layout-config',
    title: 'Layout config overlay',
    group: 'Warehouse',
    tagline: 'Full-screen generator: sliders, live preview and Generate dock.',
    bleed: true,
    render: () => <LayoutConfigDemo />,
  },
  {
    slug: 'preview-stats',
    title: 'Preview stats',
    group: 'Warehouse',
    tagline: 'Four summary cards for the generated warehouse.',
    render: () => <PreviewStatsDemo />,
  },
  {
    slug: 'ai-suggestion',
    title: 'AI suggestion',
    group: 'Warehouse',
    tagline: 'Collapsed experiment nudge that expands into a recommendation.',
    render: () => <AiSuggestionDemo />,
  },
  {
    slug: 'affinity-grid',
    title: 'Affinity grid',
    group: 'Warehouse',
    tagline: 'Live placement preview - shelves shaded by affinity group.',
    render: () => <AffinityDemo />,
  },
];
