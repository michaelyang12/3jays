# Sections and builder subagents

A section is one area of a scene (a closet, a bed, a desk) with its own folder, params, and close-up views, built by its own subagent. `AGENTS.md` ("Views and sections") and `docs/scoring.md` ("Sections") define the tooling. This file covers how to set the work up so several builders can run at once without colliding.

## Before launching anyone

Do this yourself, in order. Builders launched into an unprepared scene edited the same files, broke each other's typecheck, and had no way to see their own work.

1. **Move the section's code** into `scenes/<name>/<section>/` with one entry module that exports the group the scene adds. Keep export and group names stable from here on; the scene and other sections import them.
2. **Fix the envelope** in the section's params: outer footprint, heights, anything a neighbour depends on (for a bed, the mattress top; for a closet, the rail height range and the opening). Builders treat these as read-only.
3. **Add close-up views** named `<section>-<id>`, one per reference photo that shows the section, plus one closer than any photo for judging materials. Check that each camera is outside the furniture and actually frames the section: `bun run shot <name> --section <section>` and look.
4. **Run `bun run typecheck`** and take a baseline screenshot of each view.
5. **Decide the section's criteria** if you will score it (see `reviewer-prompt.md`).

## Builder brief

Launch all builders in one message so they run in parallel. Each brief should contain the following. Past briefs that had all of it produced work that merged cleanly; the missing items below are the ones that caused trouble when left out.

```
You are building one section of a three.js scene in <repo>: <section> of scenes/<name>. Read <repo>/AGENTS.md first (conventions and the scene contract).

Goal: <what the section should look like when you are done, one or two sentences>.

Files you own (edit only these): scenes/<name>/<section>/**. Name new helper files <prefix>-*.ts.
Read-only: scenes/<name>/params.ts, scenes/<name>/<section>/params.ts envelope values <list them>, and every other folder in the scene. Other agents are editing <sibling folders> right now. If a shared value looks wrong, say so in your final report instead of changing it.
Keep the existing export and group names. Stay within <about 3 cm> of the current bounding boxes: the layout is approved.

What the references show, left to right: <inventory of the real objects, with the best photo for each: "refs/07.jpg: five shirts on wooden hangers, two grey fabric bins below, ...">
Do not add: <the omit list>.

Technique: <what you decided in step 3 of the skill, for example "cloth settled by position-based simulation at load, not noise heightfields; twist each hanger 15 to 45 degrees so garment faces turn toward the door">.

Checking your work: a dev server is already running on port 5173; do not start another. Run `bun run shot <name> --view <section>-<id>,<section>-<id>` and look at the images in scenes/<name>/shots/. A screenshot may catch another agent's half-saved work; if the scene fails to load because of an error outside your folder, wait a few seconds and run it again. Run `bun run typecheck` before you finish. Do not run `shot --review`, `score` or `restore`.

Final report, under 200 words: what you built, anything you guessed because the photos were unclear, and any shared value you think is wrong.
```

Why each part is there:

- **Owned files and a helper prefix** stop two builders from creating the same filename or editing a shared module.
- **Read-only envelope plus "report, don't edit"** kept shared dimensions stable; builders did report real contract problems this way, and you can fix them once for everyone.
- **The inventory** saves each builder from re-deriving what is in the photos, and makes sure nobody models the clutter the user excluded.
- **The retry note** matters because every save reloads the page for everyone. Without it, builders reported other agents' transient errors as their own failures.
- **The ban on `--review`, `score` and `restore`** is because those act on the whole scene's pending round and would destroy another section's unscored review.
- **The guesses list** is often the most useful thing a builder returns. Take the ambiguous items to the user.

## After the first pass

1. Review each section with `bun run shot <name> --review --section <section>`, two fresh reviewers, and `bun run score`. Only one review can be pending per scene, so review sections one after another.
2. Read the evidence and diagnose before forwarding. A fix list that says "garments look like thin slabs" three rounds running needs you to work out why, not a fourth forwarding.
3. Send the merged, diagnosed fix list to the same builder with SendMessage so it keeps its context. Start a new builder only if the technique is changing completely.
4. When the sections are good, run a whole-scene round. Check first that the new detail is visible from the hero camera; if it isn't, the whole-scene score won't move, and the section scores are the record of that work.

## Limits

- Long builder runs die if the machine sleeps or a usage limit hits. If builders were interrupted, check which folders changed and resume the same agents instead of starting over.
- More than four or five builders at once makes page reloads frequent enough that screenshots are often mid-edit. Batch them.
