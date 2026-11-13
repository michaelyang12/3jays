# Decor

New pieces go in `scenes/<name>/decor/`:
- Values in `decor/params.ts`, next to the decor footprints.
- Builders grouped by theme in `decor/<theme>.ts`, with procedural textures in `decor/textures.ts`.
- A registry in `decor/index.ts`.

`scenes/bedroom/decor/` and `scenes/114/decor/` are worked examples.

## Building a piece

- **Local origin.** Build at the origin with the back at z = 0 and the front facing +z (south). The footprint's `min` is `[0, 0]` and its `facing` is `'S'`. Placing it is then only a layout entry.
- **Things that sit on furniture** (a turntable on a dresser, books on a shelf) are built in the host's home frame. Give them `attachTo: '<host>'` and the layout value `'attached'`.
- **Powered things get a cord** to an outlet or a plausible wall point. Tag the cord `userData.outsideFootprint = true`.
- **Art, covers, posters and screens** are original canvas textures:
  - No real logos, transit branding, band or brand names, or copied artwork.
  - Text should read as the person's own: a show date and a borough, a homemade display showing train times and the weather.
- **Every piece can be removed** by deleting its layout entry. Never fold decor into a furniture builder.

## Avoiding the dorm-room look

The user called a tidy first pass "empty and plain, like a dorm room". Check every layout against this list before showing it:

- **Each visible wall** has a focal piece (art, a shelf, an instrument, a mirror) or a deliberate reason to stay bare, such as a window wall with curtains.
- **Surfaces are styled in small groups** of odd numbers and varied heights: dresser top, shelves, sill, nightstand. Something tall, something low, something living.
- **Textiles soften hard edges:** curtains hung wide and high, a throw, a pouf or floor cushion, a runner in a hallway.
- **Light comes in layers:** the ceiling key dimmed, plus two or three warm practicals at different heights (lamp, sconce, a bias glow behind a screen). Put light changes on the layout, not on the global params.
- **Plants go near light:** sill, beside the window, or in a corner the window reaches.
- **Scale is real:** shelves 15 to 25 cm deep, art centered around 1.45 to 1.6 m or 15 to 25 cm above the furniture below it, nothing over a window, switch or door swing.

## Making it theirs

When the user shares who they are, use it as background, never as a theme. Pick objects that imply a habit or a story, things this person would plausibly own and use, rather than symbols of a category.

From the bedroom (a software engineer who loves music, is Asian, and lives in NYC). These worked:
- A turntable between small powered speakers on the dresser, with records in original abstract covers.
- An acoustic guitar on a wall hanger.
- A homemade e-ink display by the door showing train arrivals, the time, and "umbrella: yes".
- A rubber duck on the bookshelf (the debugging in-joke).
- A shoes-off entry: a shoe rack and house slippers.
- An abstract street-grid print with a red dot for home.
- A gig poster from a Brooklyn show.
- Headphones resting on a book stack.

Avoid:
- Flags, skyline or landmark posters, slogan art.
- Cultural props chosen because of the person's ethnicity (lanterns, calligraphy, cherry blossoms, figurines).
- Code printed on posters, tech-company or real-band merchandise.

If you can't tell whether an object reads as a stereotype, leave it out, or ask.

## Checking

- Look at every view, and at the plan diagram for floor pieces.
- Describe new pieces to the user by what they say about the room: "a warm light by the pillows besides the ceiling dome", not "added sconce".
- Finish with a design review (`design-review.md`).
