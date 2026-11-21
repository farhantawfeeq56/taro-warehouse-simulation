# REHEARSAL — /stage-show/1–8

Five product shots built from the **original Taro UI**, not mockups. Every
version renders real components against real sessions from
`components/gallery/session` (`useDemoSession`: warehouse generator →
corrector → `runSimulation` → readiness, all in-browser). No fixtures.

| # | Shot | Real pieces |
|---|------|-------------|
| 1 | Bento | `WarehouseSvgRenderer` (winning route, replaying) + `SimulationPanel` + stat tiles from the run + `AiSuggestion` |
| 2 | Simulate click | Measured cursor presses the real `LoadingButton`; route draws on the real canvas; `SimulationPanel` mirrors progress |
| 3 | Compare | The original `CompareView`, auto-simulating all three warehouses on entry |
| 4 | Layouts | Row of three real warehouses, each with its winning route |
| 5 | AI suggestion | Real `AiSuggestion` card beside the warehouse it reasons about |
| 6 | Everything, one page | `ConfigTab` + hero canvas + `SimulationPanel` + readiness + live ranking + `AiSuggestion` with a working experiment output, stacked on one page |
| 7 | Flow film, 34s loop | Splash → real `LayoutConfigOverlay` (cursor clicks Placement, then Generate) → canvas → cursor clicks Simulate (live `runSimulation`) → route sweep → live-ranked strip → cursor drives the AI card (`Generate experiment` → `No constraints`) → experiment canvas lands |
| 8 | Ordered film, 28s loop | Config (`ConfigTab` + real Generate) → cut on press → four warehouse shells → Simulate beat → cut on press → winning route draws once and holds → ranked strip → AI card + Generate experiment → cut on press → Taro lockup. All scenes stay mounted and crossfade; cuts + button shrink are ref-driven on the press frame | |

Shared: `layout.tsx` (loads `shots.css`), `nav.tsx` (segmented 1–5 switcher,
keys 1–8 jump versions), `run.ts` (live pipeline), index page linking all eight.

## Not checked

- No `npm install` / build in this environment (`node_modules` absent), so
  no typecheck or Next build was run. Verify in the browser: each route at
  desktop width + 390px, reduced-motion (shots 1/4/5 show looping canvas;
  shot 2 parks on the payoff frame), and the 1–8 keys.
- Shot 2 cursor aim is measured at runtime (`getBoundingClientRect`), so it
  lands by construction — confirm visually once.
