import { Warehouse, Order } from './types';
import { validateItems } from './order-validation';

export interface ReadinessCondition {
  id: string;
  label: string;
  isMet: boolean;
}

export interface SimulationReadiness {
  isReady: boolean;
  conditions: ReadinessCondition[];
}

/**
 * Evaluates whether the simulation is ready to run based on current warehouse state and orders.
 */
export function evaluateReadiness(warehouse: Warehouse, orders: Order[]): SimulationReadiness {
  const itemsExist = warehouse.items.length > 0;
  const validOrders = orders.length > 0 && orders.some(o => o.items.length > 0);
  const workerStartMet = warehouse.workerStart !== null;

  // Use existing validation logic to see if any items can be picked
  const validationResult = validateItems(orders, warehouse);
  const atLeastOnePickable = validationResult.context.totalItems > validationResult.context.missingItems && 
                             validationResult.context.totalItems > 0;

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
      label: 'Items placed on layout',
      isMet: atLeastOnePickable,
    },
    {
      id: 'worker-start',
      label: 'Worker start position set',
      isMet: workerStartMet,
    }
  ];

  // All conditions must be met for simulation to be "Ready"
  const isReady = itemsExist && validOrders && atLeastOnePickable && workerStartMet;

  return {
    isReady,
    conditions,
  };
}
