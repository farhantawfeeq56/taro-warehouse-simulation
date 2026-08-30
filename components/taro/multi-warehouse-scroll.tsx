'use client';

/**
 * MultiWarehouseScroll — vertical, page-based warehouse canvas.
 *
 * Re-introduces multiple warehouses in a "Canva pages" style: each warehouse
 * occupies a full-height page stacked vertically, and you scroll down to move
 * between them. Unlike the old React Flow canvas (arbitrary node positions),
 * the screen always shows exactly ONE warehouse at a time — the page currently
 * scrolled into view.
 *
 *   • The page nearest the scroll container's vertical centre becomes the
 *     ACTIVE warehouse, which drives the right sidebar (config + simulation).
 *   • Each page has a header strip above its warehouse with action buttons
 *     (Add / Duplicate / Rename / Delete) that apply to that warehouse.
 *   • Adding or duplicating auto-scrolls the new warehouse into view.
 *   • Renaming is handled inline (an input replaces the header during rename).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  StrategyResult,
  ToolType,
  ZVisualizationMode,
  WorkspaceWarehouse,
  Warehouse,
} from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import { WarehouseSvgRenderer } from './warehouse-svg-renderer';
import { Plus, Copy, Pencil, Trash2, GitCompareArrows, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Padding (px) kept between the warehouse and the page edges when fitting. */
const FIT_PADDING = 24;
/** Approximate height (px) of the card's name/actions header bar. */
const HEADER_H = 32;
/**
 * Upper bound on how much a smaller warehouse may be upscaled to fill a page.
 * Vector SVG stays crisp at any scale; this just keeps a tiny warehouse from
 * ballooning absurdly large inside a huge viewport.
 */
const MAX_UPSCALE = 1.5;
/** How far a section must be inside the viewport before we call it "visible". */
const VISIBILITY_MARGIN = 40;

/** How the full-size warehouse controls are placed relative to the card. */
type ControlPlacement = 'inside' | 'above' | 'below' | 'bottom-right' | 'top-right';

/**
 * vartest5: control-placement variants (segmented control bottom-right,
 * keyboard 1–5 switches between them).
 */
const PLACEMENT_VARIANTS: {
  key: string;
  label: string;
  placement: ControlPlacement;
  className: string;
}[] = [
  { key: '1', label: 'Inside', placement: 'inside', className: '' },
  { key: '2', label: 'Above', placement: 'above', className: 'top-3 left-1/2 -translate-x-1/2' },
  { key: '3', label: 'Below', placement: 'below', className: 'bottom-3 left-1/2 -translate-x-1/2' },
  { key: '4', label: 'Top-right', placement: 'top-right', className: 'top-3 right-3' },
  { key: '5', label: 'Bottom-right', placement: 'bottom-right', className: 'bottom-3 right-3' },
];

interface MultiWarehouseScrollProps {
  warehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onActiveChange: (id: string) => void;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onAddWarehouse: () => void;
  onDuplicateWarehouse: (warehouseId: string) => void;
  onRenameWarehouse: (warehouseId: string, name: string) => void;
  onDeleteWarehouse?: (warehouseId: string) => void;
  onCompareWarehouse: (warehouseId: string) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
}

function ActionButton({
  onClick,
  title,
  label,
  icon: Icon,
  danger = false,
  showLabel = false,
}: {
  onClick: () => void;
  title: string;
  label: string;
  icon: typeof Plus;
  danger?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn(
        'flex h-6 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors',
        showLabel ? 'px-2' : 'w-6 px-0',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

function PageHeader({
  name,
  isActive,
  renaming,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAdd,
  onDuplicate,
  onDelete,
  onCompare,
  detached = false,
}: {
  name: string;
  isActive: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  onCompare: () => void;
  /** vartest5: render as a standalone floating bar (no card frame) for v2/v4. */
  detached?: boolean;
}) {
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (renaming) setDraft(name);
  }, [renaming, name]);

  // Commit on Enter, cancel on Escape.
  useEffect(() => {
    if (!renaming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommitRename(draft.trim() || name);
      } else if (e.key === 'Escape') {
        onCancelRename();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming, draft]);

  return (
    <div
      className={cn(
        'shrink-0 flex items-center gap-2 px-3 py-1.5 border-b rounded-t-md transition-colors',
        isActive
          ? 'bg-surface border-border'
          : 'bg-muted/40 border-border/60',
        // vartest5 v3: transparent when detached so it doesn't fight the page bg
        detached && 'border-b-0 bg-transparent',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          isActive ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      />
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitRename(draft.trim() || name)}
          className="h-6 w-40 rounded border border-border bg-background px-2 text-xs font-medium outline-none focus:border-primary"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <h3
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold truncate',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Sparkles className="h-3 w-3 shrink-0 text-primary/70" />
          {name}
        </h3>
      )}

      <div className="flex-1" />

      {isActive && (
        <div className="flex items-center gap-0.5">
          <ActionButton onClick={onAdd} title="Add a new warehouse" label="Add" icon={Plus} />
          <ActionButton onClick={onDuplicate} title="Duplicate this warehouse" label="Duplicate" icon={Copy} />
          {renaming ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelRename();
              }}
              className="h-6 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
          ) : (
            <ActionButton onClick={onStartRename} title="Rename this warehouse" label="Rename" icon={Pencil} />
          )}
          {onDelete && (
            <ActionButton onClick={onDelete} title="Delete this warehouse" label="Delete" icon={Trash2} danger />
          )}
          <ActionButton onClick={onCompare} title="Compare this warehouse with others" label="Compare" icon={GitCompareArrows} showLabel />
        </div>
      )}
    </div>
  );
}

export function MultiWarehouseScroll({
  warehouses,
  activeWarehouseId,
  onActiveChange,
  onWarehouseChange,
  onAddWarehouse,
  onDuplicateWarehouse,
  onRenameWarehouse,
  onDeleteWarehouse,
  onCompareWarehouse,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: MultiWarehouseScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  // Which warehouse is currently being renamed inline (local UI state).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Mirror of the active id so `determineActive` can be a stable callback that
  // does NOT re-run/re-attach its listeners on every active change (that
  // cascades into an infinite update loop: active change → effect re-run →
  // immediate re-detect → scroll fight → active change …).
  const activeWarehouseIdRef = useRef(activeWarehouseId);
  activeWarehouseIdRef.current = activeWarehouseId;
  // True while a programmatic auto-scroll (Add/Duplicate) is settling; during
  // that window we ignore scroll fires to avoid flip-flopping between pages.
  const settlingRef = useRef(false);

  // vartest5: which control-placement variant is active (1–5).
  const [placementVariant, setPlacementVariant] = useState<number>(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= PLACEMENT_VARIANTS.length) {
        setPlacementVariant(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const activePlacement = PLACEMENT_VARIANTS[placementVariant];

  // Container size — drives the fit-to-page scale (all pages share dimensions).
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Active-page detection: the page whose vertical centre is closest to the
   * scroll container's centre becomes active. Runs on scroll + resize.
   *
   * Reads the active id from a ref so this callback is referentially stable
   * (deps: warehouses, onActiveChange) — the listener effect never re-attaches
   * on active changes and never fires the immediate re-detect that would chain
   * into an infinite update loop.
   */
  const determineActive = useCallback(() => {
    if (settlingRef.current) return;
    const cont = scrollRef.current;
    if (!cont) return;
    const cRect = cont.getBoundingClientRect();
    const cCenter = cRect.top + cRect.height / 2;
    let bestId = activeWarehouseIdRef.current;
    let bestDist = Infinity;
    for (const w of warehouses) {
      const el = sectionRefs.current[w.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - cCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = w.id;
      }
    }
    if (bestId && bestId !== activeWarehouseIdRef.current) onActiveChange(bestId);
  }, [warehouses, onActiveChange]);

  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont) return;
    // Settle once on mount (no scroll fires yet).
    settlingRef.current = false;
    determineActive();
    cont.addEventListener('scroll', determineActive, { passive: true });
    window.addEventListener('resize', determineActive);
    return () => {
      cont.removeEventListener('scroll', determineActive);
      window.removeEventListener('resize', determineActive);
    };
  }, [determineActive]);

  // Auto-scroll to a newly-activated page ONLY when it's not already in view
  // (e.g. add / duplicate). While the smooth scroll settles, suppress scroll-
  // driven activation so it can't ping-pong between adjacent pages and throw
  // React's maximum-update-depth error.
  useEffect(() => {
    if (!activeWarehouseId) return;
    const el = sectionRefs.current[activeWarehouseId];
    const cont = scrollRef.current;
    if (!el || !cont) return;
    const cRect = cont.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const inside =
      eRect.top >= cRect.top + VISIBILITY_MARGIN &&
      eRect.bottom <= cRect.bottom - VISIBILITY_MARGIN;
    if (!inside) {
      settlingRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Release the guard once the smooth scroll should have settled.
      const t = window.setTimeout(() => {
        settlingRef.current = false;
      }, 600);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWarehouseId]);

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} className="h-full w-full overflow-y-auto bg-muted/20 relative">
      {warehouses.map((entry) => {
        const isActive = entry.id === activeWarehouseId;
        const warehouse = entry.warehouse;
        const logicalW = warehouse.width * CELL_SIZE;
        const logicalH = warehouse.height * CELL_SIZE;

        const availW = Math.max(size.w - FIT_PADDING * 2, 1);
        const availH = Math.max(size.h - HEADER_H - FIT_PADDING * 2, 1);
        const fitScale =
          size.w > 0 && size.h > 0
            ? Math.min(Math.min(availW / logicalW, availH / logicalH), MAX_UPSCALE)
            : 1;

        return (
          <section
            key={entry.id}
            ref={(el) => {
              sectionRefs.current[entry.id] = el;
            }}
            onClick={() => onActiveChange(entry.id)}
            className={cn(
              'h-full w-full flex flex-col overflow-hidden border-b border-border/50 cursor-pointer bg-background',
              !isActive && 'opacity-90 transition-opacity',
            )}
          >
            {/* vartest5: full-size controls are detached from the scaled card and
                positioned per variant; the card itself renders the warehouse only. */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              {/* Full-size controls — always at natural size (never scaled). */}
              {isActive && activePlacement.placement !== 'inside' && (
                <div
                  className={cn(
                    'absolute z-30 flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-md',
                    activePlacement.className,
                  )}
                >
                  <PageHeader
                    name={entry.name}
                    isActive={isActive}
                    renaming={renamingId === entry.id}
                    onStartRename={() => setRenamingId(entry.id)}
                    onCommitRename={(name) => {
                      onRenameWarehouse(entry.id, name);
                      setRenamingId(null);
                    }}
                    onCancelRename={() => setRenamingId(null)}
                    onAdd={onAddWarehouse}
                    onDuplicate={() => onDuplicateWarehouse(entry.id)}
                    onDelete={onDeleteWarehouse ? () => onDeleteWarehouse(entry.id) : undefined}
                    onCompare={() => onCompareWarehouse(entry.id)}
                    detached
                  />
                </div>
              )}

              {/* Fit-to-page body: scale the warehouse card to fit, centre it both ways. */}
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Card — header bar above the warehouse renderer, scaled as one unit. */}
                {/* shrink-0: the card is a flex item; without it flex shrinks the card
                    below its content width while the header keeps its full logicalW,
                    so the action buttons overflow the card's clip and get hidden. */}
                <div
                  className="flex flex-col shrink-0 border border-border rounded-md shadow-sm bg-background overflow-hidden"
                  style={{ transform: `scale(${fitScale})` }}
                >
                  {/* Name + actions bar — sits ABOVE the warehouse, never over shelves.
                      vartest5 v1: still inside the scaled card (baseline). */}
                  {activePlacement.placement === 'inside' && (
                    <div style={{ width: logicalW }}>
                      <PageHeader
                        name={entry.name}
                        isActive={isActive}
                        renaming={renamingId === entry.id}
                        onStartRename={() => setRenamingId(entry.id)}
                        onCommitRename={(name) => {
                          onRenameWarehouse(entry.id, name);
                          setRenamingId(null);
                        }}
                        onCancelRename={() => setRenamingId(null)}
                        onAdd={onAddWarehouse}
                        onDuplicate={() => onDuplicateWarehouse(entry.id)}
                        onDelete={onDeleteWarehouse ? () => onDeleteWarehouse(entry.id) : undefined}
                        onCompare={() => onCompareWarehouse(entry.id)}
                      />
                    </div>
                  )}
                  <div className="relative" style={{ width: logicalW, height: logicalH }}>
                    <WarehouseSvgRenderer
                      warehouseId={entry.id}
                      warehouse={warehouse}
                      onWarehouseChange={onWarehouseChange}
                      selectedTool={selectedTool}
                      activeRoute={isActive ? activeRoute : null}
                      animationProgressRef={animationProgressRef}
                      zVisualizationMode={zVisualizationMode}
                      animationReplayId={animationReplayId}
                      zoom={fitScale}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* vartest5: floating segmented control (bottom-right) + keyboard hint. */}
      {/* Sits OUTSIDE the scroller (in the relative wrapper) so it stays pinned. */}
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex items-center gap-2">
        <span className="hidden text-[10px] text-muted-foreground md:block">
          Keys 1–{PLACEMENT_VARIANTS.length}
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-md">
          {PLACEMENT_VARIANTS.map((v, i) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setPlacementVariant(i)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                i === placementVariant
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v.key} · {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}