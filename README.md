# The Last Ontologist

> **The data survived. Meaning did not.**

A warm isometric mystery about a world whose systems forgot what things mean — and the investigator who teaches reality to understand itself again. Browser-first, deterministic, no login: open a URL, start playing.

- **Backlog:** [`BACKLOG.md`](./BACKLOG.md) — the full plan as GitHub issues (M0 → M3).
- **Vision:** Game Vision & Product Requirements v1.0 (panel-signed; decision IDs `[I#-D#]`).

## Repository layout

```
packages/semantic-engine/   Pure-TS deterministic rule engine over a typed property
                            graph. Zero renderer dependencies (§18.5) — enforced by lint.
packages/scenario-schema/   JSON + Zod scenario contract. The human anchor rule (§1.6)
                            is a schema requirement, not a convention.
apps/game/                  Vite + Babylon.js (WebGL2 only) + React DOM overlay.
                            Babylon owns the canvas; React owns the DOM; Zustand is
                            the only bridge between them.
```

Architecture rule (§18.4): narrative → semantic → validation → presentation, and game logic never depends on rendering. The semantic packages must run headless in CI forever.

## Getting started

Requires Node ≥ 22 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # game client with HMR at http://localhost:5173
pnpm test         # Vitest across packages
pnpm typecheck    # strict TS across the workspace
pnpm lint         # ESLint (includes the renderer-dependency boundary check)
pnpm build        # typecheck packages + production build of apps/game
pnpm e2e          # Playwright smoke test (builds + serves a local preview)
```

## CI

Every PR runs lint → format check → typecheck → unit tests → build, plus the Playwright smoke test (`.github/workflows/ci.yml`). Named CI slots reserved by the backlog: `golden-corpus` (#28), `casewright-lint` (#31), `budgets` (#77).

## Deployment (Vercel)

The game ships as a **static Vite build** — no server for core play. The only future server pieces are two Vercel Functions: `/api/wishlist` (#81) and `/api/telemetry` (#82).

Configuration lives in the repo's root [`vercel.json`](./vercel.json) — install at the workspace root, build `@ontologist/game`, serve `apps/game/dist`. Deploying from the repo root also keeps the door open for the two `/api` functions later.

One-time setup (needs the Vercel account — backlog #17):

1. Import this repo in Vercel and **leave Root Directory at the repo root** (if it was previously set to `apps/game`, clear it — `vercel.json` is only read from the configured root).
2. No build/output overrides in the dashboard; `vercel.json` is the source of truth.
3. Preview deployments on every PR; production from `main`.
4. Set the `E2E_BASE_URL` env in CI to the preview URL to point the Playwright job at real deployments.
