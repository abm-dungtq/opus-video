# Changelog

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
