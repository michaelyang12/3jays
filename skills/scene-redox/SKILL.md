---
name: scene-redox
description: Rearrange, reorganize, or redecorate an existing 3jays scene without changing the size of anything in it. Forks the scene, turns every item into a rigid movable piece, tries layouts as data with collision, clearance and floor-space checks, then adds decor. Use whenever the user asks to rearrange, reorganize, or re-lay-out a room or scene, try a new furniture layout, "redox" a scene, optimize the space, make a room cozier or more home-like, add decor, furniture or wall art to a scene that already exists, or make a room feel like theirs. Use it even if the user never says "skill" or "layout".
---

# Scene redox

Turn an existing scene into a layout sandbox: the same room and the same objects at the same sizes, moved, turned, removed or joined by new decor as the user allows. `AGENTS.md` holds the commands and the scene contract. Read it first. This file covers the order of work and what past redoxes taught.

The source scene's files are the reference. Don't open its `refs/` photos: the room is already measured in its `params.ts`, and the user stopped a past session for going back to the photos.

Tools:

| Command | What it does |
|---|---|
| `bun run fork <source> <name>` | Copies the scene without refs, shots, rounds, scores or reviews, and rewrites the brief's front matter |
| `bun run layout <name> [--layout <id,id>] [--svg]` | Headless, under a second: rule violations, free floor and largest clear rectangle for every layout. `--svg` writes labelled plan diagrams to `shots/plan-<id>.png` |
| `bun run shot <name> --layout <id> [--all]` | Screenshots one layout (`shots/<view>@<id>.png`). Fails on load-time problems: footprint drift, door swings |
| `bun run shot <name> --layout original --match <source>` | Pixel-compares against the source scene and writes diff images to `shots/match/` |
| `src/lib/layout.ts` | Footprints, placements, the checker, floor metrics, `applyLayout` |

## What past redoxes showed

- **Hand-typed footprints are wrong.** The first bedroom redox had the cube organizer 4 mm too long. Later, the drift check found twelve more mismatches in the same scene: a dresser top 2 cm deeper than its carcass, a cord running a metre down the wall, and a source scene whose cubes overlapped the pilaster by 2 cm (a typed footprint had hidden this). Let `applyLayout` measure every item and fix what it reports.
- **Place the largest piece first.** The bed had exactly one position that worked. Writing out why each alternative failed (headboard over the window, foot in the hallway mouth, drawers 20 cm from the bed) settled the rest of the plan.
- **Metrics need a region.** The largest clear rectangle first landed in the hallway. Limit metrics to the room people live in.
- **A first decor pass reads as a dorm room.** The user's word for a tidy, generic pass was "empty and plain". What fixed it was specific, lived-in objects, not more of the same kind.
- **Global edits leak into every layout.** Dimming the ceiling for the cozy layout also dimmed `original`. Put per-layout settings on the layout.
- **Cameras fixed to furniture break when it moves.** The bed close-up views had to be dropped.
- **Briefs drift from the renders.** Twice, the brief claimed something the screenshots didn't show (door-swing maths, how much the curtains covered). Re-read the brief against the renders before reporting.

## 1. Fork and record the rules

1. `bun run fork <source> <source>-redox`, or the name the user gives. Never edit the source scene.
2. Write the user's rules at the top of the brief, under "Constraints from the user", in their terms:
   - What must stay put.
   - What may move, and where.
   - What may be removed.
   - What may be added: furniture, decor, art.
   - Anything they said about style or about themselves.

   These are hard constraints, above anything a metric or reviewer says. If the user gave only a goal ("optimize space"), decide the rules and write them down as decisions.

## 2. Make every item movable

Follow `references/layout-system.md`. In short:
- Give each item its own builder returning a group, built where it stands in the source (its home).
- Declare its footprint.
- Export a `layoutSpec` from `params.ts` whose `original` layout puts everything at home.
- Load it through `pickLayout` and `applyLayout`.

Prove the refactor changed nothing before moving anything:

1. Run `bun run layout <name> --layout original`. It should report zero problems. If the source scene itself has an overlap, give that item a `measure` tolerance and note the overlap in the brief.
2. Run `bun run shot <name> --layout original --all` and get a clean console. A footprint-drift warning prints the built bounds; copy them in.
3. Run `bun run shot <name> --layout original --match <source>`. Expect 0.00%. Anything over 1% fails, and the diff image shows where.

## 3. Read the room before moving anything

Run `bun run layout <name> --layout original --svg` and look at `shots/plan-original.png` next to the scene's `plan` view.

- **Hard constraints:**
  - Windows: nothing tall in front of them.
  - Doors: tag door leaves with `userData.keepClear` so their swing is checked.
  - Walkways: `keepClear` areas in the room spec.
  - The mouths of hallways.
  - Outlets or radiators, if the scene models them.
- **The anchor piece.** For the largest item, list every position and every quarter-turn facing that fits, and say in one line why each fails or works. If it only fits where it is, say so and plan around it.
- **Dead space.** Alcoves and dead ends nobody walks through are where storage can go.
- **Clearances.** Give items people use from the front a `clearance`: drawers, wardrobe doors, seats, desks. `CLEARANCE` in `src/lib/layout.ts` has the defaults.

## 4. Propose layouts as data

- Each proposal is a named entry in `layouts`. Keep `original`, and set `initial` to the layout the user should see first. Leaving an item out of a layout removes it; do that only when the user allowed removal.
- Face items N, E, S or W. Use a bearing in degrees (north 0, clockwise) only when an angle earns its place, such as a reading chair turned into a corner. Quarter turns keep sizes exact and are easier to live with.
- Iterate with `bun run layout <name> --svg` until it reports zero problems. Render only after that.
- Put per-layout settings (light levels, door angles) on the layout object, so `original` stays a faithful copy.
- Give every move a reason a person would say out loud: "the mirror moves to the west wall, where you can step back 2.2 m instead of 1 m".
- Find each layout's cost and state it. The bedroom redox's best space layout cut the closet doors' swing to 39 degrees.
- The metrics are free floor and the largest clear rectangle. They don't capture daylight, sightlines (the TV from the pillows), reach (switches, outlets, drawers) or how the room feels. Argue those in words.

## 5. Decor

Follow `references/decor.md`. Decor pieces are ordinary layout items: each has its own builder, footprint and placement. Things that sit on furniture use `attachTo` and the layout value `'attached'`, so they move with their host.

## 6. Views

- Keep `plan`. Add a view for each wall that changed, plus one from the doorway.
- Views are fixed cameras. After a big move, check that each still frames something; re-aim or drop views that targeted a piece that moved.
- Check each layout with `bun run shot <name> --layout <id> --all`, and look at every image.

## 7. Verify and report

1. Run `bun run layout <name>` (exit 0), then `bun run shot <name> --layout <id> --all` for each layout (clean console), then `bun run typecheck && bun run build`.
2. Re-read the brief against the renders, and update the layout descriptions, metrics and tradeoffs.
3. After a decor pass, run a design review (`references/design-review.md`) before reporting. It catches "dorm room" before the user does.
4. Report:
   - A URL per layout: `http://localhost:5173/?scene=<name>&layout=<id>`.
   - Original against new: free floor and largest clear rectangle.
   - What moved, and why.
   - The tradeoffs.
   - Any `measure` tolerances, with their reasons.
   - How to switch layouts: the URL, or `initial` in `params.ts`.

## Working with the user

- Approved means locked. When the user accepts a layout, record it in the brief and stop moving those pieces. Do detail and decor work within it.
- Personal details are background, never a theme (see `references/decor.md`).
- `scenes/` may be its own git repo, and the user may commit partway through your session. If they do, tell them which of your edits landed in their commit.
