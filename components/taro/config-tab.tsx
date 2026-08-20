'use client';

/**
 * Config tab — read-only view of the saved warehouse configuration.
 *
 * vartest5: the three option groups (Geometry / Inventory / Placement) are
 * rendered as tabs instead of stacked sections, with five tab-navigation
 * visual directions switched by a floating segmented toolbar (bottom-right,
 * keys 1–5).
 */

import { useEffect, useState } from 'react';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { Button } from '@/components/ui/button';
import { Settings, Edit3, Grid3X3, Boxes, TrendingUp, Sparkles, Layers } from 'lucide-react';
import { TabBar, TabVariantToolbar, type TabVariant } from './section-tabs';

interface ConfigTabProps {
  configuration: WarehouseConfiguration | null;
  onEdit: () => void;
  /**
   * When true (used inside the compact dock), render all three option
   * groups (Geometry / Inventory / Placement) stacked vertically with no
   * tabs and no variant toolbar.
   */
  stacked?: boolean;
}

interface ConfigItemProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  suffix?: string;
}

function ConfigItem({ icon, label, value, suffix }: ConfigItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="text-xs font-sans font-semibold text-foreground">
        {value}
        {suffix && <span className="text-muted-foreground font-normal ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
        {children}
      </h3>
    </div>
  );
}

type ConfigTabId = 'geometry' | 'inventory' | 'placement';

const TABS: { id: ConfigTabId; title: string; icon: typeof Grid3X3; subtitle: string }[] = [
  { id: 'geometry', title: 'Geometry', icon: Grid3X3, subtitle: 'Racks, aisles & thoroughfares' },
  { id: 'inventory', title: 'Inventory', icon: Boxes, subtitle: 'Catalogue, demand & affinity' },
  { id: 'placement', title: 'Placement', icon: TrendingUp, subtitle: 'Slotting & zoning' },
];

function TabBody({
  id,
  configuration,
}: {
  id: ConfigTabId;
  configuration: WarehouseConfiguration;
}) {
  if (id === 'geometry') {
    return (
      <div className="border border-border rounded-lg p-3 bg-muted/20">
        <SectionTitle icon={<Grid3X3 className="h-3 w-3" />}>Warehouse Geometry</SectionTitle>
        <ConfigItem
          icon={<Layers className="h-3 w-3" />}
          label="Grid Height"
          value={configuration.layout.gridHeight}
        />
        <ConfigItem
          icon={<Boxes className="h-3 w-3" />}
          label="Rack Count"
          value={configuration.layout.rackCount}
        />
        <ConfigItem
          icon={<Sparkles className="h-3 w-3" />}
          label="Aisle Width"
          value="1"
        />
        <ConfigItem
          icon={<Grid3X3 className="h-3 w-3" />}
          label="Cross Aisles"
          value={configuration.layout.crossAisleCount}
        />
      </div>
    );
  }
  if (id === 'inventory') {
    return (
      <div className="border border-border rounded-lg p-3 bg-muted/20">
        <SectionTitle icon={<Boxes className="h-3 w-3" />}>Inventory Generation</SectionTitle>
        <ConfigItem
          icon={<Boxes className="h-3 w-3" />}
          label="SKU Count"
          value={configuration.inventory.skuCount.toLocaleString()}
        />
        <ConfigItem
          icon={<TrendingUp className="h-3 w-3" />}
          label="Demand Dist."
          value={configuration.inventory.demandDistribution}
          suffix="%"
        />
        <ConfigItem
          icon={<Sparkles className="h-3 w-3" />}
          label="Product Affinity"
          value={configuration.inventory.productAffinity}
          suffix="%"
        />
        <ConfigItem
          icon={<Layers className="h-3 w-3" />}
          label="Storage Footprint"
          value={configuration.inventory.storageFootprint}
          suffix="%"
        />
      </div>
    );
  }
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/20">
      <SectionTitle icon={<TrendingUp className="h-3 w-3" />}>Inventory Placement</SectionTitle>
      <ConfigItem
        icon={<TrendingUp className="h-3 w-3" />}
        label="Slotting Bias"
        value={configuration.placement.slottingBias}
        suffix="%"
      />
      <ConfigItem
        icon={<Layers className="h-3 w-3" />}
        label="Category Clustering"
        value={configuration.placement.categoryClustering}
        suffix="%"
      />
    </div>
  );
}

export function ConfigTab({ configuration, onEdit, stacked = false }: ConfigTabProps) {
  const [activeTab, setActiveTab] = useState<ConfigTabId>('geometry');
  const [tabVariant, setTabVariant] = useState<TabVariant>(1);

  // Keys 1–5 switch the tab-navigation direction (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) setTabVariant(n as TabVariant);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative flex flex-col h-full gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Layout Configuration</h2>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit} className="h-7 text-xs">
          <Edit3 className="h-3 w-3 mr-1.5" />
          Edit
        </Button>
      </div>

      {configuration ? (
        stacked ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <TabBody id="geometry" configuration={configuration} />
              <TabBody id="inventory" configuration={configuration} />
              <TabBody id="placement" configuration={configuration} />
            </div>
          </>
        ) : (
          <>
          <div className="shrink-0">
            <TabBar
              cards={TABS}
              active={activeTab}
              onSelect={(id) => setActiveTab(id as ConfigTabId)}
              variant={tabVariant}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <TabBody id={activeTab} configuration={configuration} />
          </div>

          <TabVariantToolbar active={tabVariant} onSelect={setTabVariant} />
          </>
        )
      ) : (
        <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
          <Settings className="h-8 w-8 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No configuration saved</p>
            <p className="text-xs text-muted-foreground">
              This warehouse was created manually. Generate one to track its configuration.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onEdit} className="h-8 text-xs">
            <Edit3 className="h-3.5 w-3.5 mr-1.5" />
            Configure Warehouse
          </Button>
        </div>
      )}
    </div>
  );
}
