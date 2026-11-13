# Techniques

Recipes that changed results in past scenes. Put throwaway scripts in the scratchpad, not in the repo.

## Contents

- Palette sampling and colour diff
- Camera solve from landmarks
- Fitting object placement to frame positions
- CC0 assets from Poly Haven
- Cloth settled at load
- Post-processing
- Lighting notes

## Palette sampling and colour diff

Before coding, read the reference's colours at named regions with Python and PIL, using normalized coordinates so the same regions work on the render:

```python
from PIL import Image
REGIONS = {"sky_top": (0.5, 0.05), "wall": (0.2, 0.4), "floor": (0.5, 0.9)}
def sample(path):
    image = Image.open(path).convert("RGB")
    w, h = image.size
    out = {}
    for name, (x, y) in REGIONS.items():
        box = image.crop((int(x*w)-8, int(y*h)-8, int(x*w)+8, int(y*h)+8))
        r, g, b = [sum(c)/len(c) for c in zip(*box.getdata())]
        out[name] = "#%02x%02x%02x" % (int(r), int(g), int(b))
    return out
```

Run it on the reference and on `shots/latest.png` after every screenshot and print the two columns side by side. Fix the largest gap first. Remember that the renderer applies ACES tone mapping, so a param colour is not the pixel colour: tune against the measured output.

For dark regions, also save a brightened or autocontrasted crop of both images. Problems in shadow are invisible at normal exposure.

## Camera solve from landmarks

Composition is the highest-weighted criterion in most profiles, and a fitted camera gets it right once.

1. In the hero photo, pick about eight points whose world positions you know or have set in params: window corners, floor and wall junctions, door frame corners, furniture corners. Spread them across the frame and across depth.
2. Record each as normalized pixel coordinates (0 to 1 from the top left).
3. Search camera position (x, y, z), yaw, pitch and vertical field of view. For each candidate, project the world points and sum the squared distance to the photo's coordinates. A coarse grid followed by a finer grid around the best candidate is enough; this is a six-parameter problem with a smooth error.
4. Put the result in `params.ts` as the scene's `view` (position, target, fov).

Start the search from a sensible guess: phone photos are taken from 1.4 to 1.7 m high, and a phone's main lens has a vertical field of view of roughly 45 to 55 degrees in landscape and 65 to 70 in portrait; an ultrawide is far wider. An ultrawide photo also has barrel distortion the viewer's camera doesn't reproduce, so expect the frame edges to disagree and weight central landmarks more.

Verify in the browser: in dev, `window.__3jays` exposes `camera` and `THREE`.

```js
const { camera, THREE } = window.__3jays
const p = new THREE.Vector3(x, y, z).project(camera)
;[(p.x + 1) / 2, (1 - p.y) / 2]
```

That returns where a world point lands, in the same normalized coordinates as step 2.

## Fitting object placement to frame positions

Reviewers report positions as frame percentages ("the board's edge is at 70% of width; the reference has it at 62%"). Use the same projection to fit an object's rotation and position: grid-search the two or three params that place it and minimize the error against the stated positions. Refit after any camera change, since every placement fitted this way depends on the camera.

## CC0 assets from Poly Haven

Use an asset when the reference shows figurative detail or a recognizable object. Poly Haven is CC0 and has a public API.

1. List candidates: `https://api.polyhaven.com/assets?t=textures` or `?t=models` returns ids with names, categories and tags. Filter by tag.
2. Look before choosing. Download the thumbnails of the candidates, tile them into one contact sheet with PIL, and view it. Names mislead.
3. Get file URLs from `https://api.polyhaven.com/files/<id>`. Take 1k or 2k textures; larger ones only slow the load.
4. Save into `scenes/<name>/assets/`. Pack models into one `.glb` with `bunx @gltf-transform/cli copy in.gltf out.glb`.
5. Reference with `new URL('./assets/<file>', import.meta.url)`; set `colorSpace = THREE.SRGBColorSpace` on colour maps and leave normal and roughness maps linear.
6. Crop, tile, or tint the texture toward the sampled palette as needed. Record the asset's page URL and "CC0" in `brief.md`.

The library has gaps (it had no temple bell or drum, and its carving shows birds, not dragons). If nothing fits, say so in the report instead of substituting something a reviewer will call invented.

## Cloth settled at load

For bedding, pillows, throws and hanging garments, build a grid mesh and settle it with a small position-based simulation in the scene factory, before the first frame:

- Particles on a grid, distance constraints between neighbours (structural and diagonal), gravity, and collision against simple shapes (the mattress box, a pillow ellipsoid, a hanger bar).
- Pin what is held (the hanger line, a tucked edge), drop the rest from slightly above its resting place, and run a fixed number of iterations (a few hundred steps is typical for a blanket-sized grid).
- Recompute normals afterwards. The simulation runs once; nothing updates per frame.
- Seed any randomness so reloads give the same folds and screenshots are comparable between rounds.

The folds this produces are what reviewers accept as fabric. Noise-displaced planes were called "terrain", "foil" and "slab" no matter how they were tuned.

## Post-processing

Bloom, vignette and a colour grade go through the handle's `render()` hook with an `EffectComposer` from `three/addons/`. Keep bloom thresholds high enough that only real light sources glow; a low threshold washes the frame and lowers lighting, color and atmosphere together. Put every post value in `params.ts`.

## Lighting notes

- Intensities aren't comparable across light types: a hemisphere light at a given intensity reads far weaker than a point light at the same number. Judge by the screenshot and the sampled pixels.
- `PCFSoftShadowMap` no longer exists in r187; the viewer uses `PCFShadowMap`. three.js reports removed APIs as console warnings, and `bun run shot` fails on them, so read its output.
- Empty regions of the frame cost composition and subjects. If the reference has a lit wall, columns or furniture in a region where the render is black, filling it at the reference's positions was worth more than any material change.
