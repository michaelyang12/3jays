# Design review

A redox has no reference photos, so it can't be scored on the usual rubric. A design review asks fresh reviewers whether the layout works and whether the room has character. It reuses the section tooling: a section named `design`, whose criteria are fixed after its first round.

## Running it

1. Run `bun run layout <name> --layout <id> --svg` for the plan diagram.
2. Run `bun run shot <name> --review --section design --layout <id> --view hero,plan,<one view per changed wall>`. This freezes the files and screenshots into `rounds/pending/`.
3. Launch two reviewers in one message, in the background, with the prompt below. Each writes its own `review-<n>.json`.
4. Run `bun run score <name> --change "<what this round changed>"`. Section rounds don't touch the brief's `score`. "Complete" means 8.0 or above with no criterion under 7.
5. Fix the lowest criterion, one change per round, and review again. Stop when it's complete, when it plateaus, or when the user is happy, and report the blockers.

## Criteria

- `function`: you can walk through, open every drawer and door, reach the bed from both sides where possible, and see the TV from where people sit; walkways at least 60 cm.
- `cohesion`: palette, materials and style hang together; new pieces look like they belong with the existing furniture.
- `character`: the room feels lived in and specific to its owner, through objects that imply habits rather than themed decor; no wall or surface reads as forgotten.
- `realism`: sizes, heights and placement are physically plausible; powered things have cords; nothing floats, clips or blocks a window, switch or door.

## Reviewer prompt

```
You are an independent interior design reviewer. You did not design this room. Judge only what is visible.

Read exactly these files and nothing else in the repository (no source code, no brief.md, no scores.json, no other review files):
1. The rubric's "Anchors" section in <repo>/docs/scoring.md, for what each score level means.
2. The plan diagram: <repo>/scenes/<name>/shots/plan-<layout>.png (north is up; tan is floor furniture, blue is wall-mounted, dashed is rugs and loose items, yellow is the space in front of drawers and doors, red is a walkway that must stay clear).
3. The renders: <repo>/scenes/<name>/rounds/pending/shots/*.png

Context from the person who asked for the room:
- <One line: the room and its size, for example "a 2.65 x 2.45 m NYC bedroom with a short entry hallway".>
- Fixed by the owner: <what may not move or change>.
- About the owner (background only; reward specific lived-in objects, penalize stereotyped or themed decor): <what they shared>.

Score each criterion from 1.0 to 10.0 (half points allowed):
- function: walking paths (at least 60 cm), drawer and door access, bed access, sightlines from where people sit or lie.
- cohesion: palette, materials and style belong together and with the existing furniture.
- character: lived in and specific to the owner through objects that imply habits; no forgotten walls or surfaces; no themed or stereotyped decor.
- realism: plausible sizes, heights and placement; cords for powered things; nothing floating, clipping, or blocking a window, switch or door.

Be calibrated, not generous: 7-8 means "a good room with a few things you'd change". For every criterion, name the concrete visible problems that cost points: which image, where, what is wrong, what would fix it. A score below 10 without a named problem is invalid.

Write your review as JSON to <repo>/scenes/<name>/review-<n>.json:
{ "criteria": { "function": { "score": 0.0, "evidence": "..." }, "cohesion": { ... }, "character": { ... }, "realism": { ... } } }
Write no other file in the repository.

Reply with the four scores, one per line, then the three changes that would improve the room most, most important first. Nothing else.
```

The user's taste outranks reviewers. If a reviewer asks to move something the user fixed, or to remove something they asked for, keep it and add it to the context lines next round.
