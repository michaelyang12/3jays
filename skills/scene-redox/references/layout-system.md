# Layout system

`src/lib/layout.ts` moves items rigidly: each one is turned about its own center and then shifted. Nothing is scaled, so no layout can change a size. `scenes/bedroom-redox` is the worked example; copy its `params.ts` (`footprints`, `layouts`, `layoutSpec`) and `scene.ts`.

## The contract

```ts
interface Footprint {
  min: Point                  // plan corner (x, z) of the item at home, in meters; north is -z
  size: Point                 // plan width along x and depth along z at home
  y: [number, number]         // height range at home
  facing: 'N' | 'E' | 'S' | 'W'  // which way its front points at home
  mount: 'floor' | 'wall' | 'free'
  clearance?: number          // floor depth in front that must stay open (drawers, doors, seats)
  attachTo?: string           // built in this item's home frame and moves with it
  measure?: false | number    // drift tolerance in meters (default 0.01), or false to skip the check
}

interface Placement { min?: Point; center?: Point; facing: Heading; lift?: number; within?: string }
interface Layout<Id> { items: Partial<Record<Id, Placement | 'attached'>>; keepClear?: Area[] }
interface LayoutSpec<Id, L> { room: RoomSpec; footprints: Record<Id, Footprint>; layouts: Record<string, L>; initial: string }
interface RoomSpec {
  height: number
  walls: { a: Point; b: Point; thickness: number }[]   // thickness extends to the right of a -> b
  keepClear?: { name: string; min: Point; max: Point }[]
  metrics?: { bounds: [Point, Point]; region: [Point, Point]; seed: Point; cell?: number }
}
```

- **`Heading`** is `'N' | 'E' | 'S' | 'W'` or a compass bearing in degrees (north 0, east 90). Quarter turns use exact trigonometry, so sizes stay exact to the millimeter. Other angles use oriented rectangles in every check.
- **`min`** is the corner of the placed item's axis-aligned bounding box. For an angled item, `center` is easier to reason about. Give one or the other.
- **`within`** names an item this one sits inside (a litter box in an enclosure cabinet), so the pair isn't reported as overlapping. Keep the host's interior clear of geometry.
- **`lift`** raises or lowers the whole item (for example, a TV hung 22 cm lower).
- **Per-layout `keepClear`** adds walkways and door swings that only the new layouts must respect, for when the source scene breaks the rule (114's litter box stood in the closet door's swing). Room-wide rules go in `room.keepClear`.
- **Scene-specific layout settings** go on an interface that extends `Layout`, for example the bedroom's `bifold` door angles and `light` levels. Read them in `scene.ts`; don't import "the active layout" at module level, because the layout is picked at runtime from `?layout=`.
- **`metrics`:**
  - `bounds` is the area rasterized in `cell` steps (default 5 cm).
  - `seed` is a point inside the main room. The free floor is what's reachable from it without crossing a wall.
  - `region` limits both numbers to the room people live in. Leave out hallways and closets.

## Mounts

| Mount | Collides with | Also checked | Counts against free floor |
|---|---|---|---|
| `floor` | walls, other floor and wall items, `keepClear` areas, tagged door swings | `clearance` strip stays open | yes |
| `wall` | walls, floor and wall items | its back touches a wall | no |
| `free` | nothing | nothing | no |

Use `free` for rugs, runners, items on a sill, curtains, light glows and slippers: things that may overlap others.

## Converting a scene

1. **One builder per item.** Split builders that add several items to one group into a map of functions, each returning a group (the bedroom's `buildFurniture` became `furnitureBuilders`). Keep their geometry at home coordinates; don't rewrite them around a local origin. New decor is the exception, and is built at a local origin (`decor.md`).
2. **Declare footprints roughly, then let the drift check fill them in.** On load, `applyLayout` measures each item's built geometry and warns, with the built bounds, if the footprint is off by more than `measure`. Copy the printed bounds into the footprint.
3. **Tag what is meant to stick out** with `userData.outsideFootprint = true`, for example a TV's cable and outlet or a plug-in sconce's cord. A wall-mounted item's back side isn't compared, so hardware sunk into the wall or a mount that holds the item off it is fine.
4. **Use a tolerance only with a reason, and write the reason in the brief.** In the bedroom:
   - The bed is `measure: false`. Its blanket drapes 23 cm past the frame, out of sight behind the foot.
   - The cubes have `measure: 0.025`. The source scene's builder overlaps the pilaster and the dresser by 2 cm.
   - The bedside shelf has `measure: 0.025`. A book overhangs the bed edge.
5. **Build the room spec** from the scene's walls. Add `keepClear` areas for walkways. In the room builder, set `userData.keepClear = '<name>'` on each door leaf group; `applyLayout` measures each child as a keep-clear zone. Anything the room builder needs per layout, such as a door angle, should be a function argument.
6. **Wire `scene.ts`:**

   ```ts
   const createScene: SceneFactory = ({ renderer, scene, query }) => {
     const [, layout] = pickLayout(layoutSpec, query)
     scene.add(buildRoom(materials, layout.bifold))
     applyLayout(scene, layoutSpec, layout, builders)
     // lights after placement; read per-layout overrides from `layout`
   }
   ```

   Add the room before `applyLayout`, so tagged door leaves are found.
7. **Add `original`** with every item at its home: `{ min: footprint.min, facing: footprint.facing }`. Prove it reproduces the source (SKILL.md step 2).

## Changing a footprint later

Placements that come from the footprint (`home`) follow automatically. An explicit placement's `min` refers to the new box, so the item shifts by the change. To keep it still, compute the new `min` from the old transform: `transformFor(oldFootprint, placement)`, apply it to the new footprint's corners, and take the minimum. Then check with `--match` against a screenshot taken before the change.

## Checker messages

| Message | Meaning | Usual fix |
|---|---|---|
| `X overlaps Y` | Solid footprints intersect, with height ranges overlapping by more than 2 mm | Move one; for stacked wall items, check the heights |
| `X overlaps wall N` | Inside a wall's thickness | The item's back should sit on the wall face, not past it |
| `X overlaps hallway path` / `... bifold` | A floor item is in a keep-clear area or a door swing | Move it, or narrow the door angle and state the cost |
| `X is wall-mounted but its back is not against a wall` | A gap of more than 1 cm behind a wall item | Snap its back to the wall face |
| `X clearance (0.7 m) is blocked by Y` | Something stands where a person needs to stand to use X | Move Y, or turn X |
| `X footprint is off by N cm from what its builder makes` | The declared footprint doesn't match the geometry | Copy the built bounds, tag outliers, or set `measure` with a reason |
| `X is attached to Y, which is not in the layout` | Host removed | Remove X too, or give it its own placement |
