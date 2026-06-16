# Tiller — learn to sail a dinghy

A tiny, mobile-friendly pixel-art sailing game. You helm a little dinghy with a
**real (inverted) tiller** and a **mainsheet**, and the game teaches the things
that confuse beginners: wind direction, the no-go zone, points of sail, and the
difference between **tacking** (bow through the wind) and **gybing** (stern
through the wind). Built with Next.js + the Phaser 4 game engine.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000  (turbo → apps/web)
npm run build    # production build
npm run check    # lint + format (ultracite / oxlint + oxfmt)
```

This is an npm-workspaces turborepo; the app lives in `apps/web`.

## How it plays

- **Tiller** (wide bar, bottom): drag it. It's a *real* tiller — push it LEFT and
  the bow swings RIGHT. That inversion is the core lesson.
- **Mainsheet** (slider, bottom-right): keep the handle in the green groove to
  trim the sail right for your current angle to the wind.
- **Race** the windward/leeward course (tack up to the windward mark, gybe down
  to the leeward mark, finish) for a score, or **Free practice** with live
  coaching. Desktop: arrow keys / `A`–`D` steer, `W`–`S` trim, `Esc` pauses.

## Layout

```
apps/web/
  app/                 Next.js App Router (page mounts the game shell)
  components/game/     React shell, HUD, touch controls, wind rose, content
  game/                Framework-agnostic engine
    constants.ts         tuned physics constants (from the spec)
    sailing.ts           pure sailing maths (TWA, polar, trim, steering)
    sail-scene.ts        Phaser scene: world, boat, sail, course, scoring
    create-game.ts       Phaser game factory (client-only)
    bridge.ts            React ⇄ Phaser pub/sub
  public/sprites/      pixel-art assets (hull, buoy, water, title)
  scripts/             build-time art generator
docs/                  sailing-spec.md + sailing-params.json (design source)
```

The sailing model — no-go half-angle, speed polar, trim efficiency, the tack/gybe
state machine, scoring, and coaching copy — is specified in
[`docs/sailing-spec.md`](docs/sailing-spec.md) and implemented faithfully in
`game/`.

## Regenerating the pixel art

Sprites are generated with Google Gemini's image model and post-processed into
crisp, limited-palette sprites (chroma-key + downscale) with `sharp`. The API key
is read from the environment — **never commit it**.

```bash
cd apps/web
GEMINI_API_KEY=... node scripts/generate-art.mjs          # all sprites
GEMINI_API_KEY=... node scripts/generate-art.mjs hull     # just one
```
