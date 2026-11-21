# REHEARSAL — /stage-show/1–5

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

Shared: `layout.tsx` (loads `shots.css`), `nav.tsx` (segmented 1–5 switcher,
keys 1–5 jump versions), index page linking all five.

## Not checked

- No `npm install` / build in this environment (`node_modules` absent), so
  no typecheck or Next build was run. Verify in the browser: each route at
  desktop width + 390px, reduced-motion (shots 1/4/5 show looping canvas;
  shot 2 parks on the payoff frame), and the 1–5 keys.
- Shot 2 cursor aim is measured at runtime (`getBoundingClientRect`), so it
  lands by construction — confirm visually once.
