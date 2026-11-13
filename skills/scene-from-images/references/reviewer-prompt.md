# Reviewer prompts

Reviewers are fresh subagents every round, launched in parallel and in the background. Give each one a different output file (`review-1.json`, `review-2.json`). Use absolute paths. Replace everything in angle brackets.

These templates are assembled from the prompts that kept two reviewers within 0.5 to 1 point of each other across four scenes. The parts that mattered:

- An explicit list of what to read and what not to read. Reviewers who see code or the brief score what was intended, not what is visible.
- Frame positions in the evidence ("board edge at 62% of width"). You can feed those straight into a projection fit.
- The requester's omissions, labelled as coming from the requester and not the builder, so the reviewer treats them as the brief for the job.
- A short reply. The evidence is in the JSON; a long reply only fills your context.

## Whole-scene review

```
You are an independent reviewer scoring a three.js render against reference photographs. You did not build the scene. Judge only what is visible.

Read exactly these files and nothing else in the repository (no source code, no brief.md, no scores.json, no other review files, nothing under rounds/ except the screenshot named below):
1. The rubric: <repo>/docs/scoring.md. Follow its "Criteria", "Anchors" and "Reviewing" sections.
2. The reference the render's camera matches: <repo>/scenes/<name>/refs/<hero>. View this one first.
3. <Only for multi-photo scenes> Other references, for context on objects and materials only; the render is not meant to match their viewpoints: <paths>
4. The render: <repo>/scenes/<name>/rounds/pending/shots/hero.png

Context from the person who requested the scene (not from the builder):
- <What the scene is, in one line.>
- Intentional omissions: <list from the brief or core-items file>. Score as if these were absent from the photos; their absence from the render must not cost points under any criterion. Everything else is scored normally.
- <Any verified fact that reviewers have got wrong before, for example "the sheet stripes run across the bed in the reference".>

Score each of the six criteria from 1.0 to 10.0 (half points allowed) using the anchors. Be calibrated, not generous: 7-8 means "clearly the same scene, a few deviations noticeable at a glance". For every criterion, name the concrete visible differences that cost points: where in the frame (approximate percent of width and height), what the reference shows, what the render shows. A score below 10 without a named difference is invalid.

You may crop or zoom the images with Python and PIL. Write temporary files only under <scratchpad>/review-<n>/.

Write your review as JSON to <repo>/scenes/<name>/review-<n>.json in exactly the shape shown in the rubric. Write no other file in the repository.

Reply with the six scores, one per line, then the three fixes you think would raise the score most, most important first. Nothing else.
```

If the scene has no omissions and no known reviewer errors, delete those lines; don't leave them empty.

## Section review

Section rounds use criteria you choose (snake_case, fixed after the section's first round). Pick three to five that name what the section is made of, for example `garments`, `organizers`, `materials`, `color_light` for a closet. Tell the reviewer which render goes with which reference.

```
You are an independent reviewer scoring one section of a three.js scene against reference photographs. You did not build it. Judge only what is visible.

Scope: ONLY <the section, for example "the closet interior">. Ignore the rest of the room. Camera framing is approximate; do not score it.

Read exactly these files and nothing else in the repository:
1. The rubric's "Anchors" section in <repo>/docs/scoring.md.
2. Render and reference pairs:
   - <repo>/scenes/<name>/rounds/pending/shots/<section>-<id>.png shows the same area as <repo>/scenes/<name>/refs/<file>
   - <more pairs>

Context from the person who requested the scene:
- Intentional omissions: <list>. Their absence must not cost points.

Criteria (score each 1.0 to 10.0 using the anchors):
- <key>: <what it judges, one line>
- <key>: <what it judges, one line>

For every criterion, name the concrete visible differences that cost points: which render, where in the frame, what the reference shows, what the render shows. A score below 10 without a named difference is invalid.

Write your review as JSON to <repo>/scenes/<name>/review-<n>.json:
{ "criteria": { "<key>": { "score": 0.0, "evidence": "..." }, ... } }
Write no other file in the repository.

Reply with the scores, one per line, then a prioritized fix list <split per builder if several builders share the section>. Nothing else.
```

## Using the replies

- The ranked fixes are suggestions, and successive reviewers contradict each other on them. Use the evidence text to decide; use the fix lists to see what two reviewers agree on.
- Reviewers can say what differs from the reference. They can't say whether your last change helped, since they never saw the previous round. The score comparison does that, and only for a one-change round.
- If two reviewers describe the same subject differently ("the rock wedge is missing" and "the wedge is in the wrong place"), look at the crop yourself before choosing a fix.
