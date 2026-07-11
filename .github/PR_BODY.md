## Motivation

The Order Count slider's maximum of 10,000 caused the app to become unresponsive when generating orders, because generating that many orders is computationally heavy. The upper limit was unnecessarily high for practical use — users rarely need more than 1,000 orders for meaningful simulation results.

## Summary

Reduced the Order Count slider **max from 10,000 to 1,000** and changed the **default from 1,000 to 500**. This prevents UI freezes while still providing a wide enough range for practical warehouse simulations.

## Files Changed

### `components/taro/orders-panel.tsx`
- Changed `draftOrderCount` default from `1000` to `500`
- Changed slider `max` from `10000` to `1000`
- Changed range label from `10,000` to `1,000`

### `components/taro/taro-app.tsx`
- Changed `orderCount` state default from `1000` to `500`

## What to Expect

| Before | After |
|--------|-------|
| Max: 10,000, Default: 1,000 | Max: **1,000**, Default: **500** |
| Generating 10,000 orders could freeze the UI | Max 1,000 keeps generation snappy |
