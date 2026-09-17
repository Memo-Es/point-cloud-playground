# point-cloud-playground

A photographic scene rendered as a point cloud, with crisp vector type
orbiting inside it. Scroll takes the picture apart and puts it back. One
shared fluid field, four GPU tiers that pick themselves.

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
| Repaint the **scene itself** | `src/js/scene-painter.js` | trees, sky, light, ground |
| Move the light | the glow position in `scene-painter.js` | everything warms toward it |
| Different word | `words.hero` | any short string |
| Move / add / delete floating words | `wordLayer.instances` | `angle` places them on the ring |
| How fast the words circle | `wordLayer.orbit.scrollSpeed` | radians per section |
| How close the words pass | `wordLayer.orbit.radius`, `.center` | front edge vs. the camera |
| How hard the edges dissolve | `IMAGE_PLANE.spray`, `.sprayStart` | in `image-cloud.js` |
| Denser / sparser cloud | `tiers[n].points` | 40k–220k |
| Bigger grains | `points.sizeBase` | 2 → 6 |
| Softer dots | `points.softness` | 0.3 → 0.8 |
| Brighter / darker | `points.exposure` | 0.85 – 1.3 |
| Wilder transitions | `morph.scatter` | 3.4 → 8 |
| Longer, lazier trails | `morph.stagger` | 0.55 → 0.85 |
| Points hold formed longer | `morph.holdStart` | 0.45 → 0.7 |
| Stronger cursor push | `fluid.pointerPush` | 0.55 → 1.5 |

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

### It starts as an image, because the reference does

The reference bakes its point clouds from captured imagery — every point
carries the colour of a real pixel, which is what its `.mdpc` format exists to
compress. That is the main reason it reads as a photograph rather than as a
particle system: **the cloud has a subject.**

The first version of this repo skipped that and generated points from maths.
It looked like weather. It was not close.

So `scene-painter.js` paints a source scene — a misty stand of trees under a
lit sky — into two 2D canvases from one seed:

- **colour**, what each point looks like
- **depth**, greyscale, which becomes each point's z

`image-cloud.js` then does something deliberately dumb: pick a pixel, take its
colour, take its depth, place a point. That *is* what a photogrammetric point
cloud from a single image is. Two departures from a straight projection:

- **Edge spray.** Points near the frame edge get pushed outward and scattered
  in z, so the picture dissolves into loose particles instead of stopping at a
  rectangle. This is the signature of the whole effect and it's worth more
  than any amount of extra density in the middle.
- **Ground tilt.** A flat projection makes the ground a vertical wall — every
  pixel keeps its row's y, and only z varies. Everything below the horizon is
  tilted down and forward to lay it back into a floor. It's the one place the
  projection has to lie.

It is 2.5D, not 3D. There is nothing behind the trees — exactly the limitation
a single-image capture has.

A heavily blurred copy of the same image sits on a plane behind everything.
That's what shows **through** the stipple. Without it the gaps go to flat clear
colour and the whole thing reads as confetti.

### Normal blending, not additive — and a real depth buffer

The second thing the first version got badly wrong.

Additive blending can only ever *add* light. It cannot paint a dark tree
against a pale sky, so everything glows and the result reads as particles.
The reference is plainly an image: dark points over a bright background. Only
alpha blending does that.

So the points are **opaque**, on a **light** background:

- The fragment shader draws a near-binary disc and **discards** rather than
  fading. Fading is stochastic — each point is culled against a per-point
  random threshold — because semi-transparent fragments that write depth punch
  holes in whatever is behind them.
- Every surviving fragment is opaque, so the points **write depth**. That buys
  correct occlusion for free: near trees hide far ones, and no sorting is
  needed at any point count.
- Which in turn means the type can simply be **depth-tested against the
  cloud**. Foliage in front of a letter erodes it. That half-eaten type is
  exactly what the reference shows, and it falls out of the depth buffer
  rather than being faked.

Points are also small and hard, not big and feathered. Photographic point
clouds get their softness from how densely dots are packed, not from each
dot's edges — feathered sprites are what make a cloud read as bokeh.

### The point atlas### The point atlas

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

### Density compensation, twice, in opposite directions

Both of these were found by *measuring* frames, not by looking at them — which
is the point. Neither is visible on the machine you tune on.

**While the points were additive**, brightness went as *opacity × count*, so
the 220k tier rendered 5.5× brighter than the 40k tier: a white rectangle.
And it went as *count ÷ area*, so compact scenes blew out where open ones
looked right — the sphere and panels were clipping 39% of pixels while the
landscape looked fine.

**Now that the points are opaque, the count relationship inverts.** More points
should mean a *finer* picture, not a dimmer one. So point size shrinks as
`1/sqrt(count)`, which holds total screen coverage roughly constant while the
grain gets smaller. Every tier shows the same image; the expensive ones just
resolve it better.

The spatial weighting survives, but it now controls *coverage* rather than
exposure: with opaque points a compact scene turns into a solid lump instead
of blowing out, so each scene is weighted by its RMS radius to keep roughly
the same amount of picture visible.

### Four GPU tiers### Four GPU tiers

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

- **The source image is painted, not captured.** The original bakes real
  imagery into a bespoke `.mdpc` format with quantised positions and chroma
  subsampling. Here a forest is drawn procedurally into a canvas at boot and
  sampled from that. Nothing to download, but no photographic truth either —
  the trees are stylised, and up close they are visibly made of discs.
- **2.5D, not 3D.** There is nothing behind the trees. Push the camera far
  enough through the scene and it falls apart.
- **No raymarched light volumes**, no KTX2 array textures, no transparent
  video layer. The glow is painted into the source image.
- **The position atlas is not memory-frugal.** RGBA32F × 7 scenes at tier 3 is
  roughly 22MB of VRAM. Half-float would halve it at no visible cost. (Colour
  is already 8-bit.)
- **Still fewer points than the reference**, which is why its stipple is finer
  than this one's at every tier.

## File map

```
index.html              7 sections, one per scene. Import map lives here.
src/css/main.css        The DOM layer. Legibility over a bright moving image.
src/js/
  config.js             ← every knob. Start here.
  scene-painter.js      ← paints the source image + its depth map
  image-cloud.js        ← samples that image into points
  main.js               boot + the render loop
  scenes.js             which shape belongs to which section
  shapes.js             the abstract target shapes
  point-cloud.js        the two atlases, the attributes, the material
  word-layer.js         vector type on a 3D orbit ring
  light-volume.js       additive gradient quads
  fluid-field.js        one shared disturbance source
  scroll.js             Lenis + scroll state as a plain object
  device-tier.js        tier detection + frame budget watchdog
  rng.js, world.js      seeded randomness, palette helpers
  shaders/              GLSL, as tagged template strings
```

---

## Licence

MIT. Inspired by, but unaffiliated with, Shopify.
