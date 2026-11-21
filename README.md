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
  post-processing effects: 60 upgrades in total. Each gives +15% pixels and
  costs 18% of your frame rate. Effects only count while switched on, so yes,
  you have to look at the motion blur. Every purchase plays a before/after
  comparison wipe.
- **Next-upgrade bar** – under the scene, always showing the cheapest
  outstanding upgrade, progress towards it and an ETA. Click it (or press `B`)
  to buy.
- **GPU** – better hardware restores the frame rate. Low FPS cuts production by
  up to half, and (optionally) the scene really is rendered at that frame rate.
- **Studio tab** – hire 12 kinds of staff who render pixels for you, including
  while the tab is closed (25% efficiency, up to 8 hours).
- **Photo mode** (`P`) – export a stamped screenshot. A fresh screenshot "goes
  viral": 2× pixels for 60 seconds, once every 5 minutes.
- **Next-Gen tab** – scrap everything to launch the next console generation and
  earn Teraflops (+5% pixels each, forever). Spend them on permanent perks.
  From generation 2, six **challenges** restart the run under a handicap for a
  permanent reward.
- **Trophies** – 61 achievements, some secret, each worth +2% pixels.
- **An ending** – own all 60 upgrades at once and the credits roll. There is a
  reward. It is not worth it.
- Also: dead pixels to catch, a forum that reacts to what you buy, review
  scores that ignore everything except graphics, and a "request gameplay" button.

Shortcuts: `B` buy next upgrade · `P` photo · `M` mute · `1`–`5` switch tab.

Progress saves to `localStorage` automatically; export/import is under Options.

## Performance saver

The top tiers are deliberately wasteful (planar reflections, depth of field,
4096 px shadows, ~100k instanced blades and strands). To keep that a joke
rather than a crash, the renderer watches how long real frames take:

- It never spends more than about half of real time rendering, so the
  interface stays responsive however slow the device is.
- If most recent frames were slow it steps through three levels that cut real
  cost (pixel ratio, shadow resolution, instance counts, the extra reflection
  and depth passes, and finally internal resolution).

None of this changes what the player owns or their score. It can be switched
off under Options → Display ("Protect my real GPU").

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

`npm run sim` plays the game with a greedy bot and prints the pacing; add
`MODE=challenges` to time each challenge at three stages of progress, or
`MODE=summary` for one line. With the current numbers the bot launches its
first new generation after about 35 minutes, then one every 16–28 minutes,
and owns everything in generation 8 after about 3 hours. A human will be
slower. Challenges take roughly 10–40 minutes when first attempted; the timed
one cannot be done on the first try.

Costs live in `src/game/data.ts` (`steep()` stretches late-game prices) and
the prestige formula is `teraflopGain()` in `src/game/logic.ts`.
