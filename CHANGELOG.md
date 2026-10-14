# Changelog

## 2026-10-14: creative direction, brand kit, real data

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
- `scripts/source-ingest.mjs`: fetches article URLs, PDFs and arXiv papers into `sources/<slug>.txt` and indexes each in `SOURCES.md` with candidate sentences holding numbers or quotes. No AI summary. A missing `pdftotext` exits 2 after indexing the sources already fetched.
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
