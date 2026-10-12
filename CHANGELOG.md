# Changelog

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
