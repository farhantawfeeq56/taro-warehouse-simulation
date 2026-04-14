import { Warehouse, Order, ZVisualizationMode } from './types';
import { validateItems } from './order-validation';

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
}

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

  const validOrders = orders.length > 0 && orders.some(o => o.items.length > 0);
  const workerStartMet = warehouse.workerStart !== null;

  // Use existing validation logic to see if all items can be picked
  const validationResult = validateItems(orders, warehouse);
  const allItemsPickable = validationResult.context.totalItems > 0 && 
                           validationResult.context.missingItems === 0;

  const conditions: ReadinessCondition[] = [
    {
      id: 'items-exist',
      label: 'Items Exist',
      isMet: itemsExist,
    },
    {
      id: 'active-z-items',
      label: 'Items in Active Z-Level',
      isMet: hasItemsInActiveZ,
    },
    {
      id: 'pickable-items',
      label: 'Orders Valid',
      isMet: allItemsPickable,
    },
    {
      id: 'valid-orders',
      label: 'Active orders created',
      isMet: validOrders,
    },
    {
      id: 'worker-start',
      label: 'Worker start position set',
      isMet: workerStartMet,
    }
  ];

  // All conditions must be met for simulation to be "Ready"
  // Note: We include the new Z-level check in the readiness calculation
  const isReady = itemsExist && hasItemsInActiveZ && allItemsPickable && workerStartMet && validOrders;
  const status: ReadinessStatus = isReady ? 'READY' : 'NOT_READY';

  return {
    isReady,
    status,
    conditions,
  };
}
