# point-cloud-playground

A scroll-driven WebGL point cloud: a coloured, misty landscape you fall
through, with crisp vector type suspended inside it. One shared fluid field,
volumetric light, and four GPU tiers that pick themselves.

Built as a **technique study** after the engineering behind
[Shopify Editions Spring '26](https://www.shopify.com/editions/spring2026).
None of Shopify's code, copy, fonts or assets are used here — this
reconstructs the *system*, from their published writeup, in about 1,200 lines
you can read in one sitting.

---

## Run it

It has no build step and no dependencies to install. It does need to be served
over HTTP, because ES modules don't load from `file://`.

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. Three.js, GSAP and Lenis load from jsDelivr at
runtime via the import map in `index.html`.

To put it online: push to GitHub, then **Settings → Pages → Deploy from
branch → `main` / root**. There's nothing to configure.

---

## Change how it looks

**`src/js/config.js` is the only file you need.** Every number that shapes the
piece lives there, grouped and commented, and none of it is logic. The ten
knobs worth reaching for first:

| Want | Change | Try |
|---|---|---|
| Different word | `words.hero` | any short string |
| Move / add / delete floating words | `wordLayer.instances` | `angle` places them on the ring |
| How fast the words circle | `wordLayer.orbit.scrollSpeed` | radians per section |
| How close the words pass | `wordLayer.orbit.radius`, `.center` | front edge vs. the camera |
| Re-colour the **world** | `PALETTE` in `src/js/world.js` | grass, haze, glow, speckle |
| Grade everything at once | `palette.tint`, `.tintAmount` | 0 = raw scene colour |
| Brighter / darker overall | `points.exposure` | 0.8 – 1.6 |
| Denser / sparser cloud | `tiers[n].points` | 40k–220k |
| Bigger grains | `points.sizeBase` | 1.5 → 5 |
| Hazier, less dotty | `points.softness` | 0.45 → 0.9 |
| Wilder transitions | `morph.scatter` | 3.4 → 8 |
| Longer, lazier trails | `morph.stagger` | 0.55 → 0.85 |
| Points hold formed longer | `morph.holdStart` | 0.45 → 0.7 |
| Stronger cursor push | `fluid.pointerPush` | 0.55 → 1.5 |
| Move the light source | `LIGHT` in `world.js` | everything warms toward it |
| More / less glow | `bloom.strength` | 0.3 → 1.2 |

Add `?tier=0` … `?tier=3` to the URL to force a GPU tier. It's the only sane
way to see what the low end actually looks like without owning a slow phone.

Faster than editing and reloading: open the console and poke the live handle.

```js
PCH.uniforms.uScatter.value = 9
PCH.uniforms.uColorA.value.set('#ff0066')
PCH.uniforms.uSize.value = 6
PCH.tier                       // which GPU tier you ended up on
```

To change the **order of scenes**, edit the array in `src/js/scenes.js` and the
`camera.keys` array in `config.js` — they're index-matched, one entry per
`<section data-scene>` in `index.html`. All three must stay the same length.

---

## How it works

```
 DOM  ──────────────  content, type, links, focus order.
                      Source of truth. Fully readable with WebGL off.
        ▲
        │  locked by scroll, never by events
        ▼
 WebGL ──────────────  atmosphere only. Carries no information
                       that isn't also in the DOM.
```

### The type orbits in 3D, and that's where the mirroring comes from

The words ride a ring around the viewer. Scrolling turns the ring; a slow idle
rotation keeps it alive before anyone touches it.

Each plane is rotated by its own orbit angle, which points it radially
outward. So a word at the front of the ring faces you and reads normally, and
a word at the back is seen **from behind** — mirrored, for free, by geometry.
Flipping type by hand would have been the wrong answer to the same picture,
and it wouldn't have survived the words moving.

Two consequences fall out of it:

- The material is `DoubleSide`. Culling backfaces would delete half the effect.
- Depth ordering is recomputed each frame from each word's actual distance, so
  the fog rolls in front of the far half of the ring. Depth *testing* wouldn't
  work here — the points never write to the depth buffer.

### The type is not made of points

The most tempting mistake, and the one this repo made first: building the
headline out of the point cloud.

The reference doesn't. Its type stays sharp vector lettering and is placed
*inside* the volume — repeated, mirrored, rotated, at several depths — so the
cloud reads as **weather the type is standing in**, not as a material the type
is made of. It also means the type never competes with the point budget for
legibility, which is why it can stay that large and that thin.

So `word-layer.js` renders the word as textured quads in the three.js scene,
at real z depths, drifting with the cursor by an amount scaled to their depth.
Every instance shares one canvas texture; mirroring is a negative X scale.

(`worldText()` in `shapes.js` will still spell a word out of points if you
want it — it's a good effect, just a different one.)

### Colour lives in a second atlas

The reference bakes its point clouds from captured imagery: every point
carries a colour, which is what its custom `.mdpc` format exists to compress.

There's no photograph here, so colour is reasoned about instead of sampled —
`world.js` holds a small palette, assigned by region and by distance to one
light source, with heavy per-point jitter and a ~1-in-9 bright speckle. That
speckle is what keeps the cloud reading as *captured* rather than *generated*;
without it you get a smooth gradient that looks like a screensaver.

Colours ride in a second atlas alongside the positions — but at **RGBA8, not
float**. Positions need float precision; colour never does, and 8-bit is a
quarter of the memory. (Same instinct as the reference's chroma subsampling,
taken to where it actually pays.)

Because every scene pulls colour from the same light and the same palette, the
abstract scenes read as the landscape *rearranging itself* rather than as a
slideshow of unrelated shapes.

### The point atlas

Seven target shapes — two words, a nebula, a sphere, depth-layered panels, a
wave field, a third word — are each just a `Float32Array` of xyz. All seven get
packed into **one float texture**, stacked as vertical slices. A point looks up
its own row and column from its vertex index.

The obvious alternative is swapping position attributes on each transition.
That means re-uploading several megabytes to the GPU at the exact instant the
user is scrolling — the one moment you cannot afford a stall. With an atlas, a
transition costs **two uniform writes**.

### Scatter and reform

```glsl
vec3 pos   = mix(sceneA, sceneB, staggered_t);
float burst = sin(uMorph * PI);          // 0 at both ends, 1 in the middle
pos += aScatterDir * burst * uScatter;
```

`sin(πx)` is the whole trick: points can fly arbitrarily far out and are still
guaranteed to land exactly on target, because the burst is mathematically zero
at both ends. No cleanup pass, no snapping.

Per-point **stagger** offsets when each point starts its journey. Without it
the cloud moves like a slab, and you can see instantly that it's one buffer.

### One fluid field

Cursor position, cursor speed and scroll velocity feed a single smoothed
object in `fluid-field.js`. The points read it, the light shafts read it, the
point sizes read it.

This is the difference between a material and a pile of gimmicks. Three
effects each smoothing their own copy of the mouse will always disagree with
each other by a frame or two, and the eye reads that disagreement as cheapness.

### Scroll is not an event stream

`scroll.js` writes numbers into one plain mutable object. The render loop reads
that object. Nothing re-renders, nothing re-lays-out.

Sixty scroll events a second updating component state would re-run layout sixty
times a second, and the canvas would visibly lag the copy sitting on top of it.
(In the original build this is described as keeping high-frequency updates out
of React renders by reading from refs inside the render loop — same principle,
no framework needed.)

The camera interpolates **continuously** while the cloud **holds** — formed and
legible — until you're most of the way through a section. That mismatch is
where the parallax comes from.

### Brightness is density-compensated

Under additive blending, total brightness is roughly *opacity × point count*.
So the ultra tier, with 5.5× the points of the low tier, renders 5.5× brighter
— a white rectangle — unless you correct for it.

`points.opacity` is therefore calibrated at a stated reference count
(`densityReference`) and scaled down automatically as the count goes up. More
points buys **finer grain, not more light**. Without this, every tier is a
different picture and only one of them is the one you designed.

This is the single easiest thing to get wrong in a tiered particle system, and
it doesn't show up until you test on hardware that isn't yours.

### Four GPU tiers

Picked at boot from core count, device memory, mobile UA and the unmasked
GPU string. Then a watchdog samples frame times and steps **down** if the
budget is missed — dpr first (cheap, invisible), then bloom, then point count.

It never steps back up. Oscillating between tiers looks far worse than sitting
one tier low. Phones cap at tier 1 regardless of what they benchmark at in the
first second, because thermal throttling makes anything higher unsustainable
past about a minute.

### Volumetric light

The original raymarches boxes against a KTX2 array texture baked from video.
That's a lot of machinery for what reads, on screen, as *soft shafts that bend
when you move the cursor* — so this is a stack of additive gradient quads at
staggered depths, sheared by the same fluid field. Real parallax between the
layers does most of the work; the shader only has to sell "soft".

---

## Accessibility

Not an afterthought here, because an effect this heavy is exactly where it
usually gets dropped.

- **`prefers-reduced-motion` is honoured automatically.** The canvas keeps
  rendering — it just stops moving (`uMotion` → 0). Removing it entirely would
  strip the page of its only visual identity; freezing it removes the
  vestibular risk, which is the actual requirement.
- **A visible toggle** in the header, `aria-pressed`, works in both directions
  regardless of the OS setting. Animated heroes need a visible stop control,
  not just a media query.
- **Every word the cloud draws also exists in the DOM** as a real heading. The
  canvas is `aria-hidden`. Screen readers, crawlers and no-WebGL browsers get
  the full page.
- **WebGL failure is not a blank page.** If the context won't start, the
  visually-hidden headings become visible and the page reads as an ordinary
  article.
- Skip link, visible focus rings, and smooth scrolling that turns itself off
  under reduced motion.

---

## Honest gaps

Things the original does that this doesn't:

- **No captured source data.** The original ships bespoke `.mdpc` point clouds
  with quantised positions and chroma subsampling, baked from real imagery.
  Everything here is generated procedurally at boot — nothing to download, but
  also no photographic truth behind the colour. It's a painted landscape, not
  a scanned one.
- **No true raymarched light volumes**, and no KTX2 array textures. The light
  here is a stack of additive gradient quads. See above.
- **No transparent video layer.** The original solves cross-browser
  transparent video; there's no video here at all.
- **The position atlas is not memory-frugal.** RGBA32F × 7 scenes at tier 3 is
  roughly 22MB of VRAM. Half-float would halve it at no visible cost; it's left
  as `Float32` because the encoding code obscures the idea. (Colour is already
  8-bit.)
- **The type doesn't react to the cloud.** In the reference, points and
  lettering feel mutually aware. Here the words drift with the same fluid
  field but nothing occludes anything — the word quads simply draw last.

## File map

```
index.html              7 sections, one per scene. Import map lives here.
src/css/main.css        The DOM layer. Legibility over a bright moving volume.
src/js/
  config.js             ← every knob. Start here.
  world.js              ← the colour language: palette, light, speckle.
  main.js               boot + the render loop
  scenes.js             which shape belongs to which section
  shapes.js             target generators (landscape, cloud, sphere, panels, wave)
  point-cloud.js        the two atlases, the attributes, the material
  word-layer.js         crisp vector type suspended in the volume
  light-volume.js       the additive quad stack
  fluid-field.js        one shared disturbance source
  scroll.js             Lenis + scroll state as a plain object
  device-tier.js        tier detection + frame budget watchdog
  shaders/              GLSL, as tagged template strings
```

---

## Licence

MIT. Inspired by, but unaffiliated with, Shopify.
