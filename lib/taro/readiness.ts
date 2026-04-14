import { Warehouse, Order } from './types';
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
export function evaluateReadiness(warehouse: Warehouse, orders: Order[]): SimulationReadiness {
  const itemsExist = warehouse.items.length > 0;
  const validOrders = orders.length > 0 && orders.some(o => o.items.length > 0);
  const workerStartMet = warehouse.workerStart !== null;

  // Use existing validation logic to see if all items can be picked
  const validationResult = validateItems(orders, warehouse);
  const allItemsPickable = validationResult.context.totalItems > 0 && 
                           validationResult.context.missingItems === 0;

  const conditions: ReadinessCondition[] = [
    {
      id: 'items-exist',
      label: 'Inventory items defined',
      isMet: itemsExist,
    },
    {
      id: 'valid-orders',
      label: 'Active orders created',
      isMet: validOrders,
    },
    {
      id: 'pickable-items',
      label: 'All items placed on layout',
      isMet: allItemsPickable,
    },
    {
      id: 'worker-start',
      label: 'Worker start position set',
      isMet: workerStartMet,
    }
  ];

  // All conditions must be met for simulation to be "Ready"
  const isReady = itemsExist && validOrders && allItemsPickable && workerStartMet;
  const status: ReadinessStatus = isReady ? 'READY' : 'NOT_READY';

  return {
    isReady,
    status,
    conditions,
  };
}
