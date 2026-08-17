'use client';

import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { Button } from '@/components/ui/button';
import { Settings, Edit3, Grid3X3, Boxes, TrendingUp, Sparkles, Layers } from 'lucide-react';

interface ConfigTabProps {
  configuration: WarehouseConfiguration | null;
  onEdit: () => void;
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
      <span className="text-xs font-mono font-semibold text-foreground">
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

export function ConfigTab({ configuration, onEdit }: ConfigTabProps) {
  return (
    <div className="flex flex-col h-full p-3 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
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
        <div className="space-y-4">
          {/* Layout */}
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
              value={configuration.layout.aisleWidth}
            />
            <ConfigItem
              icon={<Grid3X3 className="h-3 w-3" />}
              label="Cross Aisles"
              value={configuration.layout.crossAisleCount}
            />
          </div>

          {/* Inventory Generation */}
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

          {/* Inventory Placement */}
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
        </div>
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