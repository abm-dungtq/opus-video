# hyperframes-skills (vendored)

Copied unchanged from https://github.com/heygen-com/hyperframes, tag `v0.8.184`
(commit d15a274c198cf18bc1df177cbe20df95392a8947), folder `skills/`. Apache License 2.0 (see LICENSE).

HyperFrames 0.8.185 dropped these skills from its skill pack (PR #5651), so opus-video keeps the
part its scripts read: `directions.mjs check`, `recipe-pack.mjs`, `make-pitch.mjs` and the PLAN
gate of `check-preflight.mjs`. `directions.mjs upstream()` reads this copy first and falls back to an
installed skill of the same name.

- `hyperframes-animation/blueprints/`, `rules/`, `transitions/`
- `hyperframes-creative/references/visual-styles.md`
- `faceless-explainer/references/cut-catalog.md`

Frame presets are not copied: the installed `hyperframes` skill ships them under
`assets/frame-presets/` with the same names.
