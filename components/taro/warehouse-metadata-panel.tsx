'use client';

import type {
  Warehouse,
  Order,
  StrategyType,
  SimulationResults,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import type { SimulationReadiness } from '@/lib/taro/readiness';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Warehouse as WarehouseIcon,
  Grid3X3,
  Boxes,
  Package,
  ClipboardList,
  MapPin,
  User,
  Settings2,
  Layers,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

interface WarehouseMetadataPanelProps {
  /** The active workspace warehouse entry (provides name + configuration). */
  activeWorkspaceWarehouse: WorkspaceWarehouse | null;
  warehouse: Warehouse | null;
  orders: Order[];
  configuration: WarehouseConfiguration | null;
  readiness?: SimulationReadiness;
  simulationResults: SimulationResults | null;
  activeStrategy: StrategyType | null;
  workerCount: number;
  isSimulating: boolean;
}

interface MetaRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}

function MetaRow({ icon, label, value, hint }: MetaRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {label}
        </div>
        <div className="text-sm font-mono text-foreground truncate">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1">
      {children}
    </div>
  );
}

const layoutTypeLabels: Record<string, string> = {
  parallel: 'Parallel',
  'cross-aisle': 'Cross Aisle',
  fishbone: 'Fishbone',
};

export function WarehouseMetadataPanel({
  activeWorkspaceWarehouse,
  warehouse,
  orders,
  configuration,
  readiness,
  simulationResults,
  activeStrategy,
  workerCount,
  isSimulating,
}: WarehouseMetadataPanelProps) {
  if (!warehouse) {
    return (
      <div className="w-72 border-l border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Warehouse Metadata</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-xs text-muted-foreground text-center">No warehouse selected.</p>
        </div>
      </div>
    );
  }

  const shelfCount = warehouse.shelves.length;
  const binCount = warehouse.grid
    .flat()
    .filter((cell) => cell.type === 'shelf')
    .reduce((sum, cell) => sum + cell.locations.length, 0);
  const skuCount = new Set(
    warehouse.grid
      .flat()
      .flatMap((cell) => cell.locations.map((loc) => loc.sku))
  ).size;

  const isReady = readiness?.status === 'READY';
  const readinessLabel = isReady ? 'Ready' : 'Not Ready';
  const readinessVariant: 'outline' | 'destructive' = isReady ? 'outline' : 'destructive';
  const readinessColor = isReady
    ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
    : 'text-red-600 border-red-200 bg-red-50';

  const cfg = configuration;

  return (
    <div className="w-72 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <WarehouseIcon className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold text-foreground truncate">Metadata</h2>
          </div>
          {isSimulating ? (
            <Badge variant="secondary" className="text-[10px] uppercase font-bold">
              Simulating
            </Badge>
          ) : simulationResults ? (
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-blue-600 border-blue-200 bg-blue-50">
              Simulated
            </Badge>
          ) : (
            <Badge variant={readinessVariant} className={cn('text-[10px] uppercase font-bold', readinessColor)}>
              {readinessLabel}
            </Badge>
          )}
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground truncate">
          {activeWorkspaceWarehouse?.name ?? 'Untitled'}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* Geometry */}
        <div>
          <SectionTitle>Geometry</SectionTitle>
          <div className="divide-y divide-border/60">
            <MetaRow
              icon={<Grid3X3 className="h-3.5 w-3.5" />}
              label="Grid"
              value={`${warehouse.width} × ${warehouse.height}`}
              hint={`${warehouse.width * warehouse.height} cells`}
            />
            <MetaRow
              icon={<Boxes className="h-3.5 w-3.5" />}
              label="Shelves"
              value={shelfCount}
            />
            <MetaRow
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Bins"
              value={binCount}
              hint={`${warehouse.grid.flat().filter((c) => c.type === 'shelf').length} shelf cells`}
            />
            <MetaRow
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Worker Start"
              value={
                warehouse.workerStart
                  ? `(${warehouse.workerStart.x}, ${warehouse.workerStart.y})`
                  : 'Not set'
              }
            />
          </div>
        </div>

        {/* Inventory */}
        <div>
          <SectionTitle>Inventory</SectionTitle>
          <div className="divide-y divide-border/60">
            <MetaRow
              icon={<Package className="h-3.5 w-3.5" />}
              label="Unique SKUs"
              value={skuCount}
            />
            <MetaRow
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Orders"
              value={orders.length}
              hint={orders.length > 0 ? `${orders.reduce((s, o) => s + o.items.length, 0)} line items` : 'No orders'}
            />
            <MetaRow
              icon={<User className="h-3.5 w-3.5" />}
              label="Workers"
              value={workerCount}
            />
          </div>
        </div>

        {/* Configuration */}
        {cfg && (
          <div>
            <SectionTitle>Configuration</SectionTitle>
            <div className="divide-y divide-border/60">
              <MetaRow
                icon={<Settings2 className="h-3.5 w-3.5" />}
                label="Layout Type"
                value={layoutTypeLabels[cfg.layout.type] ?? cfg.layout.type}
              />
              <MetaRow
                icon={<Grid3X3 className="h-3.5 w-3.5" />}
                label="Rack Count"
                value={cfg.layout.rackCount}
              />
              <MetaRow
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Aisle Width"
                value={cfg.layout.aisleWidth}
              />
              <MetaRow
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Demand Dist."
                value={`${cfg.inventory.demandDistribution}%`}
              />
              <MetaRow
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Affinity"
                value={`${cfg.inventory.productAffinity}%`}
              />
              <MetaRow
                icon={<Boxes className="h-3.5 w-3.5" />}
                label="Footprint"
                value={`${cfg.inventory.storageFootprint}%`}
              />
              <MetaRow
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Slotting Bias"
                value={`${cfg.placement.slottingBias}%`}
              />
              <MetaRow
                icon={<Layers className="h-3.5 w-3.5" />}
                label="Cat. Clustering"
                value={`${cfg.placement.categoryClustering}%`}
              />
            </div>
          </div>
        )}

        {/* Simulation */}
        {(simulationResults || activeStrategy) && (
          <div>
            <SectionTitle>Simulation</SectionTitle>
            <div className="divide-y divide-border/60">
              {activeStrategy && (
                <MetaRow
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Active Route"
                  value={activeStrategy.replace('-', ' ')}
                  hint={simulationResults ? `${simulationResults.strategies.length} strategies evaluated` : ''}
                />
              )}
              {simulationResults && (
                <>
                  <MetaRow
                    icon={<Boxes className="h-3.5 w-3.5" />}
                    label="Best Strategy"
                    value={simulationResults.bestStrategy.replace('-', ' ')}
                  />
                  {(() => {
                    const best = simulationResults.strategies.find(
                      (s) => s.strategy === simulationResults.bestStrategy
                    );
                    return best ? (
                      <>
                        <MetaRow
                          icon={<TrendingUp className="h-3.5 w-3.5" />}
                          label="Best Efficiency"
                          value={`${best.efficiency}%`}
                        />
                        <MetaRow
                          icon={<MapPin className="h-3.5 w-3.5" />}
                          label="Best Distance"
                          value={`${best.totalDistance}m`}
                        />
                        <MetaRow
                          icon={<User className="h-3.5 w-3.5" />}
                          label="Best Time"
                          value={`${best.estimatedTime} min`}
                        />
                      </>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        {orders.length} orders · {shelfCount} shelves · {binCount} bins
      </div>
    </div>
  );
}