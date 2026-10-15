# Style: cinematic product launch

A restrained premium product-film look: one hero on a quiet stage, lots of air,
continuous motion, and music that sets the tone without competing with the voice. Where glass keynote decorates, this style takes
things away. No finished edition ships yet, so every rule here is a constraint to
check in snapshots, not a copy of a demo.

Choose it for flagship launches, premium features and brand-led promos, where
people should feel the product is exclusive rather than just learn what it does.

Distilled from leo (@leomeethewoo), "Apple framework for premium product videos",
X, 2026-09-25. The rules are reworked here for HyperFrames.

## Brand lock (decide in step 1, keep for the whole project)

Premium brands feel consistent because they choose limits and never break them.
Record these in the plan before writing any HTML:

- **3 colours at most**: one background, one ink colour, one accent. Greys taken
  from the ink colour at lower alpha do not count as extra colours.
- **One background treatment** for every scene: a flat colour or one soft
  vignette. No orbs, grids or patterned backgrounds.
- **One music family** per project type, so a series of launch videos sounds
  like one brand (see BPM bands below).

```css
/* dark stage (default) */
--bg: #000000; --ink: #f2f1ee; --accent: #4a86ff;
--mute: rgba(242, 241, 238, 0.56); --hair: rgba(242, 241, 238, 0.12);
/* light stage variant: --bg: #f2f1ee; --ink: #1a1b1f; --accent: #1f5fd6; */
```

Fonts: Inter (variable; 600–700 for headlines, 400 for body), with tight
tracking (`-0.03em` at display sizes). Be Vietnam Pro 600 for captions. Do not
bundle Apple's SF Pro: its licence limits it to Apple platforms, and the
HyperFrames renderer is headless Chrome, which does not have it anyway.

## Design first: storyboard before any tween

- Write a frame list in the plan with one row per scene: the idea in one short
  sentence, the hero object, and its entry and exit. Treat it as a storyboard.
  After the first build, check it against `hyperframes snapshot` frames before
  you tune motion.
- **One shot, one idea.** If a scene needs "and", split it into two scenes.
- **Centre the hero.** The main object sits on the frame's centre axis. Text sits
  centred above or below it, never in a corner. Kickers and HUD chrome are off
  by default.
- **Breathing room.** Leave at least ~40% of the frame empty, and let no more
  than one text block share the stage with the hero.
- **Hold the reveal.** Once the key element lands, hold it still for at least one
  beat, or until the spoken word ends (`WE(...)`), before anything else moves.
- The background supports and never competes: no motion behind a headline that
  is being read.

## Motion language

- **Smooth, never linear.** Every tween uses an ease (`power2`/`power3`/`expo`
  in, out or inOut). There is no `none` ease except on opacity holds. Prefer
  small travel distances (40–120 px) and scale changes of 0.92–1.08 over big
  swings.
- **Overlapping keyframes.** Start the next property before the previous one
  finishes: position leads, opacity and blur follow about 0.1 s later, and
  children stagger 0.04–0.08 s with overlap. This keeps motion from looking
  cheap and step-by-step.
- **Continuous transitions, not cuts.** Link scenes with motion that carries
  across the boundary:
  - a match-move, where the hero shrinks or moves into its slot in the next scene;
  - a push along one axis;
  - a scale-through, where the current scene grows past camera while the next
    settles in from 1.04;
  - a soft cross-dissolve with a slight blur.
  Use a hard cut only when the story turns (a reveal or a "one more thing" beat),
  and no more than once or twice per video. Leave out the glass-keynote `#wipe`
  band, the kick flashes, the screen pulse and the mascot.
- **Adaptive rhythm.** Pace follows the section rather than a fixed tempo:
  - slow, long holds for the intro and the brand moment;
  - faster changes for the feature run, landing on beats;
  - a decelerating, held end card for the outro.
  Map this onto the beat grid: feature scenes may change every 2–4 beats, while
  hero moments get 8 or more beats.

## Music: pick the BPM band by mood

Set the band in the music plan (`positive_global_styles`) and pass it to
`fit-beat-grid.py --min-bpm/--max-bpm` so the fitted grid cannot jump an octave:

| BPM | Mood | Use for |
|---|---|---|
| 60–80 | regal, cinematic, heritage | brand films, "the story of" pieces, slow product reveals |
| 90–110 | smooth, cool, effortless | most feature and lifestyle launches (the default for this style) |
| 115–123 | elite, kinetic, sophisticated | performance or pro features, short social cut-downs |

Choose the genre for the audience, and stay in the same band across the project
series (see the brand lock).

## Sound design: subtract

- Every SFX cue must have a reason: it marks a reveal, a state change, or the
  hero landing. Remove whooshes on transitions that already read clearly, and
  remove ambience that only fills space. As a guide, use roughly one cue per
  scene or fewer.
- Keep cues soft (`vol` 0.25–0.4) and close to the motion they describe.
- After the mix, do an audit pass. Listen once with only the SFX stem and once
  with the full mix. Then delete or lower any cue that is too loud, lands off
  its motion, or does not help attention. Measure the result with
  `measure-mix-balance.py`: the mix targets in `audio-and-beat-sync.md` still
  apply.

## Captions

Minimal: no pill. Use 44 px Be Vietnam Pro 600 in `--ink` with a soft text
shadow, centred in the bottom band. Unread words sit at `--mute`, and the
current word switches to `--ink`. Captions must never cover the hero; if they
would, move the hero up rather than shrinking the captions.

## Done when (in addition to the skill's checks)

- Snapshots show one idea per scene, a centred hero and visible empty space in
  every scene.
- The palette audit finds no colour outside the three tokens, apart from alpha
  steps of the ink colour.
- There are at most two hard cuts; every other scene change is a continuous
  transition.
- The SFX audit is recorded in the plan: cues kept and cues removed, with the
  reason for each.
