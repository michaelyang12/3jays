# Scene scoring

A scene built from reference images is complete only when `bun run score <name>` reports `status: complete`: overall score at or above `COMPLETE_AT` (8.0) with no criterion below `CAP_BELOW` (7.0), and every gate passing. Both constants live in `scripts/score.ts`. Scenes without `refs/` (such as `scenes/example`) are not scored.

## Criteria

Each is scored 1.0 to 10.0 against the reference images. The keys must match `CRITERIA` in `scripts/score.ts`, which also holds the weight profiles.

| Key | Judges |
|---|---|
| `composition` | Camera position, angle, focal length, framing. Where subjects sit in the frame and how they overlap. Perspective and vanishing direction. |
| `subjects` | Every key subject present, with the right shape, proportions, count, and arrangement. Nothing prominent invented. |
| `lighting` | Key light direction and quality, contrast ratio, where highlights and deep shadows fall, practical lights. |
| `color` | Palette, color temperature, saturation, tonal range (black and white points), overall grade. |
| `materials` | Surface response: gloss vs matte, metal vs dielectric, texture and carved or printed detail at the visible scale. |
| `atmosphere` | Haze, smoke, particles, light shafts, bloom, depth falloff. Score 10 if the reference has none and the render adds none. |

## Scene type

Weights depend on what is being modeled. Before building, set `type` in the brief front matter to the profile in `PROFILES` (`scripts/score.ts`) that best fits what the references depict:

| `type` | Use for | Emphasis |
|---|---|---|
| `interior` | Rooms, halls, shops, temples seen from inside | Lighting, composition, subjects |
| `landscape` | Terrain, sky, water, natural vistas | Composition, lighting, atmosphere, color |
| `architecture` | One building or structure seen from outside | Subjects (form), composition, materials |
| `town` | Streets, plazas, skylines, many buildings | Composition, subjects, lighting, even spread |
| `character` | People, creatures, figures | Subjects (anatomy, likeness) |
| `object` | A product, prop, or still life | Subjects, materials, lighting |
| `default` | Mixed or unclear | Composition, subjects, lighting |

- Choose from the references alone, before the first scored round. The script locks the type to the first round in `scores.json`; re-typing a scored scene needs the user's approval.
- If nothing fits, use `default` and tell the user. Propose a new profile in `PROFILES` instead of bending an existing one.

## Cap

If any criterion scores below `CAP_BELOW`, the total is capped just under `COMPLETE_AT`, so one glaring flaw blocks completion however strong the rest is.

## Anchors

| Score | Meaning |
|---|---|
| 9-10 | Matches the reference; differences only show side by side at the detail level. |
| 7-8 | Clearly the same scene; a few deviations noticeable at a glance. |
| 5-6 | Recognizable, but several significant errors. |
| 3-4 | Major elements wrong or missing. |
| 1-2 | Unrelated to the reference. |

## Gates

Pass or fail, independent of the score. `bun run shot <name> --review` runs all three when it freezes the review, and `score.ts` reads the results.

- `typecheck`: `bun run typecheck` passes.
- `build`: `bun run build` passes.
- `console`: the scene reaches `data-scene="ready"` with no console errors or warnings in headless Chrome, so the dev server must be running for `--review`.

## Reviewing

Scoring is done by reviewers that did not build the scene: fresh subagents or new sessions. Self-review drifts upward because the builder knows what each element is meant to be. One reviewer is noisy (about +/-0.5 on the total, and it can flip direction on a criterion between rounds), so every round uses at least two independent reviewers (`MIN_REVIEWERS`) and the script takes the median of each criterion.

1. The builder runs `bun run shot <name> --review`. It saves the screenshot to `scenes/<name>/rounds/pending/shots/`, copies the scene's files to `rounds/pending/` and runs the gates. The round records that frozen copy, so the builder can keep editing while reviewers work. Running it again replaces the pending review and deletes unscored review files.
2. Each reviewer receives only this file, the reference images, the screenshot, and the name of its output file. Not the code, `brief.md`, earlier scores, or the other reviewer's output. Run them in parallel.
3. For every criterion the reviewer names the concrete visible differences that cost points. A score below 10 without a named difference is invalid.
4. Reviewer `n` writes `scenes/<name>/review-<n>.json` (`review-1.json`, `review-2.json`, ...):

   ```json
   {
     "criteria": {
       "composition": { "score": 7.5, "evidence": "Nearest disc sits right of center; reference has it centered." },
       "subjects": { "score": 8.0, "evidence": "..." },
       "lighting": { "score": 8.0, "evidence": "..." },
       "color": { "score": 8.0, "evidence": "..." },
       "materials": { "score": 8.0, "evidence": "..." },
       "atmosphere": { "score": 8.0, "evidence": "..." }
     }
   }
   ```

5. The builder runs `bun run score <name> --change "<the one change this round tests>"`. If two reviewers differ by more than `MAX_SPREAD` (2.0) on any criterion, the script stops without recording a round and asks for one more `review-<n>.json` from another fresh reviewer; with three or more the median absorbs the outlier. Otherwise it takes the per-criterion medians, computes the total, runs the gates, and appends the round (change note, medians, every review) to `scenes/<name>/scores.json`. It writes `score` and `status` into the `brief.md` front matter, renames `rounds/pending/` to `rounds/r<N>/`, and moves the review files there, so a review can never be scored twice. If no review was frozen, it freezes the files as they are at scoring time and says so; those may not match what reviewers saw.

## Sections

A large scene can be reviewed one section at a time (see "Views and sections" in `AGENTS.md`).

- `bun run shot <name> --review --section <section>` captures every view named `<section>-<id>` and freezes the scene as above.
- The builder chooses the section's criteria (snake_case, for example `garments`, `organizers`, `materials`, `color_light`) and gives reviewers the list. Reviewers write the same `review-<n>.json` files with those keys. The first scored round fixes the list for that section.
- `bun run score` weights a section's criteria equally and applies the same cap and gates. The round goes into the same `scores.json` with a `section` field and the same round numbering, so `restore` works on it. Best round, `REGRESSED` and `PLATEAU` are judged within the section, and the brief's `score` and `status` are left alone.
- After merging section work, run a whole-scene round.

## Iterating

- Fix the lowest-scoring criterion first, using the reviewers' evidence as the to-do list.
- One change per round: a single hypothesis aimed at one criterion ("carved panels from a texture instead of noise"), even if it touches several params. A round that changes many things can't tell you which one hurt. Record it with `--change`.
- Start the next change while reviewers work: the round records the files frozen by `shot --review`, not the files on disk at scoring time.
- Fresh reviewers every round.
- If a round scores more than `REGRESSION_MARGIN` (0.2) below the best so far, the script prints `REGRESSED`. Run `bun run restore <name> <best round>` before the next change, so you don't build on a regression. A smaller drop is reviewer noise; keep the change only if the evidence says it helped.
- `bun run restore <name> <round>` copies a round's saved files back over the scene (not `brief.md`, `refs/` or `assets/`). It refuses if the scene has changes since the last scored round, unless you pass `--force`.
- If the script prints `PLATEAU` (the best of the last three rounds beats the best before them by less than +0.2), stop. Report the score, the blocking criteria, and what you think is limiting them (technique, missing assets, ambiguity in the reference) to the user. Don't mark the scene complete.
