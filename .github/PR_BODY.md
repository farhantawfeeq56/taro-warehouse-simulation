## Motivation

Previously, generating random orders used a hardcoded formula (`Math.min(5, Math.max(3, floor(availableSkus / 3)))`) that always produced a small, unpredictable number of orders. There was no way for users to control how many orders to generate or how many SKUs each order should contain. This limited testing at scale and made it impossible to simulate realistic order volumes.

Additionally, the inner loop of `generateRandomOrders` cloned the full SKU array per order (`[...availableSkuIds]`) and used `splice(idx, 1)` to remove picked items — an O(n) shift per item. At 1,000 orders with 20 items each and 5,000+ SKUs, this caused quadratic work and significant UI freezes.

## Summary

Added a **Order Generation Settings** popover (triggered by a `SlidersHorizontal` icon button next to the Shuffle button) with two configurable sliders:

1. **Order Count** – controls how many orders are generated (range 100–10,000, step 100, default 1,000)
2. **Average Order Size** – controls the average number of SKUs per order (range 1–20, step 1, default 5)

The settings use an **Apply/Cancel** pattern: sliders modify draft values that only take effect on "Apply"; "Cancel" (or clicking outside) discards changes. The state is lifted to `TaroApp` so all three order generation paths respect the same settings: the Shuffle button, the Add Demo Orders button, and layout config regeneration.

Item count per order now varies naturally around the configured average using a ±40% uniform distribution (via `Math.max(1, Math.round(avgOrderSize * (0.6 + Math.random() * 0.8)))`), replacing the old hardcoded `Math.floor(Math.random() * 4) + 2`.

**Performance fix:** The inner SKU-picking loop was rewritten from an O(n) clone+splice approach to rejection sampling with a `Set`. This eliminates 1,000 array clones and 20,000 O(n) splice shifts, reducing generation time from seconds to milliseconds at max settings.

## Files Changed

### `components/taro/orders-panel.tsx`
- Added `SlidersHorizontal` icon button next to the Shuffle button that opens a `Popover` with Order Generation Settings
- Added draft state (`draftOrderCount`, `draftAvgOrderSize`) that Apply/Cancel manage
- Added new props: `orderCount`, `avgOrderSize`, `onOrderCountChange`, `onAvgOrderSizeChange`
- Updated `generateRandom()` call to pass through `orderCount` and `avgOrderSize` from props (instead of the old hardcoded formula)
- Removed unused imports (`X`, `Trash2`) and added `Popover`, `PopoverTrigger`, `PopoverContent`, `Slider` imports

### `components/taro/taro-app.tsx`
- Added `orderCount` (default `1000`) and `avgOrderSize` (default `5`) state with `useState`
- Pass them down to `OrdersPanel` via new props
- Updated `handleAddDemoOrders` callback to use `orderCount` and `avgOrderSize` instead of hardcoded `4`
- Updated layout config regeneration to use `orderCount` and `avgOrderSize` instead of hardcoded `4`

### `lib/taro/demo-generator.ts`
- Added optional `avgOrderSize` parameter (default `5`) to `generateRandomOrders`
- Replaced hardcoded `Math.floor(Math.random() * 4) + 2` with a natural variation formula that distributes items around the target average: `Math.max(1, Math.round(avgOrderSize * (0.6 + Math.random() * 0.8)))`
- **Optimization:** Replaced per-order `[...availableSkuIds]` clone + `splice(idx, 1)` with rejection sampling via a `Set<number>` of picked indices. Eliminates O(n) array-shift cost per item and O(n) clone per order. Capped `itemCount` at available SKU count.

## What to Expect

| Feature | UX |
|---------|----|
| Sliders icon | A new button next to Shuffle opens the settings popover |
| Order Count slider | Range 100–10,000, step 100, default 1,000 |
| Avg Order Size slider | Range 1–20, step 1, default 5 |
| Apply/Cancel | Changes only take effect when Apply is clicked; Cancel discards |
| All three generation paths | Shuffle, Add Demo Orders, and layout config regen all respect the settings |
| Performance | Generating 1,000 orders × 20 items is now ~milliseconds instead of seconds |
