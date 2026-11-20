# GFX Simulator

A satirical idle game for people who believe games are for looking at.

There is one goal: make the graphics as good as possible. You start with a 64 × 36,
1-bit, unlit, twelve-polygon scene and buy your way up to 16K, ray-traced,
per-follicle-simulated excess. Every upgrade really changes how the scene is
rendered, and really costs frame rate. Gameplay is not included.

## Play

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints. To produce a static build in `dist/` that can be
hosted anywhere (it uses relative paths, so GitHub Pages sub-paths work):

```bash
npm run build
```

## How it plays

- **Click the scene** to render pixels by hand. Drag to orbit, scroll to zoom.
- **Graphics tab** – 11 settings (resolution, colour depth, polygons, textures,
  lighting, shadows, anti-aliasing, draw distance, foliage, water, hair) plus 9
  post-processing effects: 60 upgrades in total. Each gives +12% pixels and
  costs 18% of your frame rate. Effects only count while switched on, so yes,
  you have to look at the motion blur.
- **GPU** – better hardware restores the frame rate. Low FPS cuts production by
  up to half, and (optionally) the scene really is rendered at that frame rate.
- **Studio tab** – hire staff who render pixels for you, including while the
  tab is closed (25% efficiency, up to 8 hours).
- **Next-Gen tab** – scrap everything to launch the next console generation and
  earn Teraflops (+10% pixels each, forever). Spend them on permanent perks.
  From generation 2, six **challenges** restart the run under a handicap for a
  permanent reward.
- **Trophies** – 56 achievements, some secret, each worth +2% pixels.
- **Photo mode** (`P`) – export a stamped screenshot. `M` mutes everything.
- Also: dead pixels to catch, a forum that reacts to what you buy, review
  scores that ignore everything except graphics, and a "request gameplay" button.

Progress saves to `localStorage` automatically; export/import is under Options.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/game/data.ts` | All content: settings, effects, staff, GPUs, perks, challenges |
| `src/game/logic.ts` | Pure game rules (no DOM): production, costs, prestige, challenges |
| `src/game/state.ts` | Save format, hydration of untrusted saves, export/import |
| `src/game/achievements.ts`, `feed.ts` | Trophies and the satirical text layer |
| `src/render/world.ts` | Builds the 3D diorama for a given set of quality tiers |
| `src/render/renderer.ts` | Three.js renderer, camera, post-processing chain |
| `src/render/textures.ts` | Procedural textures at whatever resolution was paid for |
| `src/ui/` | DOM interface, number formatting, photo mode |
| `src/audio.ts` | WebAudio sound effects, music and the GPU fan |
| `scripts/sim.ts` | Headless bot for checking the pacing (`npm run sim`) |
| `tests/` | Unit tests for the rules and save handling (`npm test`) |

There are no image or audio assets: geometry, textures, sound and music are all
generated at runtime.

## Balancing

`npm run sim` plays the game with a greedy bot and prints when it reaches each
milestone. With the current numbers an optimal player first launches a new
generation after roughly 50 minutes and maxes everything in about 4 hours over
8 generations; a human will be slower. Costs live in `src/game/data.ts`
(`steep()` stretches late-game prices) and the prestige formula is
`teraflopGain()` in `src/game/logic.ts`.
