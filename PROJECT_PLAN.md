# SimDist Website Execution Plan

## Summary
- Build a single-page, static site in vanilla `HTML/CSS/JS` that tells the SimDist story with strong visual design, clear navigation, and required interactive elements.
- Rebuild from the current asset-only workspace and replace the previously deleted scaffold (`index.html`, `css/main.css`, `js/main.js`) with a new implementation.
- Include all required media and interactions from `AGENTS.md`, with special emphasis on `fig2`, interactive results (`fig4` data), value timeline (`fig5` data), and required videos (`ptfe_plan.mp4`, `foam_plan.mp4`, `foot_pred_slip.mp4`).

## Scope And Deliverables
1. Create/replace `index.html` with a fully structured one-page research website.
2. Create/replace `css/main.css` with a complete visual system and responsive layout.
3. Create/replace `js/main.js` with all interactivity logic.
4. Keep data sources as-is in `assets/data/results.json`, `assets/data/values_success.csv`, `assets/data/values_fail.csv`.
5. Use existing assets in `assets/figures/*` and `assets/video/*` with no destructive asset changes.
6. Include paper link to `assets/paper/simdist_paper.pdf` and code link to `https://github.com/CLeARoboticsLab/simdist`.
7. Ensure all embedded videos autoplay, are muted by default, and use `playsinline`.

## Information Architecture
1. Hero section with cinematic video background (`assets/video/hero-background-desktop.mp4`), title, concise value proposition, and quick links.
2. "Why SimDist" narrative section explaining failure modes of end-to-end policy finetuning and catastrophic forgetting.
3. Method section centered on `fig2` with interactive step breakdown (simulation pretraining, transfer, dynamics-only finetuning loop).
4. World-model decomposition section using `fig3` plus transferability callouts (encoder/reward/value transferable, dynamics needs adaptation).
5. "Planning In The Loop" showcase with prominent paired videos (`assets/video/ptfe_plan.mp4`, `assets/video/foam_plan.mp4`).
6. Interactive results dashboard from `assets/data/results.json` (six tasks) with linked task videos.
7. Interactive value prediction timeline from `assets/data/values_success.csv` and `assets/data/values_fail.csv`, synchronized with video scrubbing behavior.
8. Dynamics-consistency evidence section with `assets/figures/fig7a_consistency-loss-plot.png` and required `assets/video/foot_pred_slip.mp4`.
9. Failure context strip using `assets/video/failures_sequential.mp4` and concise limits statement.
10. Footer with paper/code links and citation block.

## Visual And UX Direction
- Use a high-contrast, publication-grade visual language with custom CSS variables for color, spacing, radii, motion, and typography.
- Use expressive but professional typography (non-default stack; no Inter/Roboto/Arial defaults).
- Use layered backgrounds (gradients/textures/shapes), not flat single-color sections.
- Use deliberate motion only where meaningful: section reveal, figure highlight transitions, chart state transitions.
- Keep sticky top navigation with anchor links and active-section highlighting for easy scanning.
- Ensure mobile layout remains readable and interaction-safe at small viewports.

## Figure And Video Interactivity
1. `fig2` interactive treatment:
- Render `assets/figures/fig2_simdist-overview.svg` in a responsive container.
- Add an overlay hotspot layer mapped to steps `1`, `2`, `3`, `4a`, `4b`.
- On hover/focus/click, highlight the selected region and update a side panel with step title, concise explanation, and "what transfers vs what adapts."
- Provide keyboard-accessible controls as a fallback list under the figure.

2. `fig4` interactive results dashboard:
- Parse `assets/data/results.json` client-side.
- Render six small-multiple charts keyed by task (`PEG_NARROW`, `PEG_WIDE`, `TABLE_NARROW`, `TABLE_WIDE`, `PTFE`, `FOAM`).
- Implement interactive legend behaviors: hover highlights one method; click toggles method visibility; reset control restores defaults.
- Draw baseline horizontal reference lines from each task's `lines` object.
- Hovering/focusing a chart updates a synchronized task media panel with mapped video:
  - `PEG_*` -> `assets/video/manip_peg_results.mp4`
  - `TABLE_*` -> `assets/video/manip_leg_results.mp4`
  - `PTFE` -> `assets/video/qped_ptfe_results.mp4`
  - `FOAM` -> `assets/video/qped_foam_results.mp4`

3. `fig5` value-over-time interaction:
- Load both CSV files and render aligned success/fail value series.
- Add scrub interaction on hover/move that maps x-index (`0..224`) to normalized video time.
- Sync two muted videos to hovered index and display frame/time context beside the plot.
- Add lock toggle so users can freeze frame while reading values.

## Public Interfaces / Data Contracts
- No external backend/API additions; site remains static.
- Internal JS interfaces:
  - `ResultsTask`: `{ title, x, data, lines, xlabel, ylabel }`
  - `ValuePoint`: `{ step: number, value: number }`
  - `TaskVideoMap`: mapping from task key to media path and caption
- Anchor interface: `#overview`, `#method`, `#planning`, `#results`, `#values`, `#slip`, `#paper`.
- Progressive enhancement: fallback visuals remain readable if data scripts fail.

## Validation
1. Navigation and layout:
- All top-nav anchors scroll correctly and active-state updates as user scrolls.
- Sections remain legible and non-overlapping on mobile widths.

2. Media behavior:
- Every embedded video autoplays muted with `playsinline`.

3. `fig2` interaction:
- Hover/click/focus on each step updates highlight and explanatory content.
- Keyboard-only user can access all steps.

4. `fig4` results interaction:
- All six tasks render with axis labels and method traces.
- Legend hover highlights corresponding lines.
- Legend click toggles visibility and reset restores defaults.
- Task hover swaps synchronized video source.

5. `fig5` timeline interaction:
- Both CSV series load and render with correct ranges.
- Hovering timeline updates scrub position and synchronized video time.
- Lock mode preserves selected frame/value state.

6. Accessibility:
- Interactive controls are reachable by keyboard and have visible focus.
- Reduced-motion users are respected via `prefers-reduced-motion`.

7. Links:
- Paper link opens `assets/paper/simdist_paper.pdf`.
- Code link opens `https://github.com/CLeARoboticsLab/simdist`.

## Assumptions
- Stack remains vanilla `HTML/CSS/JS` with no build tooling.
- Existing asset filenames remain authoritative and unchanged.
- Figure 5 exact source videos are not explicitly labeled in repository metadata; best available success/failure clips are mapped explicitly in code.
- Deployment remains static-hosting compatible.
