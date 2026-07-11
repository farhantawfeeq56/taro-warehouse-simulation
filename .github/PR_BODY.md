## Motivation

A SKU with `storageFootprint > 1` was receiving the full 50-unit quantity on EVERY bin, effectively multiplying inventory. For example, a footprint-4 SKU became 4 bins x 50 = 200 units. This is not the intended model — Storage Footprint should affect spatial allocation only, not total inventory.

## Summary

Introduced the invariant: each SKU owns one total quantity, and Storage Footprint controls only how many bins that quantity is split across. When a SKU occupies N bins, `totalQuantity` is divided evenly among them, with any remainder assigned to the primary (pick) bin. The sum across all bins now equals the SKU's total quantity.

## Files Changed

### `lib/taro/types.ts`
- Added `totalQuantity?: number` to the `Item` interface with JSDoc describing the invariant. Default 50 preserves backward compatibility for single-bin SKUs.

### `lib/taro/inventory-placement.ts`
- Added `defaultQuantity?: number` to `InventoryPlacementConfig` (falls back to 50).
- Rewrote the quantity assignment in `applyInventoryPlacementDetailed` to compute per-bin split: `baseQty = floor(totalQty / footprint)`, primary gets `baseQty + remainder`, secondaries get `baseQty`.

### `lib/taro/inventory.ts`
- Added `validateSkuQuantityInvariant()` function that compares expected vs actual total quantity for every SKU. Returns violations instead of throwing — the caller decides how to react.
- Added `QuantityInvariantViolation` interface for the return type.

### `components/taro/taro-app.tsx`
- Imported `validateSkuQuantityInvariant` and wired it into the Generate Warehouse handler. Violations are logged via `console.warn` for developer visibility.

## What to Expect

| Scenario | Before (bug) | After (fix) |
|----------|-------------|-------------|
| Single-bin SKU | 1 bin x 50 = 50 | 1 bin x 50 = 50 (unchanged) |
| Footprint-4 SKU, default qty | 4 bins x 50 = 200 | 14+12+12+12 = 50 |
| Footprint-3 SKU, totalQuantity=100 | (would be 3x50=150) | 34+33+33 = 100 |

The invariant `SUM(bin.quantity) == SKU.totalQuantity` is enforced at placement time. All existing tests pass (161/163; 2 pre-existing failures unrelated to this change).
