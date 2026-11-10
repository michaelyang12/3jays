# 3jays

Turn reference images into three.js scenes.

3jays is a collection of agent skills and helper scripts. You give the agent a handful of images (photos, concept art, mood boards), and it analyzes them, writes a three.js scene that matches, and serves it on a local dev server so you can look at the result and ask for changes.

> Status: early development. The viewer runs today (`bun run dev`, then open `?scene=example`); the skills are still being written.

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

To run the viewer yourself:

```sh
bun run dev        # dev server with hot reload
bun run build      # production build
bun run typecheck  # type check
```

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
| _coming soon_ | |

## Contributing

Issues and pull requests are welcome. Read [AGENTS.md](AGENTS.md) for the conventions that scenes, skills, and scripts follow; they apply to human contributors too.

## License

[MIT](LICENSE)
