# point-cloud-playground

A WebGL point cloud that gathers into shapes you pick. Sphere, torus, cube,
helix, wave, galaxy, ring, cloud — or your own text, sampled from the rendered
font. Drag to orbit; the cursor pushes the points around.

Controls follow the same language as
[pixelated-text](https://github.com/Memo-Es/pixelated-text): near-black stage
on the left, `#111` panel on the right, Inter, chips for choices, mono tabular
readouts.

**Live:** https://memo-es.github.io/point-cloud-playground/

## Two pages in here

| | |
|---|---|
| `/` | **The playground.** Everything below describes this. |
| `/editions/` | **A second playground.** An abstract cloud that transforms into a shape or your own text on one trigger, inside a rotating 3D band of type you can size and tilt. Same control language as this one. Self-contained: its own copy of every module, importing nothing from the playground, so work in there cannot break this. |


## Run it

No build step, no install. It does need to be served over HTTP — ES modules
don't load from `file://`.

```bash
npx serve .
```

## The panel

| Section | What it does |
|---|---|
| **Shape** | Which shape the points gather into. Text uses the box below it. |
| **Form** | Point count, point size, overall scale, and how far points sit off the shape's surface. |
| **Motion** | Spin, ambient drift, how long a change takes, how far points fly out mid-change, and how much they trail. |
| **Interaction** | Cursor push strength and radius. |
| **Colour** | Six palettes or three custom stops, what the gradient is keyed to, and glow. |

`Re-form` replays the current shape. `Randomise` picks a new shape, palette and
gradient. `Export` writes a PNG or JPG of the stage, or copies the settings.

Console handle: `PCH.state.scatter = 9; PCH.apply()`.

## How it works

**Two positions per point.** `position` is where a point is, `aPosB` is where
it's going, and a morph is one uniform going 0 → 1. When it lands, B is copied
into A and the uniform resets — one buffer upload per shape change, which is a
deliberate click rather than something happening sixty times a second.

**The burst is `sin(pi * x)`.** Zero at both ends, one in the middle. Points
can fly arbitrarily far out and are still guaranteed to land exactly on target,
so there's no cleanup pass and no snap.

**Per-point stagger.** Each point starts its journey at a slightly different
moment. Without it the cloud moves like a single slab and you can see at once
that it's one buffer.

**Colour is computed in the shader**, never baked into a buffer — derived from
each point's final position and a three-stop gradient. So changing the palette
or the gradient source is a uniform write that lands on the next frame. In a
playground that matters more than almost anything: a control that needs a
rebuild feels broken.

**Size compensation.** Brightness under additive blending goes as
`opacity x count`, so raising the point count would otherwise just make
everything brighter. Each point shrinks as `1/sqrt(count)` instead, which holds
exposure steady and spends the extra points on finer grain. It's the bug you
don't catch on your own machine.

**The cursor field is gated.** The pointer's resting value is dead centre, so
applying full force before anyone has moved would punch a hole through the
middle of the shape — and on a touch device, forever.

Point count starts from a four-tier guess at your hardware, then it's yours.
Nothing overrides the slider later; a control that fights back is worse than a
slow one.

## File map

```
index.html              stage + panel markup
src/css/playground.css  the control language
src/js/
  config.js             ← defaults, shape list, palettes. Start here.
  shapes.js             the generators
  controls.js           panel wiring
  point-cloud.js        buffers + material
  main.js               boot + render loop
  fluid-field.js        smoothed cursor
  device-tier.js        starting point count
  rng.js                seeded randomness
  shaders/              GLSL as tagged template strings
```

## Licence

MIT.
