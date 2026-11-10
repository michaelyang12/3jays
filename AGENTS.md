# AGENTS.md

3jays is a set of agent skills and helper scripts for turning reference images into three.js scenes. A user drops images into a scene folder, the agent analyzes them, writes the scene, and serves it from a local Vite dev server for viewing. Stack: Bun, Vite, TypeScript, three.js.

Status: the viewer and commands work; `skills/`, `scripts/`, and `.claude/skills` are planned. If a listed path doesn't exist yet, create it to match rather than inventing a different structure, and update this file when it lands.

## Commands

```sh
bun install
bun run dev          # Vite dev server, http://localhost:5173/?scene=<name> (strictPort: fails if 5173 is taken)
bun run build        # production build of the viewer and all scenes
bun run typecheck    # tsc --noEmit
```

Before finishing any change, run: `bun run typecheck && bun run build`

Use `bun`/`bunx`, never `npm`/`npx`/`yarn`. The lockfile is `bun.lock`.

## Layout

| Path | What |
|---|---|
| `skills/<skill-name>/SKILL.md` | Agent skills. Plain folders; users copy or symlink them into `~/.claude/skills/` |
| `.claude/skills` | Symlink to `skills/` so the skills load when an agent runs inside this repo |
| `scripts/` | Helper tools the skills call (screenshots, image prep, asset fetching) |
| `src/main.ts` | The shared viewer: owns the renderer, canvas, camera, OrbitControls, render loop, and scene loading |
| `src/types.ts` | The scene module contract |
| `src/framing.ts` | How the viewer positions the camera on load and on `R` |
| `src/lib/` | Reusable scene helpers (lighting rigs, materials, procedural geometry) |
| `scenes/<name>/` | One generated scene: `refs/`, `brief.md`, `scene.ts`, `assets/` |

## Scene workflow

1. Reference images go in `scenes/<name>/refs/`. Use a kebab-case `<name>`.
2. Study every image, then write `scenes/<name>/brief.md` before writing code: subjects and their rough dimensions, composition, camera position and focal length, lighting (key direction, color temperature, time of day), palette, materials, and anything ambiguous you resolved.
3. Implement `scenes/<name>/scene.ts` against the scene module contract (below).
4. If a dev server is not already running on port 5173, start `bun run dev` in the background. Do not start a second one.
5. Open `http://localhost:5173/?scene=<name>`, wait for `<html data-scene="ready">` (`"error"` means the overlay has the stack), capture a screenshot, and compare it against `refs/`. Iterate on the largest mismatch first (composition and camera, then lighting, then materials, then detail).
6. Finish by reporting the URL to the user.

## Scene module contract

Each `scene.ts` default-exports a `SceneFactory` (`src/types.ts`): it receives `{ renderer, scene, camera, controls }`, populates `scene`, and returns (or resolves to, for async asset loading) a handle with optional `view` (camera position, target, fov), `update(dt, elapsed)`, and `render()` (replaces the default render call, for postprocessing). The viewer discovers scenes with `import.meta.glob('/scenes/*/scene.ts')`, so no registration step exists. Model new scenes on `scenes/example/scene.ts`.

## Conventions

- The viewer owns the `WebGLRenderer`, canvas, camera, and controls. Scenes add to the provided `THREE.Scene` and declare framing through `view`; they never create a renderer, touch `document.body`, or move the camera at load time.
- Editing a scene triggers a full page reload and scenes are switched by URL, so scenes need no teardown code.
- The renderer uses ACES Filmic tone mapping and `PCFShadowMap` (`PCFSoftShadowMap` was removed in r187). Opt meshes in with `castShadow`/`receiveShadow`.
- Check the browser console after loading a scene; three.js reports deprecated and removed APIs there as warnings, not errors.
- Import addons from `three/addons/...`, not `three/examples/jsm/...`.
- World units are meters. Set `colorSpace = THREE.SRGBColorSpace` on color textures; leave data textures (normal, roughness) linear.
- Prefer procedural geometry and materials. Pull in external models or textures only when the reference demands it, store them in `scenes/<name>/assets/`, and record source URL and license in `brief.md`. Never hotlink remote assets.
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
- `scenes/` is gitignored; generated scenes stay local. Sample scenes are the exception: each is whitelisted in `.gitignore` with a `!scenes/<name>/` line. Keep one or two; add a sample only when it demonstrates something the existing ones don't.
