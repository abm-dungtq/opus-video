# Changelog

## v2.0.0 (2026-10-16): plugin with eleven skills, four operating modes, project.json manifest

Why: the 45 KB root `SKILL.md` loaded every rule of every step into each session, could not be routed by intent (a quick template video and a timeline edit read the same 253 lines), and the timeline had no single source of truth: seconds lived in PLAN.md, the TIMING block and the voice tags at once, with nothing to undo a change.

### Breaking
- The root `SKILL.md` is gone. The repo is the Claude Code plugin `opus-video` (`.claude-plugin/plugin.json`, private marketplace `opus-video-private` in `.claude-plugin/marketplace.json`) with eleven skills under `skills/`: `opus-video` (router), `ov-setup`, `ov-brief`, `ov-direction`, `ov-cases`, `ov-script`, `ov-audio`, `ov-build`, `ov-footage`, `ov-deliver`, `ov-studio`. Every rule of the old file moved into exactly one skill (text moved, not paraphrased); `scripts/tests/plugin-layout.test.mjs` checks names, descriptions, length (≤ 150 lines) and every `$OV/scripts|references` path.
- Under `~/.claude/skills/opus-video` Claude Code loads the checkout in place as `opus-video@skills-dir`; do not also install it from the marketplace on that machine. `install.sh` / `install.ps1` detect a local checkout by `skills/opus-video/SKILL.md`, and for Codex and Antigravity copy the router `SKILL.md` to the plugin root and link (Windows: copy) each `ov-*` skill beside it.

### New
- Four operating modes in the router: `dao-dien` (full director, default), `nhanh` (one case instead of three styleframes; BRIEF records `creative_override: nhanh theo case <id>`, the animatic gate stays), `tu-nhac` (music or footage first), `timeline` (edit an existing project through `ov-studio`).
- `scripts/manifest.mjs`: `project.json` schema `opus-video/project@1` (shots back to back from 0, voice lines, music beds, assets, version) and `validate` with Vietnamese errors.
- `scripts/gateway.mjs`: the one writer of `project.json`. `patch` (ops `resize_shot` with ripple, `move_line`, `set_shot`, `set_line_text` → gate `stale`, `set_music`, `add_shot`, `remove_shot`), `undo` (a new version restoring the previous snapshot, never past the latest import), `log`, `show`, `derive`. Each change is a version with a snapshot in `.opus/versions/` and a line in `.opus/history.jsonl`, serialized by `.opus/lock`. Derived files (TIMING block, voice `data-start`/`data-duration`, root `data-duration`, PLAN.md Thời điểm cells, `timing.json`) are written before `project.json`; tags inside HTML comments are skipped and a line without a live tag is a WARN. Exit 3 CONFLICT, 4 view only, 5 INVALID, 7 nothing to undo, 8 BUSY.
- `scripts/manifest-import.mjs`: `project.json` for a project made before the manifest (shots from PLAN.md, scene sub-compositions, audio_meta voices or the root; lines by midpoint; text from `script/NN.txt`, audio_meta or the `words.json` sidecar). It only adds `project.json` and `.opus/`; projects without TIMING markers are view only.
- `timing.mjs` on a project with `project.json` goes through `gateway.mjs derive`.
- `setup-check.mjs` prints `opus-video plugin: installed|missing` (a WARN, never MISSING).
- `mcp/server.mjs`: stdio MCP server `opus-video` (declared in `plugin.json` `mcpServers`). Tools `project_get`, `project_log`, `project_patch` (actor `director`, optional `receipt_note` kept in history), `project_undo`, `studio_request_next`, `studio_request_done`.
- Motion Studio: `scripts/studio.mjs start [--background] [--root <dir>] | status | stop` serves `studio/` on `127.0.0.1:4317` (one server per machine; another root or a held port is exit 3). Player (HyperFrames runtime injected into the project page, see `studio/PLAYER.md`), timeline with shot-edge and voice drags, inspector, versions and undo (Ctrl/Cmd+Z), seven panels, SSE refresh on `project.json` and request changes, "Nhập dự án" for projects without a manifest. Every edit goes through the gateway as actor `human`; 409 reloads. Host and Origin checks, a per-run token for POST, no dotfiles outside `.opus/`. The director buttons are not wired yet.
- `gateway.mjs` `patch` and `undo` take `lockWaitMs`; Studio waits 300 ms and answers 503 when busy.
- `scripts/requests.mjs`: the Studio → director queue in `.opus/requests/<id>.json` (`enqueue`, `next`, `finish`, `list`). Claiming renames the file to `<id>.claim`, so two runners never take the same request; `at` is strictly increasing per project.
- Corpus: yihui refreshed to `92aee2f` (703 cases, 295 new). The 105 cases upstream removed stay in `data/cases.jsonl` with `upstream_removed: true`; `find-cases` and `rerank-cases` hide them unless `--include-removed`. `build-case-index.mjs` takes `--yihui-commit`, `--chus-commit`, `--previous` and prints `ADDED · KEPT · REMOVED · TOTAL`.
- `scripts/case-template.mjs` (quick mode): one case → `build/TEMPLATE.md` (prompt verbatim, author, URL, license, brief topic and aspect, adaptation checklist) and `creative_override: nhanh theo case <id>`. `check-preflight` keeps the final-stage animatic gate for that override.

## v1.2.0 (2026-10-15): composition template, measured mix, word and beat sync, reframe, 61 styles

Why: every project started from an empty `index.html` with seconds typed by hand, so a new voice take meant re-timing every tween. The final mix never lowered the music under the voice: a measured HyperFrames render of a `data-fx-carve` project (no `data-fx-chain`) showed a constant 2 dB offset, not a duck. The BPM was only a word in the music prompt, on-screen keywords had no check against the spoken word, the 9:16 edition was a second hand-built composition, and the look of a video had no vocabulary beyond the direction's style keyword. The workflows of the motion-video skill of AgentKit (MIT, v1.3.0) cover these; they are rewritten here in Node and ffmpeg, with no Python at run time.

### New scripts
- `scripts/composition.mjs init`: starts `index.html` from `templates/composition/index-skeleton.html` (HyperFrames 0.8.144, Be Vietnam Pro): 19 helpers: animation (`pop`, `rise`, `draw`, `slideX`, `typeIn`, `odo`, `slam`, `settleCam`, `shake`…) and anchors, `W(scene, phrase)` / `WE` on the spoken phrase, `B(n)` on the measured beat, an empty TIMING block, ratio-aware CSS (`html[data-ratio]`, `--W/--H`). The frame follows `--aspect` or BRIEF `aspect` (`both` starts at 16:9). Never overwrites.
- `scripts/timing.mjs`: fills the TIMING block (between `TIMING:BEGIN` and `TIMING:END`) and `timing.json` from PLAN.md `## Cảnh`, every voice word (id `vo-*` or `*-voice`, group `voiceover` or a src under `assets/voice/`, from `words.json`) on the root timeline and the beat grid of `*.beats.json`. `--music` picks the bed when there are several; a file without markers is refused. Re-run after every voice change.
- `scripts/beat-grid.mjs`: BPM, BEAT0, kicks and drops of a music bed (port of `fit-beat-grid.py`: two ffmpeg decodes, onset of log RMS, constant-tempo grid search, octave check). `--write` writes `<music>.beats.json` only when stable; `--json`. Measures only, never splices.
- `scripts/word-sync.mjs`: `chữ: "…"` rows of `## Sự kiện` against the moment the phrase is spoken (same phrase rule as `W()`), the nearest occurrence to the row's time. `--json`, `--write-qa`.
- `scripts/mix-balance.mjs`: how far the music sits under the voice while words are spoken, from the voice and music stems of the `audio-mix` rebuild. One `BALANCE` line, `--json` adds each duck's natural, target and achieved reduction.
- `scripts/reframe.mjs`: derives the 9:16 or 1:1 edition of a one-`index.html` project into `<project>-9x16` / `-1x1` (frame size, `data-ratio`, `data-resolution`, BRIEF aspect; `assets/` cloned file by file: an APFS copy-on-write clone, a plain copy on another volume, never shared on write). `WARN layout` for 1920-wide values outside the override blocks. `--force` rewrites only an edition it wrote, and only the files reframe writes (its `renders/`, `demo/`, `DEMO.md`, `QA.md`, `REVISIONS.md` stay); frame-worker projects are refused.
- `scripts/styles.mjs`: `index`, `validate`, `find`, `show`, `css`, `suggest --direction`, `resolve --project` over `data/styles/` (61 profiles converted once from the motion-video YAML, every key and value kept, plus `ten_vi` and `mo_ta_vi`). `resolve` applies BRIEF `style_profile:` and the `## style_layers` array per PLAN scene (by id or by the optional `Loại` column) and prints a block for `## Ý đồ sáng tạo`.
- `scripts/balance-measure.mjs` (library): the one reader of voice `words.json` shared by `timing`, `audio-mix` and `mix-balance`.
- `audio-mix.mjs`: `data-audio-group` and `data-fx-carve` become an ffmpeg sidechain (they no longer force the HyperFrames mix); `--loudnorm` (loudnorm measures, then one static gain toward −14 LUFS capped at −1.5 dBTP, no dynamic processing; `WARN LOUDNESS` when the peak keeps the mix more than 0.5 LU under −14; always on in `render-final`), `--stems <dir>`. `make-demo.mjs --animatic` also cuts one 6×3 contact sheet per scene (`scene_sheets:`, `scene_sheets_9x16:` in DEMO.md). `make-pitch` assigns a style per styleframe and `choose` writes `style_profile:` (`--style-profile`). `directions.json` gives every direction 4 suggested styles.

### New gates
- `check-preflight --stage final`, projects with `index.html`: `mix-balance` (FAIL blocks, WARN warns, a measuring error only warns). Creative projects: `word-sync` (FAIL blocks). Both stages: `style_profile:` must resolve with its layers (FAIL for new projects, WARN for older ones; a creative project without it gets a WARN). `REVISIONS.md` fixes that do not name their scene sheet warn once DEMO.md lists sheets.
- `beat-grid`: `UNSTABLE` (exit 1, no file written) when the spread is over 45 ms or fewer than 4 onsets can be measured. `B()` throws `B() cần beat-grid.mjs` on an unmeasured grid.
- For `aspect: both`, a missing or landscape `animatic_9x16` now points at `reframe.mjs . --ratio 9x16` and `make-demo --hyperframes ../<project>-9x16` first, `--composition compositions/main-9x16.html` for older projects.

### Thresholds and sources
- Music under voice: PASS 4–7 dB, WARN 2–4 or 7–10 dB, FAIL beyond. Source: motion-video `audio-and-beat-sync.md`, where music about 10 dB under the voice was reported as "there is no music". Duck target `4 + 2.5 × strength` dB (0.8 → 6 dB), found by a closed-loop search (re-measure after each trial, at most 6 passes, ±0.3 dB, cap 12 dB): a fixed slope did not hold, the sweep on the Gemini copy gave about 3.9 + 0.52 × drop.
- Word sync: PASS within 150 ms, WARN within 250 ms, FAIL beyond (plan acceptance criterion; the 150 ms hand check of the QA list is gone).
- Beat grid: 45 ms. At the first 25 ms, four of six real beds in the workspace (abm-intro 35 ms, viet-pro-intro 34, grok-bot-sme-9x16 40, opus-video-smoke 36) were flagged although their tempo read right; at 45 ms all six are stable and a 100→140 BPM drift (about 100 ms) still fails. A slow bed read at double tempo: `--max-bpm 100`. Octave check: the double tempo wins at 90 % of the best score (a 150 BPM four-on-the-floor read 75 without it).
- Reframe safe areas for 9:16: 12 % top, 20 % bottom, type about 1.3×. Scene sheets: 18 frames, 320 px wide, none for a scene under 0.5 s.
- Calibration on copies in `/tmp`: Gemini 4 Argon (carve, strength 0.8) `PASS BALANCE` 6.1 dB, mix −15.6 LUFS / −1.5 dBTP peak (the peak caps the gain at +1.4 dB), two keyword rows PASS at 0 ms; Claude Code CEO SME (older project, no carve, voice ids `el-NN-…-voice`) 8.4 dB, one keyword at −360 ms (WARN as an older project). Thresholds unchanged.

### Docs
- New: `references/motion-craft.md` (motion standard in Vietnamese, per-scene checklist), `references/style-system.md` (two axes, budget-friendly reading, 7 resolve rules), `references/styles/detail/` (three verbatim detail documents), chapter 14 of `docs/huong-dan-chuyen-sau.md`.
- Updated: `audio-pipeline.md` (beat grid, mix target in dB under the voice, carve ducking, calibration), `qa-checklist.md` (BALANCE and WORD rows, the narrowed meaning of the word-sync scene WARN), `engine-selection.md` (one-`index.html` path, reframe limits), `plan-demo.md`, `brief-template.md`, `revisions.md`, `edit-method.md`, `creative-directions.md`, SKILL.md steps 1b, 4, 5, 6, 6b, 8 and the reference table, README.
- `NOTICE` credits AgentKit; its license is in `third_party/agentkit-motion-video/LICENSE`.

### Compatibility
- Older projects (no `direction:` and no `brief_version: 2`): every new check is a WARN. `check-preflight --stage final` gives the same exit code as v1.1.0: `bds-ban-do-pip-9x16` 0, `abm-intro` 1.
- `new-project.sh --aspect both` (studio script, outside this repo) now makes one folder and calls `composition.mjs init`; `--legacy-pair` keeps the two-folder layout.
- Voice tracks: id `vo-*` or `*-voice` (faceless-explainer's `el-NN-…-voice`), group `voiceover`, a src under `assets/voice/`, or a carve source; one rule (`isVoice` in `audio-mix.mjs`) for `audio-mix`, `mix-balance`, `timing` and `word-sync`. `check-preflight --stage final` on `claude-code-ceo-sme` now adds `WARN BALANCE` 8.4 dB (exit 0, as before).
- `timing.mjs` refuses several `assets/bgm/*.beats.json` without `--music` (exit 2).

### Known limitations
- The duck search is not cached: each `audio-mix` run with a carve bed builds up to 8 full-length mixes (natural, up to 6 trials, final) and decodes two stems per trial, and `render-final` runs it twice (final preflight via `mix-balance`, then the delivered mix), so about 16 mixes per final render: about 2 s for a 12 s video, an estimated 1 min per side for 3 minutes. It costs time, not correctness.
- `styles.mjs find` does not score like the Python original (`difflib`): an exact id or alias scores 1, otherwise the best of 0.7 × name similarity (bigram Dice, counted from 0.5) and 0.6 × the share of query words found in the descriptions. Rankings can differ from motion-video for the same query.
- `styles.mjs find` matches a Vietnamese query syllable by syllable, not by adjacent syllables: "phong cách tối giản" ranks `creative-suite` and `glass-keynote` (0.600, "toi" and "gian" from "không gian") above `minimal-future-product` (0.300). It only orders suggestions; the user still picks the style.
- `reframe.mjs` layout WARN only reads `left/top/width/height` in CSS and `style=""`. It misses GSAP `x:` and `translate(...px)`, `right/bottom/inset`, and a `data-width="1920"` root of a sub-composition in `compositions/`.
- `data-resolution="square"` on the 1:1 edition: `square` is the 1080×1080 preset of `hyperframes render --resolution` in 0.8.144, and `npx --yes hyperframes@0.8.144 lint` on a 1:1 edition in `/tmp` reports 0 errors. A full 1:1 render was not run.
- The carve duck matches HyperFrames' duck level only, not its multi-band EQ.

## v1.1.0 (2026-10-14): picture-event sync, readable hold, revision loop

Why: three faults slipped past every existing gate. A sound effect could ring after the moment it belongs to (a click heard after the button is pressed), because many SFX files start with silence and `data-start` only marks where the file begins. On-screen text could leave before a viewer can read it. And each fix meant re-rendering the whole video, with no record of what had changed.

### New script
- `scripts/sfx-sync.mjs`: reads the `## Sự kiện` table in PLAN.md (`Thời điểm | Sự kiện | Âm thanh`, seconds on the root timeline), finds each sound in `index.html` (or `--html`), measures the file's leading silence with ffmpeg at the file's own peak − 20 dB (so a quiet file is not read as all silence) and compares the moment the sound is heard with the event. One `LEVEL SYNC` line per event. `--fix` prints the `data-start` that would put the sound on the event and never edits the HTML; `--write-qa` appends to `QA.md`; `--json` prints an array. Measurements are cached per file sha256 in `assets/sfx-onsets.json`. Exit 0 no FAIL, 1 a FAIL, 2 bad usage or missing PLAN.md / HTML. Sounds inside a sub-composition are reported, not measured.

### New rules in `check-preflight`
- Creative projects (`direction:`): the plan stage requires a `## Sự kiện` section, either a table with at least one row or the line `không có SFX gắn sự kiện` (WARN only, and only when the table has no rows). An empty section, a `TODO` or a header-only table fails like a missing one. The final stage runs `sfx-sync`: FAIL lines block, WARN lines warn, a missing section only warns so a delivered project can still re-render.
- Readable hold, both stages, every project, WARN only: quoted on-screen text in the picture column of `## Cảnh` must stay up at least `max(1 s, words / 2.5 + 0.5 s)`. A cell may state `(giữ đến <t>s)` or `(giữ đến hết)` when the text stays past its beat; the hold is then measured to that mark.
- `REVISIONS.md`, final stage, every project, WARN only: a round with more than 5 fixes, or a fix missing one of `Vị trí`, `Lỗi thấy`, `Đổi`, `Giữ nguyên`.

### Thresholds and sources
- Sync windows from ITU-R BT.1359-1 (sound minus picture): PASS from −45 to +125 ms, WARN from −90 to +185 ms, FAIL beyond.
- Reading speed 2.5 words/s from viet-pro `references/publishing/video-script.md`. The 0.5 s eye-landing time is an assumption, marked as such in the code. The hold rule stays a WARN until more projects are measured: on the Gemini 4 Argon project the closing title and tagline (9 new words) stay about 2.2–2.8 s against a 4.1 s threshold, and read fine in the frames.
- Calibration on a copy of that project: all five SFX PASS when the event times are their `data-start`; `keys.mp3` measured 30 ms of leading silence, the quiet `send.mp3` (peak −32 dB) 0 ms.

### Docs
- `references/revisions.md`: the revision-round template (four fields, at most five fixes per round, check each fix with `hyperframes snapshot --at`, one animatic per round; HyperFrames 0.8.144 has no `--range`).
- `references/plan-demo.md` (event table, hold marks, measured vs proposed marks), `references/edit-method.md` (times are on the root timeline), `references/pattern-library.md` (card 10, Launch Clip), `references/audio-pipeline.md`, `references/qa-checklist.md`, SKILL.md steps 6 and 6b, README and chapter 13 of `docs/huong-dan-chuyen-sau.md`.
- README test command is now the quoted glob `node --test "…/scripts/tests/*.test.mjs"`; the directory form exits 1 on Node 24 even when no test fails.

### Compatibility
- Legacy projects (no `direction:` and no `brief_version: 2`) are not blocked by anything new: `sfx-sync` turns every FAIL into a WARN for them and `check-preflight` does not run it. `bds-ban-do-pip-9x16` and `abm-intro` give the same output and exit code before and after this change.

## v1.0.0 (2026-10-14): creative direction, brand kit, real data

Why: a one-line brief ("15s, công nghệ cao cấp") produced four title cards sliding up and fading. Causes found: step 1 told the agent to fill the style itself; the script was written before any visual idea (one sentence = one card); the general-video path built without HyperFrames recipes; the demo gate showed stills, which cannot reveal a slide swap; no gate looked at motion. Property and news videos also needed real numbers (nearby amenities, source text) instead of typed-in ones.

### Workflow
- New SKILL.md step 1b: the user picks one of three styleframes built from their own topic, before the script. The chosen styleframe becomes the opening scene. Step 1 asks only for the minimal brief; step 2 writes the script after the direction (picture leads, words follow) within `word_budget`; steps 4b, 6, 6b, 8 and the reference table follow the new gates. SKILL.md suggests writing the three styleframes with parallel agents when the runtime allows (about 15 minutes when written one after another).
- Step 6 builds from `build/RECIPES.md`; step 6b approves a motion draft (animatic) instead of stills.
- `data/directions.json`: 8 creative directions (A1 to A8: one-shape morph, prompt to live artifact, kinetic type with beat invert, continuous camera with cursor, 3D flythrough, live data, editorial marker, map/PiP), two knobs (energy, palette) and 5 swappable keyword groups (style, visual, effect, transition, sfx) with Vietnamese labels. Every token is a real HyperFrames blueprint, rule, preset, visual style or seam. `references/creative-directions.md` is generated from it.
- `references/styleframe-examples/` holds one finished styleframe per direction (A2, A3, A4) from a real pitch; `STYLEFRAME.md` points to the example of its direction when one exists.
- `references/pattern-library.md`: vertical news and niche explainer cards (9:16), with every on-screen number traced to `SOURCES.md`.
- `references/brand.example.json`: template for a shared brand kit (`shared-assets/brand.json`).
- Docs: `brief-template.md`, `plan-demo.md` (7-column scene table), `edit-method.md` (all 22 blueprints, anti-slideshow rules, the 4 cut-catalog seams), README, chapter 12 of `docs/huong-dan-chuyen-sau.md` and the prompt library page `docs/thu-vien-prompt/07-chon-huong-sang-tao.md`.

### New scripts
- `scripts/directions.mjs`: `check` (token existence against the installed HyperFrames), `pick` (deterministic, one direction per tier: fit / continuous / bold; topic keywords match whole words), `show`, `compat` (clash warnings, exit 3), `doc --write`.
- `scripts/make-pitch.mjs`: `init` scaffolds 3 HyperFrames styleframe projects with `STYLEFRAME.md` and `RECIPES.md`; `render` makes 3 draft clips, `sheet.jpg` and `PITCH.md` (numbered menu, works on every agent) and measures their motion; `choose` writes `direction`, `direction_swaps`, `energy`, `palette`, `word_budget`, `music_only_s`, `creative_selection`, `styleframe` and `## creative_direction` into `BRIEF.md`. `render` refuses an unwritten scaffold, checks ffmpeg and ffprobe first (exit 1), never reuses a stale poster, and exits 4 when a styleframe fails MOTION. Smoke run: 3 × 3 s styleframes rendered in 26 s.
- `scripts/recipe-pack.mjs`: inlines the blueprint/rule/seam recipes named in PLAN.md (or a direction) into `build/RECIPES.md`, build rules first.
- `scripts/brand.mjs check`: validates the brand kit (`#rrggbb` colours, banned directions that exist; missing logo or font files are WARN). `make-pitch` reads it: banned directions leave the pick, `STYLEFRAME.md` gets the colours, logo and fonts, `choose` defaults to palette `thuong-hieu` and fills `voice_id` / `tts_model` when BRIEF has none or only the template default. An explicit brand path that does not exist fails; a brand file in `PICK.json` that is gone is a WARN.
- `scripts/poi-fetch.mjs`: real nearby amenities (school, market, supermarket, transit, hospital, park, mall) around an address or a point, from OpenStreetMap (Nominatim, Overpass), with straight-line distance and walking time (estimate, or the FOSSGIS OSRM foot router with `--route`). Writes `sources/poi.json` (cache keyed by centre, radius, kinds and `--route`), the POI section of `SOURCES.md` and the ODbL credit in `assets/CREDITS.md`, and prints the geocoded place so a wrong match is caught.
- `scripts/source-ingest.mjs`: fetches article URLs, PDFs and arXiv abstract pages (pass `https://arxiv.org/pdf/<id>` for the full text) into `sources/<slug>.txt` and indexes each in `SOURCES.md` with candidate sentences holding numbers or quotes. No AI summary. A missing `pdftotext` exits 2 after indexing the sources already fetched.
- `make-demo.mjs --animatic`: full draft render scaled to 540 px on the short side, kept as `demo/animatic.mp4`, frames cut from it, `contact-sheet.jpg`, `animatic:` in DEMO.md.

### New gates
- `check-preflight.mjs` creative gate when BRIEF has `direction:` or `brief_version: 2`: `## Ý đồ sáng tạo`, a Blueprint/Rule column with real tokens (at least 2 distinct), a seam into every next beat (fade/crossfade/cut banned, soft seams only for `allow_soft` directions), music-only beats of at least `music_only_s`. `brief_version: 2` without `direction:` fails. The final stage adds an animatic newer than PLAN.md, `index.html` and `compositions/*.html` (a build edited after the approved animatic blocks), whose motion passes MOTION, and `build/RECIPES.md` newer than PLAN.md.
- `check-viet-pro.mjs`: voice words above BRIEF `word_budget` fail the gate (`VOICE_OVER_BUDGET`). When the field is missing but `direction:` is set, the budget comes from the direction's energy and the BRIEF duration.
- `qc-mp4.mjs` MOTION: share of near-still frames (YDIF < 0.5 at 360 px, 30 fps) and 90th-percentile YDIF. Creative projects FAIL at 60 % still or more with a peak under 1.5, with separate thresholds for energy `em`. Calibration: the real slideshow render 70 % / 1.12 (FAIL), the creative 10 s reference 25 % / 7.0 (PASS).
- `video-lint.mjs`: `SLIDESHOW_MOTION` early WARN. It stays a WARN on purpose: the real slideshow fixture uses `scale()`, `rotate()` and a background canvas, so static code analysis cannot tell it apart; the blocking check is MOTION on the render.
- `setup-check.mjs` runs `directions.mjs check` when `hyperframes-animation` is installed.
- `find-cases.mjs` exits 2 on a bare word; search with `--keyword`, `--category` or `--tag`.
- Tests: `creative.test.mjs` with fixtures `slideshow/` (the real Gemini 4 Argon TikTok project, must be blocked) and `creative-good/` (must pass); `brand.test.mjs`, `poi-fetch.test.mjs` and `source-ingest.test.mjs` run offline on fixtures.

### Compatibility
- Legacy projects (no `direction:` and no `brief_version: 2`) get one WARN, `creative gate skipped`, and keep the old gates. For them MOTION is a WARN, and a composition edited after the demo stays a WARN.
- `creative_override: <reason ≥10 chars>` in BRIEF skips the creative gate for footage-only projects and is printed as a WARN. `make-pitch choose` clears it. Existing test fixtures set it, since they predate the creative gate.
- The seam check no longer flags ordinary prose that contains "hiện".
- On Windows, `make-pitch` and `render-final` quote the `npx` arguments.

- `eleven.mjs` `tts`/`audio-meta` now take the voice and TTS model from `BRIEF.md` (`voice_id`, `tts_model`) before `OPUS_VIDEO_VOICE_ID`/`OPUS_VIDEO_TTS_MODEL`; `--voice`/`--model` still win. A BRIEF value equal to the default is the template's and does not hide the env. The chosen source is printed.

## 2026-10-13: post-render tools

### Added
- `scripts/qc-mp4.mjs` checks a rendered MP4 before delivery: aspect and duration against `BRIEF.md`, black edges, freezes, silences, loudness, true peak and bitrate. One `LEVEL CODE detail` line per check; `--write-qa` appends the result to `QA.md`, `--json` prints an array. Exit 1 on any FAIL, 2 on bad usage. Tests: `qc-mp4.test.mjs`.
- `scripts/export.mjs` writes per-platform delivery copies (`zalo`, `youtube`, `tiktok`, `facebook`) next to a final MP4, loudness-normalized to -14 LUFS, plus a thumbnail from an approved demo frame. It re-runs the final preflight (exit 5), never overwrites, and deletes an output that fails its post-export check. The `zalo` and `facebook` settings are assumptions, not checked against platform docs. Tests: `export.test.mjs`.
- `scripts/audio-mix.mjs` rebuilds a composition's sound as one 48 kHz stereo WAV with ffmpeg from the static audio attributes in its HTML. `--dry-run` prints the ffmpeg command.
- `render-final.mjs --audio-only <old.mp4> -- --output <new.mp4>` swaps in a new mix (music, SFX, volumes) while copying the old video stream, about 1 s instead of a full render (about 108–111 s for a 60 s 9:16 video). It needs the old file's sidecar, the same composition and the same picture, and no dynamic sound; otherwise it exits 6.
- Every single-MP4 `render-final` writes `<output>.render.json` (`composition`, `visual_hash`, `audio_hash`, `mode`, `mixer`, `source`, `source_sha256`, `created`).
- `docs/huong-dan-chuyen-sau.md`, an in-depth feature guide in Vietnamese, and the prompt library in `docs/thu-vien-prompt/`.

### Changed
- `render-final.mjs` always replaces the HyperFrames sound with the `audio-mix` mix, unless the composition has dynamic sound (`data-audio-group`, `data-automation`, `data-fx-chain`, `data-fx-carve`, a volume tween or script, or sound inside a sub-scene), which keeps the HyperFrames mix. Measured loudness difference between the two mixers: 0.1 LU.
- `render-final.mjs` checks that ffmpeg and ffprobe run before the render (exit 2 when missing), and exits 2 when a render without `--output` leaves several new MP4s in `renders/`.
- `references/qa-checklist.md` and `references/audio-pipeline.md` measure loudness, black edges and the other technical checks with `qc-mp4.mjs` instead of hand-typed ffmpeg commands. `audio-pipeline.md` gains "Đổi tiếng không render lại".
- SKILL.md: step 7 covers the audio-mix remux and `--audio-only`, step 8 starts with `qc-mp4.mjs`, and delivery adds `export.mjs`. The Tham chiếu table lists `qc-mp4.mjs`, `export.mjs` and `audio-mix.mjs`.

## 2026-10-12: portable install for every agent and OS; plan and demo gates before the final render

### Added
- `install.sh` (macOS, Linux, WSL, Git Bash) and `install.ps1` (Windows PowerShell) install opus-video for Claude Code, Codex, Antigravity app and CLI, or the current workspace. They also install viet-pro v5.3.0 and every HyperFrames skill (`npx hyperframes skills`), create the key file template with owner-only permissions, and finish with `setup-check`. An existing copy is moved to `~/.opus-video-backups/`, and a git checkout is never overwritten.
- `scripts/setup-check.mjs` (SKILL.md step 0) checks Node ≥ 22, git, ffmpeg/ffprobe, hyperframes CLI ≥ 0.8.144, viet-pro (with its self-tests), the 20 HyperFrames core and workflow skills, and the ElevenLabs keys (presence only). Each MISSING item prints the fix command for the current OS. Exit 0 means READY, 1 means something is missing. agy, `TYPESAFE_API_KEY` and a Remotion skill are WARN only.
- `scripts/skill-paths.mjs` finds a skill in every agent's skills dir (`~/.claude`, `~/.agents`, `~/.codex`, `~/.gemini/config`, `~/.gemini/antigravity-cli`, workspace `.claude`/`.agents`, and sibling dirs). `check-viet-pro` and `voice-gate` use it instead of a hardcoded `~/.claude/skills` path.
- Plan gate (SKILL.md step 4b): `PLAN.md` with Mục tiêu, a Cảnh table, Âm thanh, Engine, Khung hình demo (at least one timestamp per scene; a 9:16 list too when `aspect: both`) and QA. `scripts/check-preflight.mjs --stage plan` must PASS before voice and build. The template is in `references/plan-demo.md`.
- Demo gate (step 6b): `scripts/make-demo.mjs` captures the planned frames into `demo/` (and `demo/9x16/`), using `hyperframes snapshot`, or a draft render plus ffmpeg for a composition, and resets `DEMO.md` to `approval: pending`. `check-preflight --stage final` requires real PNGs newer than PLAN.md and a recorded approval. A composition edited after the demo is a WARN.
- `scripts/render-final.mjs` is the only path to the delivery render. It runs the final preflight, exits 5 when blocked, refuses `--quality`, and forwards the remaining args to `hyperframes render --quality delivery`.
- `scripts/replace-in-file.mjs` is a portable replacement for the macOS-only `sed -i ''` recipes (9:16 caption band, Be Vietnam Pro font swap).
- Tests: `preflight.test.mjs`, `setup-check.test.mjs`; every new script is covered by the `--help` test.

### Changed
- SKILL.md defines `$OV` as the folder holding SKILL.md on any agent. The references use `$OV` instead of `~/.claude/skills/opus-video`, and the font paths cover macOS, Linux and Windows.
- README rewritten: install per agent and per OS, manual install, keys, setup-check, invocation per agent, the gated workflow, update/uninstall and troubleshooting. The Node requirement is now 22.

## 2026-10-12: eleven.mjs enforces the viet-pro gate

### Changed
- `eleven.mjs tts` and `audio-meta` now run the viet-pro gate themselves (`scripts/voice-gate.mjs`) before any API call, and exit **4** when it blocks. The gate language comes from `BRIEF.md` `language:`, not from `--lang`.
- The voiced text must be the gated text. `tts` accepts only `--text-file <project>/script/NN.txt` and refuses `--text`. In `audio-meta`, every `SCRIPT.md` frame must equal its `script/NN.txt`, ignoring whitespace; extra `script/*.txt` files are allowed.
- Override: `--skip-viet-pro-gate` works only with `viet_pro_override: <reason ≥10 chars>` in the `BRIEF.md` frontmatter. The reason is printed on every run, and `check-viet-pro --stage delivery` fails while the override is set.
- `check-viet-pro.mjs` now requires `script-table.v1.md` and re-runs viet-pro `compare-preserved-content.mjs` from v1 to final (MISMATCH blocks). It also lints the voiced lines of `SCRIPT.md` (`SCRIPT.md#voice`).
- `probe-models` always writes to `$TMPDIR/ov-probe/`; `--outdir` is rejected (exit 2) so it cannot produce ungated production voice.
- Every voice file generated through the gate gets `<mp3>.gate.json`, holding the sha256 of the normalized text and the override reason or null. `audio-meta --reuse` reuses only audio whose stamp matches and is not an override. `check-viet-pro --stage delivery` fails on any `assets/voice/*.mp3` that has no stamp, has an override stamp, or whose hash differs from the current `script/NN.txt`.
- Language detection accepts `vi`, `vie`, `vi-VN`, and "tiếng Việt" with or without diacritics or NFD encoding. It fails closed: when BRIEF.md says another language, the default `--lang vi` is refused, so pass the matching `--lang`. A non-vi project no longer needs viet-pro installed. `tts` uses `--project` or the cwd unless the text file sits in a `script/` folder.
- The gate reads the text once, before checking, and `tts` voices exactly those bytes. A lint crash counts as an ERROR. A missing compare script, or one that exits with any non-zero status, is an error. `--jev-audit --json` writes audit lines to stderr, and audit failures never change the exit code.
- `rerank-cases.mjs` uses `jev-client.post` (one retry policy: 429/5xx/network).

### Added
- `check-viet-pro.mjs --jev-audit` (`scripts/jev-audit.mjs`) sends one Jev request per `script/NN.txt`, with 8 noul questions: Humanizer 1–5, bait, invented first-hand experience and unsourced numbers. It prints WARN lines at p ≥ 0.7 and never changes the exit code. The eval set `data/jev-audit-eval.jsonl` (24 labelled lines) is scored by `scripts/jev-audit-eval.mjs` (per-pattern precision/recall and cost; exit 3 without a key). A pattern becomes a FAIL only by a human decision at precision ≥ 0.9. Tests: `jev-audit.test.mjs`.
- `eleven.mjs doctor` prints `jev key: present|absent`, `jev: reachable|unreachable|skipped` (`jev-client.ping`, one noul question, no retry) and `viet-pro: installed|missing`. None of these change the exit code, and no key value is printed. Tests: `jev-client.test.mjs`.
- `scripts/script-md.mjs`: shared `parseScript` and `norm`.
- `scripts/voice-gate.mjs` and `voice-gate.test.mjs`, including CLI tests that check exit 4 with no mp3 written. A shared `tests/fixtures/fake-vp.mjs`, and a `language: en` BRIEF for the audio-meta fixture.

## 2026-10-12: full viet-pro gate for every Vietnamese script and caption

### Changed
- SKILL.md step 2 is now a **hard gate**: every Vietnamese script (viral TikTok included) runs viet-pro at the "Chuẩn" level, not "Nhanh". The steps, in order:
  - (a) read `SKILL.md`, all of `references/review/` and `references/editorial/`, and `publishing/video-script.md`;
  - (b) draft and save `script-table.v1.md`;
  - (c) do a Humanizer/anti-AI pass that lists each pattern found and how it was fixed, then check facts with `compare-preserved-content.mjs`;
  - (d) run `lint-vietnamese-content.mjs` on `script-table.md` and on every `script/NN.txt`, and fix all ERRORs and every WARN that is a real style fault;
  - (e) write a `## viet_pro` record in `BRIEF.md`.
  Voice (`eleven.mjs tts` / `audio-meta`) and rendering may not start until `check-viet-pro.mjs` passes.
- Rules for viral TikTok/Reels/Shorts, consistent with viet-pro:
  - hook in the first 1–3 s with no formulaic bait;
  - one angle per video;
  - a human, spoken voice;
  - no invented first-hand experience;
  - at most one concrete CTA, with no engagement-bait clichés.
- Step 9 is now required at delivery. `CAPTIONS.md` holds two captions, **Facebook cá nhân** and **TikTok**. Both go through the same full viet-pro process (plus `publishing/facebook.md` and `publishing/repurpose-matrix.md`) and are linted separately. The 8-step flow is now 9 steps.
- `references/script-workflow.md` rewritten to match (record template, which lint WARNs may be kept, TikTok caption assumptions). The QA checklist now runs the gate instead of a bare lint.

### Added
- `scripts/check-viet-pro.mjs` (`--stage script|delivery`). It checks:
  - that the `## viet_pro` record exists with `mode`, `files_read`, `humanizer` and `lint` (plus `captions` at delivery);
  - that `files_read` names every review/editorial file of the installed viet-pro;
  - the viet-pro lint, re-run on each file and each caption section (any ERROR blocks).
  It warns, without failing, on bait phrases, first-hand claims and more than ~3 words/s. Projects whose `language` is not Vietnamese are skipped. Exit 0 pass, 1 blocked, 2 usage error.
- Tests: `check-viet-pro.test.mjs` (fake viet-pro install plus a real-install test that is skipped when viet-pro is absent); `cli-help` now covers the new script. Suite: 82 tests, 74 pass, 8 skipped, 0 fail.

## 2026-10-11 — Jev (TypeSafe) case ranking for step 3, plus fixes

### Added
- Optional TypeSafe **Jev** ranking for step 3 case search (`scripts/rerank-cases.mjs`, `scripts/rerank-composite.mjs`, `scripts/jev-client.mjs`). It runs when `TYPESAFE_API_KEY` is set in `~/.config/opus-video/.env` and falls back to `find-cases` without it.
  - Composite score: Jev rates kind of video, topic and visual style for each case. Code then adds prompt richness, the aspect-ratio rule (9:16 briefs promote vertical cases), a small "wants" term and a genre prior.
  - Labels for every case are stored once in `data/case-features.jsonl` by `scripts/case-features.mjs`.
  - `--pool all` scores every case with a prompt of at least 40 characters (738 of 813), plus any keyword/category hits. That is about 740 cases per run, roughly 768k input tokens, about 0.03 USD and about 1 s.
  - Step 3 in SKILL.md: write `BRIEF.case-query.json` (English, nothing invented, `"not stated"` for missing fields), run `rerank-cases.mjs --pool all --stats`, use `--weights '{"style":0.3}'` for style-led briefs, and record `case_search:` in `BRIEF.md`. Do not use `--pair` or `--shortlist`.
- `--help` / `-h` on every CLI script (`build-case-index`, `case-features`, `corpus-stats`, `cut`, `eleven`, `find-cases`, `judge`, `rerank-cases`, `video-lint`). It prints the script's header comment and exits 0 with no other side effects. Shared helper: `scripts/cli-help.mjs`.
- `weak style fit` note: shown when the best style fit among the displayed cases is below 2/4. It tells the agent to take the look from the brief and `references/pattern-library.md`, and names a better-styled case outside the top results if one exists. The note does not change the ranking.
- `--stats` JSON now has `case_search` (`jev` or `find-cases (<reason>)`) so it can be copied straight into `BRIEF.md`.

### Changed
- When a key is configured but Jev fails (HTTP 401, timeout, malformed answers), `rerank-cases` prints one stderr line, `rerank-cases: Jev unavailable (<reason>); showing find-cases order…`, even without `--stats`. Without a key it stays silent, as before. The key is never printed.
- Docs: the Jev scoring count now reads "~740 cases with a usable prompt (≥ 40 chars)" instead of "813".

### Fixed
- The main-module guard now resolves symlinks, so `judge.mjs`, `cut.mjs`, `rerank-cases.mjs` and `case-features.mjs` run when invoked through the `~/.claude/skills/opus-video` symlink (commit 0cd3870).

### Tests
- New: `cli-help.test.mjs`, rerank fallback warning and `case_search` label tests, weak-style-note tests. Suite: 70 tests, 62 pass, 8 skipped (they need the `agy`/Gemini judge or the ABM fixture), 0 fail.
