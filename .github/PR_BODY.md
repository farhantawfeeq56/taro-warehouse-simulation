## Motivation

Generated warehouses looked "absurd" and were not production-sane:

1. **Oversized, unnatural layouts** — default 30 racks × 30 height produced a 93×34 grid (~3× wider than tall) with thousands of empty bins.
2. **One-corner wedge** — inventory placement filled bins strictly in dispatch-proximity order, so when capacity exceeded SKU count, every item piled into a dense corner while ~70% of the floor stayed empty.
3. **Guaranteed overflow at defaults** — sliders allowed SKU counts (2,500+) that exceeded bin capacity, so a chunk of the catalogue could never be placed → unplaced SKUs → orders referencing missing SKUs → blocked simulations ("NO_VALID_ITEMS").
4. **Complexity mismatch** — this is a demo tool, not a production SaaS; creation should *just work* without the user having to balance layout size vs. SKU count by hand.

The fix keeps the entire 10-slider config panel and Generate button as-is, but makes generation **self-balancing**: it always fills the layout fully, spreads inventory across the whole floor, and never leaves SKUs unplaced — so simulations always run.

## Summary

- The **SKU Count slider is now an upper limit, not a hard count**: after the layout is built, the catalogue is auto-capped at ~90% of the layout's bin capacity (`balanceSkuCount`), so every generated SKU always fits.
- **Even, floor-spreading placement**: bins are grouped into 8 proximity bands and filled band-by-band, so inventory covers the whole warehouse instead of wedging into one corner. The nearest band still fills first, preserving the "high-demand near dispatch" signal at high slotting bias.
- **Saner defaults**: gridHeight 30→20, rackCount 30→12, skuCount 2500→2000 → a natural 39×24 grid (~912 bins, ~820 auto-balanced SKUs).
- **Server-side parity**: `generateAndSaveWarehouse` applies the identical balancing so persisted warehouses behave the same as session-only ones.
- **Preview transparency**: the layout-config preview shows a "Capped at N to fit the layout" hint when the SKU slider exceeds capacity.

## Files Changed

### `lib/taro/warehouse-generator.ts`
- Added `balanceSkuCount(requestedCount, binCount)` — caps the catalogue at 90% of bin capacity (min 1).
- Added `estimateBinCapacity(warehouse)` — cheap `shelves × 2` capacity estimate used before placement runs.
- `generateWarehouseSession` now builds inventory from the balanced SKU count instead of the raw slider value.

### `lib/taro/inventory-placement.ts`
- Added `PROXIMITY_BANDS = 8` and rewrote `enumerateBins` to bucket bins by Manhattan-distance band and emit bands in order — the fill walk now spreads across the floor instead of draining the nearest corner first.
- Noted the even-fill behavior in the preview comments.

### `lib/taro/warehouse-configuration.ts`
- Defaults: `gridHeight 30 → 20`, `rackCount 30 → 12`, `skuCount 2500 → 2000` (aisle width / cross aisles unchanged).

### `lib/db/actions.ts`
- `generateAndSaveWarehouse` now balances the item list (`slice` to the balanced count) before placement and persists the balanced catalogue — same output as the session-only path.

### `components/taro/layout-config-overlay.tsx`
- SKU Count slider description shows the effective cap ("Capped at N to fit the layout (bins). Increase rack count to raise it.") when the slider exceeds capacity.

### `lib/taro/__tests__/warehouse-generator.test.ts`
- Added `balanceSkuCount` unit tests (keeps when fits, caps at 90%, caps small layouts).
- Added full-session test: huge SKU request on a small layout → 0 unplaced SKUs, valid non-empty orders.
- Added default-session test: defaults produce a fully-placed warehouse.

## What to Expect After Merge

| Aspect | Before | After |
|--------|--------|-------|
| Default layout | 93×34 grid, ~70% empty | 39×24 grid, inventory spread across ~90% of width |
| SKU slider | Hard count → overflow/unplaced SKUs | Upper limit → always fully placed |
| Unplaced SKUs at defaults | Possible (e.g. 1,000+ at high footprint) | 0 |
| Simulation gate | Could block with "no valid items" | Always runnable |
| Config sliders | 10 sliders, unchanged | 10 sliders, unchanged (Generate just works) |
