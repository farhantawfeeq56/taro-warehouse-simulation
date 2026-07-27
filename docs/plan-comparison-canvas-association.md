# Plan: Visual Warehouse ↔ Comparison Association on the Canvas

Branch: `feat/floating-toolbar-warehouse-controls` (continue on this branch, or cut `feat/comparison-canvas-association` — recommend keeping on current branch since it builds directly on the comparison-node work just merged).

## 1. Goal & constraints

**Goal:** Let users associate warehouses with comparison nodes directly on the React Flow canvas, plus a "Compare Selected" shortcut and per-comparison staleness indicator. Edges stay derived — `Comparison.warehouseIds` remains the single source of truth.

**Hard constraints (from the brief):**
- `Comparison.warehouseIds` stays the owner of membership. Edges are **derived**, never a separate source of truth. No `edges` table, no persisted edge records.
- Don't make Taro feel like a generic node editor (no visible "connection ports" by default, no React Flow connection-line dragging as the primary interaction, no edge labels/handles cluttering the canvas).

**Design principle:** The canvas is a *warehouse workspace*, not a graph editor. Association should be a quick, discoverable gesture — not a permanent UI affordance.

---

## 2. Recommended UX (and why)

I evaluated three options:

| Option | Pros | Cons |
|---|---|---|
| **A. React Flow `onConnect` drag** (source/target handles) | Native, acquainted | Makes it feel like a node editor; persistent visible handles clutter calm canvas; needs `nodesConnectable` flip which conflicts with drawing tools |
| **B. Drag a warehouse node *onto* a comparison node** | Very intuitive, no extra UI | Ambiguous with existing drag-to-move; collision detection fiddly; conflicts with auto-layout |
| **C. Comparison-context "link mode"** ✅ | Feels native to Taro; zero persistent clutter; maps cleanly to derived edges | Slight discoverability cost (need a button entry point) |

**Recommended: Option C — "Link mode" triggered from the comparison node.**

### Interaction flow
1. **Select a comparison** (click its node). The comparison becomes active (emerald ring, right panel switches to `ComparisonPanel`).
2. The comparison node's title bar reveals a **"+ Link warehouses"** button (only while active — no permanent clutter for inactive comparisons).
3. Click it → **Link mode** for that comparison:
   - Cursor changes (subtle dashed ring pulse on the comparison node).
   - Every **warehouse node** on the canvas gets a faint **clickable outline + "＋" badge** in its title bar.
   - Clicking a warehouse **toggles** its membership in `comparison.warehouseIds` (add if absent, remove if present). Member warehouses show a filled check badge.
   - Derived edges update live (add/remove) via the existing `edges` useMemo.
   - **Esc** or clicking the "Done" pill exits link mode.
4. Persist via existing `updateComparisonAction(comparisonId, { warehouseIds })` (debounced, same path the `ComparisonPanel` dropdown already uses).

### Why this is the cleanest fit
- **Edges stay derived** — the toggle just edits `warehouseIds`; the `edges` useMemo in `warehouse-flow.tsx` already rebuilds from `comparisons`. Zero new persistence.
- **No persistent connection ports** — the "+ Link warehouses" button only appears on the *active* comparison, and the per-warehouse targeting badges only appear *during link mode*. At rest, the canvas looks exactly like today.
- **No conflict with drawing tools** — link mode is a modal canvas state; while it's on, we disable the drawing tool interaction (warehouse canvas becomes click-only) so a stray shelf-draw doesn't fire. The bottom `Toolbar` can dim/disable while in link mode, with the "Done" pill as the exit.
- **Discoverable without docs** — the button lives on the thing you're operating on (the selected comparison), right next to Run.

### "Compare Selected" (secondary shortcut)
- When **`selectedWarehouseIds.size >= 2`** (existing multi-select via shift-click), surface a floating **"Compare Selected"** button near the bottom toolbar (left of, or above, the tool switcher).
- Click → create a new comparison, pre-populated `warehouseIds = [...selectedWarehouseIds]`, auto-select it, clear the multi-select. One gesture, no link mode needed.

---

## 3. Staleness indicator

**Definition:** A comparison is *stale* when a participating warehouse (or the shared order set used by the run) has changed since the comparison was last run.

**Approach: content signatures, not DB counters** (keeps staleness client-side and accurate; no schema migration).

### Signature scheme
- Introduce a small helper `warehouseSignature(w: Warehouse): string` → cheap structural hash (dimensions + shelf positions + worker start + per-cell bin SKU counts summary). Pure function in `lib/taro/`.
- Introduce `ordersSignature(orders: Order[]): string` → hash of order count + line count + SKU multiset.
- At run time, `handleRunComparison` captures, per comparison:
  ```ts
  interface ComparisonRunRecord {
    results: ComparisonRunResult[];
    ranAt: number;
    warehouseSignatures: Record<string, string>; // member warehouseId → signature at run
    ordersSignature: string;                       // orders signature at run
  }
  ```
  Store in `comparisonResultsById` (change its value type from `ComparisonRunResult[]` → `ComparisonRunRecord`).

### Staleness derivation (in `taro-app.tsx`, alongside `comparisonScores`)
```ts
const comparisonStaleness = useMemo(() => {
  const stale: Record<string, boolean> = {};
  const currentOrdersSig = ordersSignature(orders);
  for (const [compId, record] of Object.entries(comparisonResultsById)) {
    const comp = comparisons.find(c => c.id === compId);
    if (!comp) continue;
    const memberChanged =
      comp.warehouseIds.some(id => warehouseSignature(wwById[id]) !== record.warehouseSignatures[id])
      || comp.warehouseIds.length !== Object.keys(record.warehouseSignatures).length; // membership changed
    const ordersChanged = currentOrdersSig !== record.ordersSig;
    stale[compId] = memberChanged || ordersChanged;
  }
  return stale;
}, [comparisonResultsById, comparisons, workspaceWarehouses, orders]);
```

### UI surfacing
- `ComparisonFlowNode`: when `data.stale` is true and a score exists, show an **amber "Re-run" dot** beside the Trophy (title: "Results are stale — a warehouse or orders changed since the last run").
- `ComparisonPanel` header: replace the plain Run button with **"Re-run"** styling (amber-tinted) when stale; keep a subtle "Stale" text chip next to the comparison name.
- Auto-clear staleness on next run (new record overwrites old).

---

## 4. Implementation breakdown (files + changes)

### 4a. Types — `lib/taro/types.ts`
- Add `ComparisonRunRecord`:
  ```ts
  export interface ComparisonRunRecord {
    results: ComparisonRunResult[];
    ranAt: number;
    warehouseSignatures: Record<string, string>;
    ordersSignature: string;
  }
  ```
- (No change to `Comparison` itself — membership stays put.)

### 4b. Signature helpers — new `lib/taro/signatures.ts`
- `export function warehouseSignature(w: Warehouse): string`
- `export function ordersSignature(orders: Order[]): string`
- Both deterministic, order-independent, cheap (join + simple hash, or `JSON.stringify` of a canonicalized subset). Unit-testable via `vitest`.

### 4c. `components/taro/taro-app.tsx` (orchestration)
- **State:**
  - Change `comparisonResultsById` value type to `Record<string, ComparisonRunRecord>`.
  - Add `linkModeComparisonId: string | null` (drives canvas link mode).
- **Derive:**
  - `comparisonStaleness` (above).
  - `wwById = useMemo(() => Object.fromEntries(workspaceWarehouses.map(w => [w.id, w.warehouse])), [workspaceWarehouses])` (used by staleness).
- **New handlers:**
  - `handleStartLink(comparisonId)` → `setLinkModeComparisonId(comparisonId)`.
  - `handleExitLink()` → `setLinkModeComparisonId(null)`.
  - `handleToggleMember(comparisonId, warehouseId)` → update `comparisons` (immutably toggle in `warehouseIds`), call `updateComparisonAction(...)` debounced/streamed. (Reuse the existing add/remove handlers' bodies — refactor `handleAddComparisonWarehouse`/`handleRemoveComparisonWarehouse` to a single `handleToggleComparisonMembership`.)
  - `handleCompareSelected()` → guards `selectedWarehouseIds.size >= 2`; calls `createComparisonAction`, then `updateComparisonAction(id, { warehouseIds: [...selectedWarehouseIds] })` (or extend `createComparisonAction` with an optional `warehouseIds` param to avoid a second round-trip); `setActiveComparisonId(id)`, `setSelectedWarehouseIds(new Set())`.
- **Run handler:** update `handleRunComparison` to capture `warehouseSignatures` + `ordersSignature` into the record.
- **Pass-through to `WarehouseFlow`:**
  - `linkModeComparisonId`
  - `onStartLink`, `onExitLink`, `onToggleMember`
  - `comparisonStaleness`
  - `selectedWarehouseIds` (currently *not* passed to `WarehouseFlow` — only to `WorkspacePanel`).
  - `onCompareSelected` (or surface the button in `TaroApp` itself over the canvas).
- **Pass-through to `ComparisonPanel`:**
  - `isStale={comparisonStaleness[activeComparisonId] ?? false}`.

### 4d. `components/taro/warehouse-flow.tsx` (canvas)
- **Props:** add `linkModeComparisonId`, `selectedWarehouseIds`, `onToggleMember`, `comparisonStaleness`, `onExitLink`.
- **Derived state in `WarehouseFlowInner`:**
  - `isLinkMode = linkModeComparisonId != null`.
  - Pass `isLinkMode`, `isMember` (per warehouse: `comparison?.warehouseIds.includes(ww.id)`), `stale` (per comparison), `onToggleMember`, `onExitLink` into node `data`.
- **Behavior in link mode:**
  - React Flow `panOnDrag`/`nodesDraggable` should be toggled off (or at least warehouse node drag suspended) so clicks are unambiguous — recommended: set `nodesDraggable={!isLinkMode}` to prevent move-on-click surprises.
  - `onNodeClick` in link mode: if target is a warehouse → call `onToggleMember(linkModeComparisonId, node.id)` instead of select; if target is the active comparison → no-op; clicking empty canvas → `onExitLink()`.
  - Bottom toolbar: emit a "Done" pill (or the `TaroApp`-level floating pill) when in link mode as the explicit exit.
- **Edges:** already derived from `comparisons` in a `useMemo` — no change needed beyond making sure toggle updates `comparisons` synchronously (it does, via `setComparisons` in the handler before the debounced persist).
- **`WarehouseFlow` re-sync effect:** the second `useEffect` that maps `data` must carry the new fields (`isLinkMode`, `isMember`, `stale`, `onToggleMember`, ...).

### 4e. `components/taro/comparison-flow-node.tsx` (active comparison node)
- In the title-bar action cluster (next to the delete `Trash2`), add a **"Link warehouses" button** (`Link`/`GitCompareArrows` icon) shown **only when `data.isActive`** (and not in link mode). onClick → `data.onStartLink?.(data.comparisonId)`.
- Add `stale` to `ComparisonNodeData`; render an amber dot/`RefreshCw` icon by the Trophy when `data.stale && data.score`.
- When this comparison is the link-mode target, render the dashed pulse ring + a small "Done" hint (the global exit also covers this).

### 4f. `components/taro/warehouse-flow-node.tsx` (warehouse node during link mode)
- Add to `WarehouseNodeData`: `isLinkMode?: boolean`, `isMember?: boolean`, `onToggleMember?: (comparisonId, warehouseId) => void`, `linkModeComparisonId?: string | null`.
- When `data.isLinkMode`:
  - Title bar shows a **toggle badge** (filled check `Check` in emerald if `isMember`, else `Plus` outline). Clicking it calls `onToggleMember(linkModeComparisonId, warehouseId)`.
  - The warehouse canvas itself stays visible but is non-interactive for drawing (the badge is the active target) — easi实现的办法: the badge is a button with `stopPropagation`; we don't need to globally disable drawing, but we *do* set `nodesDraggable={false}` in `WarehouseFlow` and ignore normal `onNodeClick` select (handled in 4d).
  - Apply a subtle ring/badge tint to member nodes so the user sees current membership at a glance.
- At rest (`!isLinkMode`) → badge hidden, node behaves exactly as today.

### 4g. `components/taro/comparison-panel.tsx` (right panel)
- Accept `isStale: boolean` prop.
- When `isStale`: header Run button becomes **"Re-run"** with amber tint + `RefreshCw` icon; show a small "Results may be outdated" note above the cards.
- The "Add warehouse" dropdown already exists — keep it as the secondary (non-canvas) path. No new logic.

### 4h. "Compare Selected" floating button (canvas overlay)
- In `taro-app.tsx`, render (only when `!linkModeComparisonId && selectedWarehouseIds.size >= 2`) a floating button near the bottom toolbar:
  ```
  [ ⚖ Compare N selected ]
  ```
  onClick → `handleCompareSelected()`.
- Position: above the existing bottom-center `Toolbar` so it doesn't collide. One element; nothing else on the canvas changes.

### 4i. `lib/db/actions.ts` (minor)
- Extend `createComparisonAction(projectId, name?, warehouseIds?: string[])` so "Compare Selected" can create + populate in a single server call (write `warehouseIds` on insert, or immediately call `updateComparison` server-side in the same action). Keeps the optimistic client path simple and avoids a flicker of empty-then-full.

### 4j. Tests — `vitest`
- `lib/taro/signatures.test.ts`: determinism, order-independence, sensitivity to layout / orders changes.
- (Optional) small render test for `ComparisonFlowNode` rendering the Link button only when active.

---

## 5. Edge cases & safety

- **Link mode + active comparison deselected** → auto-exit link mode (effect on `activeComparisonId`).
- **Link mode + active comparison deleted** → auto-exit.
- **Member warehouse deleted** → already handled today (`handleDeleteWarehouse` strips from comparisons); staleness derives membership-length change too, but a deleted member means re-run anyway.
- **`selectedWarehouseIds` includes warehouses that get deleted** → `handleDeleteWarehouse` should also strip from `selectedWarehouseIds` (currently it doesn't — add this).
- **Persist race** → toggle uses the same optimistic-then-`updateComparisonAction` pattern as existing add/remove; debounced consecutively is fine because each toggle reads latest `comparisons` via `setComparisons(prev => ...)`.
- **`nodesConnectable` stays `false`** → we are *not* using React Flow's connection system; no `onConnect`. Edges remain the derived `useMemo`. This is the cleanest way to honor "edges never become a separate source of truth."
- **Stale vs no-run** → a comparison with no results is not "stale" (it's just un-run); only comparisons with a record can be stale.
- **Orders are currently shared across the comparison** → orders signature drives staleness for *all* run comparisons when orders change (correct, since all members reuse the active warehouse's orders today).

---

## 6. Deliverable ordering (build sequence)

1. **Signatures** (`lib/taro/signatures.ts` + tests) — pure, no UI risk.
2. **Types** (`ComparisonRunRecord`).
3. **`taro-app.tsx` staleness derivation + run-record capture** — wire `comparisonStaleness` and update `handleRunComparison`.
4. **Stale UI surfacing** in `ComparisonFlowNode` + `ComparisonPanel` (visual only; ship behind the new data).
5. **Link mode plumbing**: `WarehouseFlow` props + `WarehouseFlow`/`ComparisonFlowNode`/`WarehouseFlowNode` data and rendering; `taro-app.tsx` state/handlers.
6. **"Compare Selected" button** + `createComparisonAction` extension.
7. **`handleDeleteWarehouse` strips `selectedWarehouseIds`** (small correctness fix).
8. Manual QA pass: link-mode flows, stale after editing a member, compare-selected, auto-exit on select/delete.

Each step compiles independently; ship staleness (1–4) before link mode (5) so the feature lands in reviewable chunks if desired.

---

## 7. Out of scope (explicitly deferred)

- Per-warehouse orders in comparisons (today all members share the active warehouse's orders).
- Per-strategy selection inside a comparison (today `bestResult` per warehouse only).
- Persisted edge styling / annotations.
- AI-suggested comparison membership.