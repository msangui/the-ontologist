# The Last Ontologist — Full Development Backlog

End-to-end backlog for the game, derived from the **Game Vision & Product Requirements v1.0** and the **Panel Iteration Log (v0.1 → v1.0)**. Every item is a GitHub issue in this repository; epics carry their children as native sub-issues.

**Locked tech stack:** Babylon.js + TypeScript (WebGL2 only) · Vite · React DOM overlay beside the canvas (never inside it) + Zustand bridge · standalone semantic-engine TS package (zero renderer deps, Vitest golden corpus in CI) · JSON scenarios + Zod schemas + Casewright lint in CI · IndexedDB via `idb` + JSON export/import · pnpm workspaces (`packages/semantic-engine`, `packages/scenario-schema`, `apps/game`; no Turborepo day one) · Playwright vs. Vercel preview URLs · static Vercel deploy with exactly two Vercel Functions (`/api/wishlist`, `/api/telemetry`).

**Milestones** (vision doc §20.2) are tracked as labels: `M0` (wks 1–6) → `M1` (wks 7–14) → `M2` (wks 15–24) → `G1` (wks 25–26 gate) → `M3` (MVP, ≈2 quarters post-G1) → `post-MVP`.

---

## M0 — Engine + paper playtest (weeks 1–6)

**Exit: engine passes golden corpus · slice case fun on paper · Scenario Schema v1 shipped.**

### [#1 Epic: Monorepo, CI & deployment infrastructure](../../issues/1)

| #                      | Issue                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| [#13](../../issues/13) | Scaffold pnpm workspaces monorepo                                                           |
| [#14](../../issues/14) | Shared TypeScript strict config, ESLint & Prettier (renderer-dep boundary enforced by lint) |
| [#15](../../issues/15) | CI pipeline: lint, typecheck, Vitest, build on every PR                                     |
| [#16](../../issues/16) | `apps/game` walking skeleton: Vite + Babylon WebGL2 canvas + React overlay + Zustand bridge |
| [#17](../../issues/17) | Vercel deployment: static Vite build + per-PR preview URLs                                  |
| [#18](../../issues/18) | Playwright smoke/E2E harness against preview URLs                                           |

### [#2 Epic: Semantic engine — the §18.5 contract](../../issues/2)

| #                      | Issue                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| [#19](../../issues/19) | Typed property graph store + event-sourced assertion log                           |
| [#20](../../issues/20) | Tri-state truth (true / false / unknown)                                           |
| [#21](../../issues/21) | Forward chaining: typing, subclass, domain/range                                   |
| [#22](../../issues/22) | Inverse & declared-transitive properties                                           |
| [#23](../../issues/23) | Cardinality & value constraints + contradiction detection                          |
| [#24](../../issues/24) | sameAs merge & split with provenance retention                                     |
| [#25](../../issues/25) | Temporal validity intervals                                                        |
| [#26](../../issues/26) | Truth maintenance: derivations, explanation, retraction, incremental recomputation |
| [#27](../../issues/27) | Internal query pattern matcher (query IR)                                          |
| [#28](../../issues/28) | Golden corpus + determinism CI (1,000-replay check)                                |
| [#29](../../issues/29) | Public API surface + documentation                                                 |

### [#3 Epic: Scenario schema & content pipeline](../../issues/3)

| #                      | Issue                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| [#30](../../issues/30) | Scenario Schema v1 (Zod + JSON) — first production deliverable       |
| [#31](../../issues/31) | Casewright lint CLI + CI enforcement                                 |
| [#32](../../issues/32) | Scenario hot-reload in dev builds                                    |
| [#33](../../issues/33) | Text-mode paper-prototype harness (engine + text UI, no 3D)          |
| [#34](../../issues/34) | Case archetype library (~10 patterns)                                |
| [#36](../../issues/36) | Mercury Market canon bible                                           |
| [#37](../../issues/37) | Author slice scenario: "The Recall at FreshMart" v1 (data)           |
| [#35](../../issues/35) | **M0 exit:** paper playtest of the slice case (find-the-fun gate #1) |

---

## M1 — Greybox slice, "find the fun" (weeks 7–14)

**Exit: full loop playable in greybox · internal testers reach the Field Verification "aha".**

### [#4 Epic: Game runtime core (Babylon.js)](../../issues/4)

| #                      | Issue                                                |
| ---------------------- | ---------------------------------------------------- |
| [#38](../../issues/38) | Isometric camera rig                                 |
| [#39](../../issues/39) | Player character controller + contextual interaction |
| [#40](../../issues/40) | Greybox FreshMart environment (store + backroom)     |
| [#41](../../issues/41) | Scannable evidence & NPC interaction system          |
| [#42](../../issues/42) | World↔engine binding layer (four-layer separation)   |
| [#43](../../issues/43) | In-world consequence system                          |
| [#44](../../issues/44) | Dialogue system (text-first, scenario-driven)        |
| [#45](../../issues/45) | Chapter loading architecture (Vite code splitting)   |

### [#5 Epic: UI overlay — Lens, Journal, Model View, HUD](../../issues/5)

| #                      | Issue                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| [#46](../../issues/46) | React overlay shell + Zustand state bridge                                               |
| [#47](../../issues/47) | Semantic Lens overlay v1 (7-line cap, dual encoding)                                     |
| [#48](../../issues/48) | Evidence Journal v1 (red threads, provenance)                                            |
| [#49](../../issues/49) | Model View v1 (corkboard-meets-constellation)                                            |
| [#50](../../issues/50) | Shared component library (Journal + Model View)                                          |
| [#51](../../issues/51) | Sentence-based query builder                                                             |
| [#52](../../issues/52) | HUD (no minimap — diegetic wayfinding)                                                   |
| [#53](../../issues/53) | Act verbs UI + Consequence Preview                                                       |
| [#54](../../issues/54) | Cross-surface deep links + provenance-at-two-clicks                                      |
| [#55](../../issues/55) | Refactor bulk tools (merge/split, bulk reclassify, constraint relaxation w/ impact diff) |

### [#6 Epic: Game-validation layer](../../issues/6)

| #                      | Issue                                                 |
| ---------------------- | ----------------------------------------------------- |
| [#56](../../issues/56) | Case Arc state machine (Brief → … → Debrief)          |
| [#57](../../issues/57) | Competency-question grading (structure-agnostic)      |
| [#58](../../issues/58) | Actionable failure — failed query → model-gap pointer |
| [#59](../../issues/59) | Hint ladder (T1/T2/T3, in-fiction delivery)           |
| [#60](../../issues/60) | Elegance score + Debrief report card                  |
| [#61](../../issues/61) | Checkpoints & unlimited undo over the assertion log   |

### [#7 Epic: Saves & persistence](../../issues/7)

| #                      | Issue                                                       |
| ---------------------- | ----------------------------------------------------------- |
| [#62](../../issues/62) | IndexedDB via `idb`: versioned schema, migrations, autosave |
| [#63](../../issues/63) | Save export/import (user-facing JSON file)                  |
| [#64](../../issues/64) | Persistence E2E (reload + round-trip, Playwright)           |

**M1 gate:** [#65 Internal greybox playtest — the Field Verification "aha" gate](../../issues/65)

---

## M2 — Slice art-complete (weeks 15–24)

**Exit: Style Bible approved via style-test gate · slice content-complete · budgets met.**

### [#8 Epic: Art & audio production](../../issues/8)

| #                      | Issue                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| [#66](../../issues/66) | Style Bible v1                                                                                |
| [#67](../../issues/67) | Style-test gate (protagonist + store corner + overlay, in engine) — blocks all production art |
| [#68](../../issues/68) | Retail Interior environment kit                                                               |
| [#69](../../issues/69) | Protagonist — model, hero rig, core animations                                                |
| [#70](../../issues/70) | NPC system — 3 shared rigs + slice cast                                                       |
| [#71](../../issues/71) | Fictional Brand Kit — 14 brands + trademark screening                                         |
| [#72](../../issues/72) | Semantic overlay — final visual language                                                      |
| [#73](../../issues/73) | Evidence document templates                                                                   |
| [#74](../../issues/74) | Semantic audio grammar (first-class teaching system)                                          |
| [#75](../../issues/75) | Music & ambience for the slice                                                                |
| [#76](../../issues/76) | FreshMart art pass — greybox → art-complete                                                   |

### [#9 Epic: Performance, accessibility & web platform](../../issues/9)

| #                      | Issue                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| [#77](../../issues/77) | Performance budget enforcement in CI (≤25 MB, TTI ≤10 s, ≤100k tris, ≤80 draw calls, 60/30 fps) |
| [#78](../../issues/78) | Accessibility pass (§18.9)                                                                      |
| [#79](../../issues/79) | Localization infrastructure (keys day one; English first)                                       |
| [#80](../../issues/80) | Offline asset caching — loaded chapters run without network                                     |
| [#81](../../issues/81) | Vercel Function: `/api/wishlist` + Debrief CTA                                                  |
| [#82](../../issues/82) | Vercel Function: `/api/telemetry` + consented funnel instrumentation                            |

### [#10 Epic: Vertical slice content & G1 gate](../../issues/10)

| #                      | Issue                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| [#83](../../issues/83) | Slice onboarding — Ch.1 verbs taught in play                               |
| [#84](../../issues/84) | Slice content-complete in engine (two waves + unknown-vs-false beat)       |
| [#85](../../issues/85) | **G1 gate:** external playtest round + gate table evaluation (weeks 25–26) |

---

## M3 — MVP campaign (≈2 quarters post-G1)

**Exit: 5 chapters, 3 kits, campaign complete.** Descope ladder if needed: exteriors→vignettes → NPC count → Ch.5 case size → elegance post-MVP → localization post-MVP.

### [#11 Epic: MVP campaign — 3 acts / 5 chapters](../../issues/11)

| #                      | Issue                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| [#86](../../issues/86) | Verb & concept unlock system (onboarding matrix)                    |
| [#87](../../issues/87) | Chapter 1 — Product Catalog (neighborhood store)                    |
| [#88](../../issues/88) | Chapter 2 — Promotion Failure (flagship store)                      |
| [#89](../../issues/89) | Chapter 3 — Identity & the Delisted Supplier (office + supplier)    |
| [#90](../../issues/90) | Chapter 4 — Ingredient Recall & Time (store + warehouse + supplier) |
| [#91](../../issues/91) | Chapter 5 — Semantic Integration (the Mercury Market network)       |
| [#92](../../issues/92) | Industrial/Logistics environment kit                                |
| [#93](../../issues/93) | Office/Lab environment kit + outdoor vignette connectors            |
| [#94](../../issues/94) | Advanced Mode — RDF triples, read-only SPARQL view, ontology export |
| [#95](../../issues/95) | Predecessor's fragments — collectible narrative system              |
| [#96](../../issues/96) | World healing — locations improve as the model heals                |
| [#97](../../issues/97) | Cross-case concept reuse & campaign-scale elegance                  |
| [#98](../../issues/98) | **M3 exit:** MVP campaign integration + full playthrough QA         |

---

## Post-MVP

[#12 Post-MVP parking lot](../../issues/12) — WebGPU, touch input, editable SPARQL, localization, Steam packaging, tablet pass, cloud saves, leaderboards/community features, full PWA, the 10-chapter full game, B2B licensing (explicitly forbidden from driving design).

---

## Dependency spine (read top-down)

1. **#13–#18** unblock everything (repo, CI, deploy, skeleton).
2. **#19 → #20/#21 → #22–#27 → #28/#29**: the engine builds inward-out; the golden corpus (#28) is M0's exit bar.
3. **#30 (schema) → #31 (Casewright) / #33 (paper harness) → #37 (slice scenario) → #35 (paper playtest)** — content proves the fun before 3D exists.
4. M1 runtime/UI/validation/saves all consume the engine's public API (#29) and the slice scenario (#37); **#65** gates art spend.
5. **#66 → #67** gate all M2 production art (#68–#76). Platform work (#77–#82) runs in parallel.
6. **#84 → #85 (G1)** gates all of M3.
7. In M3, kits **#92/#93** block chapters **#89/#90**; chapters land in order; **#98** closes the MVP.

## Standing rules (apply to every issue)

- **Pillars as tie-breaker:** understanding is the only power · the world is the interface · honest systems · warm, not corporate.
- **Primary-audience razor:** narrative-puzzle players win every conflict; technologist depth lives in optional layers.
- Correctness = competency questions only; no structural diffs. No LLMs in the correctness path. Deterministic, offline-capable core.
- Provenance-at-two-clicks, dual encoding (never color alone), no hacker UI, no fail states, terminology lock (Lens, Journal, Case, Thread, Field Verification, Debrief).
- Semantics contract (§18.5) changes require a panel decision — not a PR.
