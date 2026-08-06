# AGENTS.md - tiller

A browser dinghy-sailing tutorial game, live at <https://blode.co/tiller>. Next.js 16,
React 19, and a hand-rolled sailing engine rendered in 3D with Three.js. Type set in
Geist Pixel.

The root `package.json` is still named `sail`, and `apps/web/package.json` is named
`web`. Neither is published, so nothing installs by name.

## Commands

Run from the repo root; this is an npm-workspaces turborepo and the game lives in
`apps/web`.

```bash
npm install
npm run dev            # turbo dev, http://localhost:3000
npm run build          # production build
npm run check          # ultracite check (oxlint + oxfmt)
npm run fix            # ultracite fix
npm run check-types    # tsc --noEmit across workspaces
```

To try it on a phone, hit the dev server from your laptop's IP, or deploy it (this
repo ships to Vercel).

## Layout

```
apps/web/
  app/                Next.js App Router (mounts the game)
  components/game/    React shell, HUD, touch controls, wind rose, coach copy
  game/               Framework-agnostic sailing engine
    sailing.ts          pure sailing maths (wind angle, speed polar, trim, steering)
    constants.ts        tuned physics constants
    levels.ts           the 7-level campaign and its per-level training wheels
    three/              Three.js scene: world, boat, harbour, sim loop
    bridge.ts           React to engine pub/sub
docs/                 sailing-spec.md + sailing-params.json (the design source)
```

## Conventions

- **`docs/sailing-spec.md` is the source of truth.** The whole sailing model (no-go
  half-angle, speed polar, trim efficiency, the tack and gybe state machine, scoring,
  and coaching copy) is specified there and implemented faithfully in `game/`. Change
  the spec before changing the maths.
- Levels switch hazards on progressively, so a change to `constants.ts` can make an
  early level unwinnable. Play from level 1 after touching the physics.
