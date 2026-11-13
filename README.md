# 3jays

Turn reference images into three.js scenes.

3jays is a collection of agent skills and helper scripts. You give the agent a handful of images (photos, concept art, mood boards), and it analyzes them, writes a three.js scene that matches, and serves it on a local dev server so you can look at the result and ask for changes.

> Status: early development. The viewer runs today (`bun run dev`, then open `?scene=example`), along with the screenshot and scoring scripts and the first skill.

## How it works

1. **Reference.** Put your images in `scenes/<name>/refs/`.
2. **Brief.** The agent studies the images and writes `scenes/<name>/brief.md`: subjects, composition, camera, lighting, palette, materials.
3. **Build.** The agent writes `scenes/<name>/scene.ts` using three.js.
4. **View.** A shared Vite dev server hot-reloads the scene at `http://localhost:5173/?scene=<name>`.
5. **Refine.** The agent screenshots the result, compares it against your references, and iterates. You can steer it in plain language ("warmer light", "camera lower and closer").

Every scene runs in one shared viewer, so there is one install and one server no matter how many scenes you make.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- [Bun](https://bun.sh) 1.2 or newer
- A browser with WebGL2

## Setup

```sh
git clone https://github.com/michaelyang12/3jays.git
cd 3jays
bun install
```

Running `claude` inside the repo picks up the skills automatically through `.claude/skills`.

To use the skills from any directory, symlink them into your user skills folder:

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD"/skills/* ~/.claude/skills/
```

## Usage

Start Claude Code in the repo and describe what you want:

```
Make a scene called foggy-harbor from the images in scenes/foggy-harbor/refs
```

Then open `http://localhost:5173/?scene=foggy-harbor`.

To try a new arrangement of a scene you already have:

```
Make a redox of the bedroom scene: keep the bed, move anything else, and make it cozier
```

The layouts are added to the scene itself, next to its original arrangement (the default). Each opens at `?scene=bedroom&layout=<id>`, and the main page lists them under the scene.

To run the viewer yourself:

```sh
bun run dev        # dev server with hot reload
bun run build      # production build
bun run typecheck  # type check
```

In the viewer, drag to look around from where the camera stands and right-drag to slide sideways. W, A, S and D fly forward, left, back and right along the view, Shift rises and Control drops, and the scroll wheel moves forward and back. R returns to the scene's camera.

## Project layout

```
skills/            Agent skills, one folder per skill
scripts/           Helper tools the skills call
src/               Shared viewer and reusable scene helpers
scenes/<name>/     A generated scene: refs/, brief.md, scene.ts, assets/
```

Your scenes stay local: `scenes/` is gitignored except for the bundled samples.

## Skills

| Skill | What it does |
|---|---|
| [`scene-from-images`](skills/scene-from-images/SKILL.md) | Builds a scene from reference images: studies them, writes the brief and scene, has independent reviewers score it against the references, and iterates. Also handles continuing a scene and splitting one into sections built by subagents. |
| [`scene-redox`](skills/scene-redox/SKILL.md) | Rearranges or redecorates an existing scene without resizing anything: adds named layouts beside its original arrangement, makes every item movable, tries layouts with collision, clearance and floor-space checks, adds decor, and has reviewers judge the design. |

## Contributing

Issues and pull requests are welcome. Read [AGENTS.md](AGENTS.md) for the conventions that scenes, skills, and scripts follow; they apply to human contributors too.

## License

[MIT](LICENSE)
