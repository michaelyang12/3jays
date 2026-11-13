---
name: scene-from-images
description: Build a three.js scene in the 3jays viewer from reference images (photos, concept art, wallpapers, a set of room photos), then review, score, and iterate on it. Use this whenever the user gives images or a refs folder and asks to create, make, model, recreate, or build a scene from them ("create a scene from this image", "make a scene called X from scenes/X/refs", "model my room from these photos"), and also when they ask to continue, improve, detail, or rescore an existing scene, or to split one into sections with subagents. Use it even if the user never says "skill" or "three.js".
---

# Scene from images

Turn reference images into a scored three.js scene. `AGENTS.md` holds the commands, file layout, and scene contract, and `docs/scoring.md` holds the rubric and reviewer protocol. Read both at the start and again whenever you resume a scene: other sessions change the tooling, and past runs lost time working from a stale memory of it.

This file covers what those two don't: the order of work, the choices that decided how past scenes turned out, and how to brief reviewers and builders.

## What past builds showed

Keep these in mind throughout. Each comes from several scenes.

- **Your own eye is generous.** Builders called first passes "close enough to hand over" and independent reviewers then scored them 4.9 to 6.7. Get a first review after about five screenshots of your own, not thirty.
- **Technique moves scores; tuning doesn't.** Reviewer noise is about +/-0.5 on the total. Rounds of parameter tweaks gained 0.1 to 0.3 and often reversed. The real gains came from a change of method: a solved camera, a downloaded texture in place of noise, cloth simulation in place of a heightfield, a section rebuilt by a focused builder.
- **Materials is usually the lowest criterion**, and procedural noise is why. Plan for it at the start (step 3).
- **Rounds with many changes teach nothing.** Every round that bundled five or more changes either regressed or couldn't say what helped.
- **The user's scope outranks reviewer comments.** Reviewers don't know what the user asked you to leave out or has already approved.

## 1. Intake

1. Put the images in `scenes/<name>/refs/` (kebab-case name). Never alter the user's files there. If they are HEIC, write JPEG copies beside them, numbered in capture order: `sips -s format jpeg -Z 2048 IMG_1234.HEIC --out 01.jpg`.
2. Record what the user said about scope before anything else: what to model, what to leave out (clutter, clothes on the floor, items on a dresser), anything they said about order or overlap between photos. For a scene with many objects, keep the keep-list and the omit-list in a small file in the scene folder (for example `core-items.json`) so builders and reviewers get the same lists. If the user gave no scope, decide, and write the decision in the brief.
3. If the request is a variant of a scene that already exists (a new layout, a redecorated version), stop here and follow `skills/scene-redox/SKILL.md` instead. Its layouts live in the existing scene; don't make a new one.

## 2. Study the references

Look at every image before writing code, and measure instead of estimating where you can.

- **Pick the scene `type`** from the table in `docs/scoring.md`. It sets the weights and is locked after the first scored round.
- **Sample the palette numerically.** With Python and PIL, read pixel colours at named regions of the reference (sky top, wall, floor, key highlight, deepest shadow) and put them in `params.ts`. Keep the script: after each screenshot, print reference and render colours per region side by side. Scenes that did this had colour right almost immediately.
- **Find where the light comes from**: direction, hardness, colour temperature, what is the brightest thing in frame, how dark the darkest region is.
- **Several photos of one place:** work out the floor plan from the overlaps between photos before writing any code. Choose one hero photo (the widest, most representative view): its camera is the scene's `view` and the brief's `aspect`. Every other photo that shows something the hero can't see becomes a named view. Add a top-down `plan` view too; it matches no photo, but it is the fastest check on layout.
- **Crop and brighten** dark regions of the reference. Full frames hide what is in the shadows.

Then write `brief.md` as `AGENTS.md` step 2 describes. Include the user's scope and omissions, the hero photo, and which photo each view matches. Re-read the brief against the render before you report; briefs written early have claimed things the scene never did.

## 3. Choose techniques before building

Decide how each hard subject will be made now. Past builds discovered these after three to seven wasted rounds.

| The reference shows | Use | Not |
|---|---|---|
| Figurative carving, printed patterns, recognizable props | A CC0 texture or model in `assets/` (see `references/techniques.md`) | Noise relief (reads as "crumpled foil"), props from primitives (a fan was read as "a hand mirror") |
| Bedding, blankets, pillows, hanging clothes | Position-based cloth settled at load; hanging garments twisted 15 to 45 degrees on the rail so their faces show | Noise heightfields (read as "terrain" or "slab") |
| Snow lines, rock bands, any boundary with a specific shape | An explicit mask placed where the photo has it | A slope or altitude rule tuned until it happens to match |
| Haze, glow, light shafts | Local volumes or sprites where the photo has them | A global fog or bloom veil, which costs lighting, color and atmosphere together |
| Terrain or anything kilometres from the origin | World-space noise coordinates; `near`/`far` set in the view | Noise coordinates derived from local direction, which speckle far from the origin |
| Dense, varied areas (a closet, a desk, a kitchen) | A section with its own builder (step 7) | Solid blocks refined in the whole-scene loop |

Downloading an asset is allowed by `AGENTS.md` when procedural work can't reach the detail. Record its source and license in the brief and mention it in your report.

## 4. Build in this order

Start or reuse the dev server per `AGENTS.md` step 4, then:

1. **Blockout and camera.** Rough volumes at the right sizes, and the camera solved, not eyeballed. Pick about eight landmarks in the hero photo (window corners, floor and wall junctions, furniture corners), note their pixel positions, and fit camera position, yaw, pitch and field of view by projecting the matching world points and minimizing the error. `references/techniques.md` has the recipe. Scenes with a solved camera scored 7.5 on composition from round 1 and never had to return to it.
2. **Lighting and global tone.** Key direction, contrast, black point. Fix any global veil (haze, bloom, exposure) first, since it drags three criteria at once.
3. **Subjects**, using the techniques chosen in step 3.
4. **Materials and detail** last.

Check each change with `bun run shot <name>` (add `--all` for a multi-view scene) and look at the image. Make side-by-side crops of reference and render for the region you are working on. When a number would settle it, measure: project a world point through `window.__3jays.camera` to see where it lands in the frame, or import a scene module under `bun` to print heights and normals.

If the scene has rules that must hold (no furniture overlaps, every core item present), check them in the scene and `console.warn` on failure. `bun run shot` exits 1 on warnings, so a broken rule fails the console gate without anyone having to notice it.

After about five screenshots, stop polishing and get a review.

## 5. Review and score

Follow the protocol in `docs/scoring.md`. In practice:

1. `bun run shot <name> --review` freezes the files and screenshots.
2. Launch two fresh reviewers in the same message, in the background, using the template in `references/reviewer-prompt.md`. Fill in the user's omissions every round. Reviewers who weren't told docked points for missing clutter and capped the subjects score.
3. While they work, start the next change. The round records the frozen copy, not the files on disk.
4. `bun run score <name> --change "<the one change>"`.

Expect a first score between 5 and 7. That is normal and not a reason to stop.

## 6. Decide the next change

Read the reviewers' evidence in `scores.json`, then:

- **Check surprising claims before acting.** Crop the reference and look. Reviewers insisted in four separate rounds that correctly oriented sheet stripes ran the wrong way. If the reference supports you, add the fact to the next reviewer prompt as context from the requester.
- **Treat contradictions as noise.** When one reviewer says darker and the next says brighter, sample the pixels and trust the numbers. Don't chase hue across rounds; if it can't be settled from the photo, ask the user what colour the thing is.
- **Look for the cause behind the comment.** "The TV faces the camera too much" was a wall 30 cm too shallow, not a camera fault. "Garments look like thin slabs" was a missing hanger twist.
- **One hypothesis per round**, aimed at the lowest criterion. It may touch several params, but it must be one idea you could name in `--change`.
- **Change technique after two flat rounds.** If a criterion is under 7 and two rounds of tuning didn't move it, go back to the table in step 3. Don't spend a third round on parameters.
- **Check the change is visible from the scored camera.** Detail that is small or dim in the hero view can't raise a whole-scene score. Use a section round or a closer view for it.
- **On `REGRESSED`, restore the best round** before the next change. If the regression came from something the user asked for, keep their change, tell them the score dropped, and don't count it as a failed experiment.
- **After a restore or a tooling change, rescore the baseline** before changing anything, so later rounds compare against a score made the same way.
- **On `PLATEAU`, stop** and report as `docs/scoring.md` says. Name the technique change that would break it (assets, sections, another view) instead of offering more tuning.

## 7. Sections and parallel builders

Use sections when one area needs detail the whole-scene loop can't reach, when the user asks to work on one area, or when a plateau is caused by dense subjects. In past scenes this was the largest single gain after the first build (subjects 6.75 to 7.5, materials 6 to 7 in one merge).

Read `references/section-builders.md` before launching builders. The short version:

1. Scaffold first, yourself: the section folder, its params with fixed outer dimensions, stub exports, and close-up views named `<section>-<id>`. Typecheck before any builder starts.
2. One builder per section, each owning only its folder, all launched in one message.
3. Review each section with `bun run shot <name> --review --section <section>` and fresh reviewers. Looking at the close-ups yourself is self-review and has the same bias as before.
4. Send follow-up fix lists to the same builders so they keep their context.
5. After merging, run a whole-scene round. Section rounds don't update the brief's score.

## 8. Working with the user

- **Approved means locked.** When the user says the layout or dimensions are fine, record that in the brief and stop changing them, whatever reviewers say afterwards. Past builds moved approved walls twice on one reviewer's comment and were interrupted for it. If a reviewer's size comment seems right, raise it with the user as a question.
- **Scope changes go in the brief and in the next reviewer prompt** the moment the user makes them ("remove the comforter", "ignore the clutter").
- **Don't stop for tooling gaps you can work around.** Stop for decisions that are the user's: scope, true colours, whether to trade score for something they asked for.

## 9. Shared machine

Other sessions often work in this repo at the same time.

- One dev server on port 5173. Check before starting one, never start a second, and stop it only if you started it or the user asks (`lsof -ti tcp:5173` finds the process).
- A gate that fails on a file you didn't touch is probably another session mid-edit. Rerun it before believing it.
- Edit files with the Edit tool. Script-driven edits (`sed`, Python heredocs) broke imports and triggered stale-file warnings repeatedly.
- `scenes/` may be its own git repo: use `git -C scenes ...` for scene commits, and only when the user asks. Rescore before committing a scene you changed.

## 10. Report

When the scene is `complete`, has plateaued, or the user asked for a stop, give them: the URL (`http://localhost:5173/?scene=<name>`), the score and round, the weakest criteria with the reviewers' reasons, any assets added with their licenses, and what you would do next. Say plainly if the scene is not complete.
