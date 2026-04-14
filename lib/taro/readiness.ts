import { Warehouse, Order, ZVisualizationMode } from './types';
import { validateItems } from './order-validation';

export type GuidedFixId = 
  | 'import-items' 
  | 'switch-z-level' 
  | 'add-orders' 
  | 'place-items' 
  | 'set-worker-start';

export interface GuidedFix {
  id: GuidedFixId;
  label: string;
  description: string;
  actionLabel: string;
}

export interface ReadinessCondition {
  id: string;
  label: string;
  isMet: boolean;
}

export type ReadinessStatus = 'READY' | 'NOT_READY';

export interface SimulationReadiness {
  isReady: boolean;
  status: ReadinessStatus;
  conditions: ReadinessCondition[];
  nextFix?: GuidedFix;
  completedSteps: number;
  totalSteps: number;
}

const FIX_TEMPLATES: Record<string, GuidedFix> = {
  'items-exist': {
    id: 'import-items',
    label: 'Add Inventory',
    description: 'The warehouse has no items. Click on a shelf to add items manually or import a CSV.',
    actionLabel: 'Import CSV',
  },
  'active-z-items': {
    id: 'switch-z-level',
    label: 'Switch View Level',
    description: 'The current floor level is empty. Switch to a level with items.',
    actionLabel: 'View All Levels',
  },
  'valid-orders': {
    id: 'add-orders',
    label: 'Add Simulation Orders',
    description: 'No orders exist to simulate. Add demo orders to get started.',
    actionLabel: 'Add Demo Orders',
  },
  'pickable-items': {
    id: 'place-items',
    label: 'Resolve Missing Items',
    description: 'Some items in your orders are not placed in the warehouse.',
    actionLabel: 'Check Placement',
  },
  'worker-start': {
    id: 'set-worker-start',
    label: 'Set Worker Start',
    description: 'Workers need a starting point to begin picking.',
    actionLabel: 'Set Start Position',
  },
};

/**
 * Evaluates whether the simulation is ready to run based on current warehouse state and orders.
 */
export function evaluateReadiness(
  warehouse: Warehouse, 
  orders: Order[], 
  activeZVisualizationMode: ZVisualizationMode = 'all'
): SimulationReadiness {
  const itemsExist = warehouse.items.length > 0;
  
  // Check if any items exist in the currently active Z-level
  let hasItemsInActiveZ = false;
  if (activeZVisualizationMode === 'all') {
    hasItemsInActiveZ = warehouse.grid.some(row => 
      row.some(cell => cell.locations.length > 0)
    );
  } else {
    const targetZ = parseInt(activeZVisualizationMode.replace('level', ''));
    hasItemsInActiveZ = warehouse.grid.some(row => 
      row.some(cell => cell.locations.some(loc => loc.z === targetZ))
    );
  }

  const validOrders = orders.length > 0 && orders.every(o => o.items.length > 0);
  const workerStartMet = warehouse.workerStart !== null;

  // Use existing validation logic to see if all items can be picked
  const validationResult = validateItems(orders, warehouse);
  const allItemsPickable = validationResult.context.totalItems > 0 && 
                           validationResult.context.missingItems === 0;

  const conditions: ReadinessCondition[] = [
    {
      id: 'items-exist',
      label: 'Inventory Imported',
      isMet: itemsExist,
    },
    {
      id: 'active-z-items',
      label: 'Items in Active Level',
      isMet: hasItemsInActiveZ,
    },
    {
      id: 'valid-orders',
      label: 'Orders Active',
      isMet: validOrders,
    },
    {
      id: 'pickable-items',
      label: 'Items Placed',
      isMet: allItemsPickable,
    },
    {
      id: 'worker-start',
      label: 'Worker Start Position',
      isMet: workerStartMet,
    }
  ];

  const isReady = conditions.every(c => c.isMet);
  const status: ReadinessStatus = isReady ? 'READY' : 'NOT_READY';
  
  // Find the first unmet condition for the guided fix
  const firstUnmet = conditions.find(c => !c.isMet);
  const nextFix = firstUnmet ? FIX_TEMPLATES[firstUnmet.id] : undefined;
  
  const completedSteps = conditions.filter(c => c.isMet).length;
  const totalSteps = conditions.length;

  return {
    isReady,
    status,
    conditions,
    nextFix,
    completedSteps,
    totalSteps
  };
}
