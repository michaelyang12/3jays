# AGENTS.md

3jays is a set of agent skills and helper scripts for turning reference images into three.js scenes. A user drops images into a scene folder, the agent analyzes them, writes the scene, and serves it from a local Vite dev server for viewing. Stack: Bun, Vite, TypeScript, three.js.

Status: the viewer, commands, scoring, and the `scene-from-images` and `scene-redox` skills work. If a listed path doesn't exist yet, create it to match rather than inventing a different structure, and update this file when it lands.

To build or continue a scene, follow `skills/scene-from-images/SKILL.md`. To rearrange or redecorate an existing scene, follow `skills/scene-redox/SKILL.md`. The first covers the order of work, technique choices, and how to brief reviewers and builders; this file is the reference for commands, layout, and the scene contract.

## Commands

```sh
bun install
bun run dev          # Vite dev server, http://localhost:5173/?scene=<name> (strictPort: fails if 5173 is taken)
bun run build        # production build of the viewer and all scenes
bun run typecheck    # tsc --noEmit
bun run shot <name> [--view <id,id> | --all | --section <s>] [--layout <id>] [--out <path>]   # headless screenshots; exits 1 on load errors or console warnings
bun run shot <name> --match <other>   # also shoot the same views of <other> and pixel-diff them (shots/match/); exits 1 above 1% changed
bun run shot <name> --review [--section <s>]   # screenshots for reviewers, with the scene's files frozen beside them in rounds/pending/
bun run score <name> --change "<what this round changed>"   # score the frozen review from review-<n>.json files (docs/scoring.md)
bun run restore <name> <round> [--force]   # copy a scored round's files back over the scene
bun run fork <source> <name>   # copy a scene without refs, shots, rounds, scores or reviews, for a variant
bun run layout <name> [--layout <id,id>] [--svg]   # headless layout checks and floor metrics from params.ts `layoutSpec`; --svg writes shots/plan-<id>.png
```

Before finishing any change, run: `bun run typecheck && bun run build`

Use `bun`/`bunx`, never `npm`/`npx`/`yarn`. The lockfile is `bun.lock`.

## Layout

| Path | What |
|---|---|
| `skills/<skill-name>/SKILL.md` | Agent skills. Plain folders; users copy or symlink them into `~/.claude/skills/` |
| `.claude/skills` | Symlink to `skills/` so the skills load when an agent runs inside this repo |
| `scripts/` | Helper tools the skills call. `score.ts` owns the scoring weights and completion threshold; `shot.ts` captures screenshots and console output |
| `docs/scoring.md` | Scoring criteria, anchors, reviewer protocol |
| `src/main.ts` | The shared viewer: owns the renderer, canvas, camera, OrbitControls, render loop, and scene loading. Drag looks around from the camera's position; WASD fly, Shift/Control up/down, wheel forward/back, R resets to the scene's view |
| `src/types.ts` | The scene module contract |
| `src/framing.ts` | How the viewer positions the camera on load and on `R` |
| `src/lib/` | Reusable scene helpers (lighting rigs, materials, procedural geometry). `layout.ts` is the rigid layout system for movable items; `bake.ts` caches slow procedural builders across reloads in dev |
| `scenes/<name>/` | One generated scene: `refs/`, `brief.md`, `params.ts`, `scene.ts` (plus helper modules), `assets/`, `review-<n>.json` (pending reviews), `scores.json`, plus gitignored `shots/` (screenshots) and `rounds/r<N>/` (files saved by each scoring round; `rounds/pending/` is a review not yet scored) |
| `scenes/<name>/<section>/` | Optional section of a large scene (a closet, a bed): its own modules and params, built and reviewed on its own through views named `<section>-<id>` |

## Scene workflow

1. Reference images go in `scenes/<name>/refs/`. Use a kebab-case `<name>`.
2. Study every image, then write `scenes/<name>/brief.md` before writing code. YAML front matter: `title`, `refs` (list), `aspect` (e.g. `3:2`), `type` (scoring profile inferred from the references, see `docs/scoring.md`), `status: in-progress`, `score: null`; `score.ts` owns the last two after that. Body: subjects, composition, camera, lighting, observed palette, a short "Must match" checklist, and decisions you made on ambiguity. Describe, don't restate tunable numbers; those live in `params.ts` and the brief would go stale. Model on `scenes/incense-temple/brief.md` if present.
3. Put every value you expect to tune (camera view, light colors and intensities, fog, post settings, palette, layout) in one exported `params` object in `scenes/<name>/params.ts`, and implement `scene.ts` (plus helper modules if it grows) reading from it.
4. If a dev server is not already running on port 5173, start `bun run dev` in the background. Do not start a second one.
5. Run `bun run shot <name>`. It sizes the viewport to the brief's `aspect`, waits for `<html data-scene="ready">`, saves `scenes/<name>/shots/latest.png`, and prints the error overlay and any console warnings. Compare the screenshot against `refs/`. For interactive checks, open `http://localhost:5173/?scene=<name>` in a browser tool; in dev, `window.__3jays` exposes the scene context and `THREE`, so you can project points to measure where objects land in the frame. Iterate on the largest mismatch first (composition and camera, then lighting, then materials, then detail). Saving a file triggers a full page reload, which can land mid-check; if a wait is interrupted by navigation, wait for `ready` again before screenshotting.
6. Score it per `docs/scoring.md`. Run `bun run shot <name> --review`: it saves the screenshot and a copy of the scene's files to `rounds/pending/` and runs the gates, so you can keep editing while reviewers work. Two fresh reviewers, run in parallel, each see only the rubric, the refs, and the screenshot, and write `review-1.json` and `review-2.json`. Then run `bun run score <name> --change "..."`, which takes per-criterion medians (asking for a third reviewer on a split of more than 2 points) and saves the round to `rounds/r<N>/`. Make one change per round so each score tells you what that change did. On `REGRESSED`, run `bun run restore <name> <best round>` before the next change. Fix the lowest criterion and rescore. The scene is complete only when the script reports `status: complete` (8.0+, no criterion under 7, all gates passing). On `PLATEAU`, stop and report the blockers to the user instead of continuing.
7. Report the URL, the final score, and its weakest criteria to the user. Rescore whenever you modify a scored scene.

### Views and sections

- A scene with several reference photos returns `views` from its factory: named cameras, each matching one photo, with an optional `aspect`. `bun run shot <name> --view <id>` or `--all` saves them to `shots/<id>.png`, and `?scene=<name>&view=<id>` opens one in the browser. Don't write a per-scene capture script.
- When one area needs detail the whole-scene loop can't reach, make it a section: move its code to `scenes/<name>/<section>/`, name its views `<section>-<id>`, and give each builder agent its own files there. Fix shared dimensions in the section's params first so parallel builders don't collide.
- Review a section with `bun run shot <name> --review --section <section>`. Reviewers score criteria you choose for that section (snake_case, fixed after its first round) and `bun run score` records the round under the section, with its own best round and plateau. Section rounds don't change the brief's `score`; rescore the whole scene after merging.

## Scene module contract

Each `scene.ts` default-exports a `SceneFactory` (`src/types.ts`): it receives `{ renderer, scene, camera, controls, query }` (`query` holds the page's URL parameters, for scene options such as `?layout=<id>`), populates `scene`, and returns (or resolves to, for async asset loading) a handle with optional `view` (camera position, target, fov, and near/far clip planes for scenes larger than the default 0.1 to 1000 m), `views` (extra named cameras of the same shape, selected with `?view=<id>`), `update(dt, elapsed)`, and `render()` (replaces the default render call, for postprocessing). The viewer discovers scenes with `import.meta.glob('/scenes/*/scene.ts')`, so no registration step exists. Model new scenes on `scenes/example/scene.ts`.

## Conventions

- The viewer owns the `WebGLRenderer`, canvas, camera, and controls. Scenes add to the provided `THREE.Scene` and declare framing through `view`; they never create a renderer, touch `document.body`, or move the camera at load time.
- Editing a scene triggers a full page reload and scenes are switched by URL, so scenes need no teardown code.
- The renderer uses ACES Filmic tone mapping and `PCFShadowMap` (`PCFSoftShadowMap` was removed in r187). Opt meshes in with `castShadow`/`receiveShadow`.
- Check the browser console after loading a scene; three.js reports deprecated and removed APIs there as warnings, not errors.
- Import addons from `three/addons/...`, not `three/examples/jsm/...`.
- World units are meters. Set `colorSpace = THREE.SRGBColorSpace` on color textures; leave data textures (normal, roughness) linear.
- Prefer procedural geometry and materials. Pull in external models or textures when the reference demands detail that procedural work can't reach (figurative carving, recognizable props), store them in `scenes/<name>/assets/`, and record source URL and license in `brief.md`. Never hotlink remote assets. Prefer CC0 sources (Poly Haven, ambientCG). Pack glTF into a single `.glb` (`bunx @gltf-transform/cli copy in.gltf out.glb`) and reference assets with `new URL('./assets/<file>', import.meta.url)` so the build bundles them.
- Wrap a slow, deterministic builder (pixel-loop canvas textures, cloth or physics settling) with `baked(import.meta.url, '<name>', fn)` from `src/lib/bake.ts`. Its arguments must be plain data, and it may return plain data, typed arrays, or canvas textures. In dev the result is cached in IndexedDB and reused until the calling module or one of its local imports changes.
- Scene-specific code stays in the scene folder. Promote something to `src/lib/` only once a second scene needs it.
- Avoid code comments unless the flow is complex or you are leaving a TODO.
- No emojis in code, docs, or commit messages.

## Adding a skill

1. Create `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter. The description decides when the skill triggers, so name the user phrasings it should catch.
2. Put scripts the skill runs in `scripts/` (shared) or `skills/<skill-name>/` (skill-only), and reference them by repo-relative path.
3. Update the skills table in `README.md`.

## Don'ts

- Don't change the viewer to make one scene work. Fix it in the scene, or extend the contract deliberately and update every scene.
- Don't edit files in `refs/`; they are the user's inputs.
- Don't add runtime dependencies for something three.js or its addons already cover.

## Git

- Commit subject format: `[<type>] <summary of change> | <why it was made>`, e.g. `[feature] Add bounding-box camera framing | scenes without a view rendered off-center`.
- Types: `feature` (new capability), `bugfix`, `skill` (add or change a skill), `scene` (sample scenes), `refactor` (no behavior change), `perf`, `docs`, `test`, `chore` (deps, config, tooling).
- Don't commit or push unless the user asks.
- `scenes/` is gitignored; generated scenes stay local. `scenes/` may itself be a separate git repo for the user's own scenes (it has its own `.git`); git commands run inside it act on that repo, not 3jays. Sample scenes are the exception: each is whitelisted in `.gitignore` with a `!scenes/<name>/` line. Keep one or two; add a sample only when it demonstrates something the existing ones don't.
