# Changelog

## Unreleased

### Fixed
- `eleven.mjs music --plan` sends `model_id: music_v1`, `respect_sections_durations: true` and `output_format=mp3_44100_128`. A `sections[]` composition plan is the music_v1 format; ElevenLabs rejects it with `music_v2`/`music_v2_5`, the model `--plan` sent before. `--prompt` keeps `music_v2_5`.
- Karaoke captions (`TIMING.captions`) follow the motion-video timing: on 0.12 s before the first word, held 0.5 s after its last word, and off 0.16 s before the next chunk's first word when that comes sooner. Before, a line's last chunk began to fade 0.12 s before the voice ended.
- Skeleton karaoke: a chunk shorter than 0.14 s (two voice tracks overlapping) stayed on to the end of the video when the renderer sought frame by frame, because its `set` to alpha 0 fell inside the running fade-in; a jump seek showed it off, so render and snapshot disagreed. The fade-in now lasts `min(0.14, end − start)` and a chunk shorter than one frame is skipped. Projects made from the old skeleton keep the old block. `scripts/tests/karaoke-skeleton-gsap.test.mjs` checks both seek modes on GSAP 3.14.2.

## v2.7.0 (2026-10-25): tích hợp năng lực ak:motion-video

Why: the motion-video skill of AgentKit does several things opus-video could not: music cut to the bar and checked against its source, cuts and SFX locked to the beat and to the spoken word, Vietnamese karaoke and a voice-driven envelope in the picture, forced alignment for a real voice, a quick vertical edition, a director/executor split with a taste review, and a cheaper one-session mode. This release brings them in as opus-video commands and gates, without Python and without new API calls by default. STUDIO_API stays 4. Not checked live: ElevenLabs composition plans and forced alignment, and Gemini TTS.

### Added
- `eleven.mjs music --plan plan.json`: sends an ElevenLabs `composition_plan` (global styles, `sections[]` with `section_name`, `duration_ms` 3000–120000, local styles, `lines`), checked before any request (exit 2). `--outro` writes `assets/bgm/outro.mp3` when `--out` is absent. `--plan` with `--prompt` is refused. `ELEVENLABS_API_BASE` overrides the API host for tests only.
- `beat-grid.mjs`: `beats` (time of every beat to the sample: the steepest 5 ms rise of a 12 ms running-max envelope of the full band, tracked from beat to beat) and `maxDriftMs` (the farthest measured beat from the grid `beat0 + n·beatLen`). `beat0` is now the median phase of `beats`, so `B()` lands on the hits instead of an 11.6 ms analysis frame; `bars[].start` follows it. `refineBeats` and `LOW_AF` are exported.
- `scripts/arrange-music.mjs --project <dir> [--plan] [--dry]`: copies whole bars of a raw bed (`assets/bgm/raw/`) to target beats per `assets/bgm/music-arrangement.json`, cutting the source at its measured `beats` and resampling a piece onto the even grid (`asetrate`) when it is off by more than 5 ms; 25 ms crossfades end on each downbeat. Writes WAV and `<output>.beats.json` (target grid, carried `kick` and `drops`, `arranged_from`).
- `scripts/verify-arrangement.mjs --project <dir> [--tolerance-ms 2] [--json]`: cross-correlates every segment of the output with the source (±50 ms, one-sample steps), FAIL over the tolerance, WARN under correlation 0.5, and reports the output's `maxDriftMs` against the target grid. Exit 1 on any FAIL.
- `COMMANDS.arrange` and `COMMANDS.verifyArrangement`. `STUDIO_API` stays 4.
- `scripts/beat-fit.mjs --project <dir> [--tight] [--apply] [--json]`: moves each cut to the first beat at least 0.12 s after the last word of the shot before it, on the same `beat0 + n·beatLen` grid as `B()`. Prints `shot | cũ start | mới start | beat | lý do`; Lines pinned with `at_beat` move before the cut after their shot is placed, so that cut follows the moved voice. `--apply` writes one gateway patch (actor `timing`, undoable), WARNs when the bed drifts more than half a frame off its grid or `--music` names another file than the bed, and prints the next steps (`cues.mjs place`, `recipe-pack.mjs`).
- `scripts/cues.mjs add|place|check`: SFX events anchored to a spoken word (`word`, optional `nth`, `shot`), a beat or an absolute time, with an optional `lead`. `place` re-seats anchored events after a timing change; `check` FAILs an anchor that no longer resolves, lands after the end of the video or names a sound whose onset cannot be measured, and WARNs an event that drifted from it; `place` skips such events, re-seats the rest and exits 1. `check-preflight --stage final` runs it for projects with anchors or beat pins.
- Gateway op `pin_beat` (`target` shot or line, `beat` integer or null). Manifest fields `shots[].cut_beat` (not on the first shot), `lines[].at_beat` and `events[].anchor`, each validated. `move_event` drops `anchor` unless `keep_anchor: true` (which may also replace it); `add_event` accepts `anchor`.
- `timing.mjs readBeats` returns `grid.maxDriftMs` when the beats file has it (it does not reach the TIMING block). `sfx-sync.mjs` exports `leadCache`.
- `COMMANDS.beatFit` and `COMMANDS.cues`.
- Karaoke captions: `<html data-karaoke>` makes `timing.mjs` and gateway `derive` write `TIMING.captions` (chunks of at most 9 words, 42 characters × 2 lines, each word on its `words.json` onset). The text shown is the checked text (`project.json` `line.text`, else the `script/NN.txt` named by the voice's `.gate.json`), with a WARN when it is missing or its word count differs. The skeleton's `#cap-layer` lights each word on time; the caption band sits left of the signature corner in 16:9, 64 px up in 1:1 and above `--safe-bottom` in 9:16. `cuesOf` takes `maxWords`.
- Voice envelope: `<html data-voice-env>` adds `TIMING.env`, the voice loudness per frame (0–1), from `scripts/voice-envelope.mjs` (ffmpeg, RMS over the 95th percentile, cached in `assets/gen/vo-envelope.json`). The skeleton has `envAt(t)` and `envKeys(sel, t0, t1, step, map)`.
- `composition.mjs add-part --project <dir> --part mascot|hud-counter`: inserts `templates/composition/parts/` markup and script at the skeleton's new PARTS markers; `mascot` talks on `TIMING.env`, blinks on a fixed clock and squashes on kick beats; `hud-counter` steps on spoken phrases. A hidden signature block (`#sig`) is in the skeleton.
- `references/karaoke-va-mascot.md`.
- `eleven.mjs align --audio <file> --text-file <project>/script/NN.txt [--out] [--force]`: ElevenLabs forced alignment (multipart `POST /v1/forced-alignment`) for a voice that is not TTS, written as `<audio>.words.json` in the TTS shape. Goes through the viet-pro gate like `tts` (exit 4) and writes the same `<audio>.gate.json` stamp; words come from the characters (split like TTS words) when they give one word per token of the text, else from the trimmed `words[]`, with a WARN when the count differs; an existing output needs `--force` (exit 2); 401/402/403 prints `ALIGN_UNAVAILABLE` and exits 3; `loss` above 1 prints a WARN. Refused to the Studio director of a series episode (exit 5) and listed in `ELEVEN_REFUSED`, so `VOICE_DENIED_TOOLS` gains `Bash(*eleven.mjs align*)`; `STUDIO_API` stays 4. `call()` takes a `form` (FormData).
- Agents `ov-director` (Opus; Read, Glob, Grep only: writes the per-scene direction and reviews contact sheets, `Review <n>: revise | ship`) and `ov-executor` (Sonnet: runs the pipeline from `build/DIRECTION.md`). `references/dao-dien-va-thi-cong.md`: roles, flow (at most 3 review rounds, the user still approves the animatic), degrade when the runtime cannot pick models, and `--poor` (one session, no subagents, one review round, no gate skipped). The Motion Studio director is unchanged.
- `check-preflight --stage final` WARNs `đạo diễn chưa kết luận ship (build/REVIEW-<n>.md)` when `build/DIRECTION.md` exists and the highest `build/REVIEW-<n>.md` does not open with `Review <n>: ship`. `reviewWarnings` is exported.
- `eleven.mjs tts` and `audio-meta` take `--provider elevenlabs|gemini` (default BRIEF `voice_provider`, else elevenlabs) and `--tempo 0.8–1.25`. Gemini: `scripts/gemini-tts.mjs` (`synthGemini`, `pcmToWav`; `GEMINI_API_KEY`; model `--model`, BRIEF `gemini_tts_model`, default `gemini-3.8-flash-tts`, not checked live; voice `--voice`, BRIEF `gemini_voice`, default Kore, recorded in the stamp), converted to mp3, words by ElevenLabs forced alignment (still needs `ELEVENLABS_API_KEY`). The gate runs first; `ELEVENLABS_API_KEY` and a voice name that looks like an ElevenLabs id are checked before the Gemini call, `--speed` is ignored with a WARN. The Gemini take is written to a temp file and replaces the mp3 only after alignment. `--tempo` applies ffmpeg `atempo` (in the same encode for Gemini, words aligned on the faster take; ElevenLabs word times divided by the tempo). BRIEF values left as `<placeholder>` count as unset. `audio_engine_meta.json` `tts_provider` follows the provider.
- Stamps record `provider` (when not elevenlabs), `model` and `voice` (gemini) and `tempo` (when not 1); `stampMatches(mp3, text, want)` compares only the keys given (an old stamp is elevenlabs at tempo 1), so `line-gate` keeps its result and `audio-meta --reuse` re-voices a line made another way.
- `setup-check`: an INFO line for `GEMINI_API_KEY` (present or not), never NOT READY.
- `references/motion-craft.md` §7: renderer limits, beat reactions (kick, drop, silent stop) and beat cuts; `brief-template.md` optional `voice_provider`, `gemini_tts_model`, `gemini_voice`, `karaoke`, `signature`.
- `reframe.mjs --quick --video <in.mp4> --ratio 9x16|1x1 [--out <file>]`: a stopgap edition from a rendered MP4 with ffmpeg, the video over a blurred, darkened copy of itself (9:16) or a centre crop (1:1), audio re-encoded to AAC 192k; a failed ffmpeg run leaves no output. Prints a WARN that it is not a delivery edition and `QUICK <out> <w>x<h>`; an existing output is refused (exit 2).

## v2.6.0 (2026-10-24): HyperFrames 0.8.192

Why: HyperFrames moved from 0.8.144 to 0.8.192, and 0.8.185 cut its skill pack from 21 to 7 skills. The recipes `directions.mjs`, `recipe-pack.mjs`, `make-pitch.mjs` and the PLAN gate read (blueprints, rules, transitions, `visual-styles.md`, `cut-catalog.md`) no longer install on a new machine, so a fresh install failed `setup-check` and could not pitch or plan. This release also takes in the source repos that moved since v2.5.0. It ships with the Unreleased work below (STUDIO_API stays 4).

### Changed
- HyperFrames pin 0.8.144 → 0.8.192: `MIN_HYPERFRAMES`, `reframe.mjs` next-step line, the composition skeleton header and the docs; the workspace template `package.json` pins `hyperframes@0.8.192`. `lint`, `check --json --caption-zone`, `snapshot -o`, `render --quality delivery`, `render --resolution square` and `preview --background/--status/--stop` were run against 0.8.192 and behave as the scripts expect.
- `third_party/hyperframes-skills/`: the files opus-video reads from `hyperframes-animation` (`blueprints/`, `rules/`, `transitions/`), `hyperframes-creative/references/visual-styles.md` and `faceless-explainer/references/cut-catalog.md`, copied unchanged from HyperFrames tag v0.8.184 (commit d15a274, Apache-2.0, LICENSE and SOURCE.md beside them). `directions.mjs upstream()` reads this copy first and falls back to an installed skill of the same name; frame presets come from `hyperframes/assets/frame-presets/` (older installs: `hyperframes-creative/frame-presets/`). `upstream()` gains a `presets` field and an optional vendor path argument; `VENDOR` is exported.
- `setup-check.mjs`: `CORE_SKILLS` is `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use`; `WORKFLOW_SKILLS` is `slideshow`, `remotion-to-hyperframes`. The creative-directions check always runs (it no longer waits for `hyperframes-animation`).
- `recipe-pack.mjs`, `make-pitch.mjs`: the missing-recipes message names `third_party/hyperframes-skills`; a preset points to `hyperframes/assets/frame-presets/`. `check-preflight.mjs` names the vendored folder in its unknown blueprint/rule error.
- viet-pro pin v5.3.0 → v5.6.1 (`install.sh`, `install.ps1`, `setup-check.mjs`, README, `docs/cai-dat-agent.md`, `data/SOURCES.md`). Its scripts keep their flags, exit codes and output; v5.5.0 added `check-platform.mjs`, which Motion Studio calls.
- lemo-opuscar pin b5e8ef9 → 413a6bd (`data/lemo/styles.json`, NOTICE). The seven engine files keep their paths; upstream only translated comments. three stays 0.170.0 (lemo still asks for `^0.170.0`), gsap stays 3.14.2 (the version HyperFrames 0.8.192 pins).
- Docs: `engine-selection.md` maps each kind of video to `hyperframes/references/types/*.md` and keeps the old workflow names as labels; `ov-build` and `ov-audio` mark the frame-worker workflows (faceless-explainer, pr-to-video, product-launch-video) as available only where the old skills are still installed; `footage-lane.md` and `audio-pipeline.md` point to `hyperframes/references/motion.md`, `overlays.md` and `sound.md`. `revisions.md` and the guide drop "0.8.144 has no `--range`" (0.8.151 added `--range` to `snapshot` and `check`) and write snapshots with `-o snapshots/rev-<N>`, since 0.8.152 puts them under `.hyperframes/artifacts/` otherwise.

### Fixed
- The sample `files_read` in `references/script-workflow.md` and `skills/ov-script/SKILL.md` lacked `review/translationese-vi.md`, which viet-pro requires since v5.4.0; a record copied from them failed `check-viet-pro.mjs` ("files_read does not list").

### Unchanged sources
- open-edit (1d3b75b), the two case corpora (yihui 92aee2f, chuspeeism 028bc52) and the AgentKit motion-video material (v1.3.0) have no new commits that touch opus-video.


### New
- `scripts/captions-from-words.mjs --project <dir> --out <file.srt> [--max-chars 42] [--max-lines 2]`: an SRT file for upload from the voice lines of `project.json` (imported in memory when the project has none) and the word timings of their takes (`audio_meta.json`, else `<file>.words.json`). Cues stay within one voice line, hold at most 2 lines of 42 characters, last 1–6 s and break at sentence ends (and at commas once half full); a line without words is spread over its duration with a WARN; `[bíp]` is dropped from the shown text. Never overwrites `--out` (exit 2).
- `COMMANDS` names the delivery steps: `export` (`export.mjs`), `vietPro` (`check-viet-pro.mjs`), `captions` (`captions-from-words.mjs`) and `platform`, viet-pro's `check-platform.mjs` found through `skill-paths.mjs` (`null` without viet-pro; `lint-vietnamese-content.mjs` sits beside it).
- `VOICE_DENIED_TOOLS` (`eleven.mjs tts` and `eleven.mjs audio-meta`): Studio adds it to the director's denied tools for an episode of a series, whose voices go only through the series tools behind a consent card. `eleven.mjs sfx` and `music` stay allowed; `ALLOWED_TOOLS` and `DENIED_TOOLS` are unchanged.
- The `project_patch` tool of `mcp/server.mjs` lists every gateway op from `OPS` (it lacked `set_line_speaker`, `set_line_audio` and `set_scenes`).
- `STUDIO_API` stays 4: every addition is a new key or export.
- `project.json` may group shots into scenes: `scenes: [{ id: "c<#>", label, shots: [shot id] }]` (optional; each shot in at most one scene, scenes and their shots in shot order; `validateScenes(scenes, shots)` in `manifest.mjs`), and `capabilities.picture_from_code` (optional bool) marks a picture built by code from TIMING. `manifest-import.mjs` sets `picture_from_code: true` when `index.html` calls `buildFilm(`, and takes `scenes` from `scenes/scenes.json` when it passes the rules (a WARN otherwise), else from `script/scenes.json` (line number → script scene: a shot joins the scene of its first numbered line, the shots before any form `c0` "Đầu phim"), else leaves it out.
- Gateway op `set_scenes { scenes }` (receipt "đổi nhóm cảnh"; `[]` removes the groups), in `OPS`. With `picture_from_code`, `resize_shot`, `add_shot` and `remove_shot` are INVALID with the reason "hình dựng bằng mã (buildFilm): mốc shot đi theo lời; sửa lời hoặc scenes/*.mjs, không kéo mép"; `move_line` still works. Otherwise `add_shot` puts the new shot in the scene of the shot before it and `remove_shot` takes it out of its scene (a scene left empty goes).
- `render-final.mjs` exports `pictureHash(project, composition)`: `visualHash` without the TIMING block and without sound files under `assets/` (any folder), plus every file under `scenes/`. `visualHash` is unchanged, so `--audio-only` still refuses a changed picture.
- `make-demo.mjs --animatic` (main animatic of `index.html`) writes `visual_hash:` (`pictureHash`) and `audio_hash:` (`audioHash`) to `DEMO.md`; re-runs keep them and `audio_review:` once. `make-demo.mjs --record-audio-review <who>` renders nothing and writes or replaces `audio_review: <who> <ISO> <audioHash>` above `## Frames`, leaving `approval:` as it is.
- `check-preflight.mjs --stage final` compares the main animatic by hash when `DEMO.md` has `visual_hash:`: a different `pictureHash` FAILs ("hình đã đổi sau animatic được duyệt"), a different `audioHash` only WARNs ("tiếng đã đổi sau animatic: nghe lại …") until `audio_review:` names the current hash. A new voice take therefore no longer blocks the final render, while an edit to `scenes/*.mjs` does. `PLAN.md` newer than the animatic still FAILs; projects without `visual_hash:` and the 9:16 animatic keep the date check. `--legacy-mtime` (on `check-preflight.mjs` and `render-final.mjs`) forces the date check with a WARN; **the flag goes after 2026-10-31**.
- `COMMANDS.mixBalance` names `mix-balance.mjs`. `STUDIO_API` stays 4: every addition is a new optional field, op or key.
- A voice line may name its speaker: `project.json` `lines[].speaker` (optional, a role id `^[a-z0-9][a-z0-9-]{0,40}$`), validated by `manifest.mjs` when present. `manifest-import.mjs` joins each line to its number NN (the digits ending the voice file name, so `assets/mix/voice-01.mp3` is line `01`): text from `script/<file name>.txt`, then `script/<NN>.txt`, then the words; `speaker` from key NN of `scenes/roles.json`; `gate` from the stamp `<file>.gate.json`, then `assets/voice/<NN>.mp3.gate.json`, `pass` when it hashes the text and is no override, `stale` when it does not, `unknown` without a stamp (it was always `unknown`). The lookup lives in the new `scripts/line-gate.mjs`.
- Gateway ops `set_line_speaker { id, speaker }` (gate becomes `stale`; key NN of `scenes/roles.json` follows when the file exists, so an import keeps it) and `set_line_audio { id, file, duration }` (a new take: the file must exist inside the project, the gate is read again from its stamp, `start` stays, a take running past its shot is only a `CẢNH BÁO`; derive points the voice tag's `src` at the new file). Both are in `OPS`; a view-only project refuses them like every op. `COMMANDS.timing` names `timing.mjs`. `STUDIO_API` stays 4.
- `manifest.mjs` (re-exported by `studio-api.mjs`): `SERIES_FILE` (`studio-series.json`), `validateSeries(obj)` and `seriesDirOf(projectDir)`. A series folder declares in `studio-series.json` (schema `opus-video/series@1`) its name, the folders Studio may read and write, the episode template tool, the delivery folder and the tools Studio may run, each with typed flags (`bool`, `int`, `number`, `id`, `word`, `text`, `range`, `slot`, `path:read`, `path:write`, `project`, `root`, `*` to repeat), `writes` and `timeout_s` (1–3600); `validateSeries` answers Vietnamese errors. `seriesDirOf` reads `series:` of the BRIEF.md frontmatter, else the line `- Thư mục series: <path>` under `## series_bible`, and answers the folder only when it holds `studio-series.json`. `STUDIO_API` stays 4.
- `scripts/normalize-bed.mjs --in <file> [--out <file>] [--lufs -12.5] [--tp -1.5] [--silence-db -50] [--keep-head 0.05]`: trims head and tail silence (silenceremove, keeps 0.05 s) and brings a music bed or SFX to -12.5 LUFS / -1.5 dBTP with a two-pass loudnorm, keeping the sample rate (MP3 192 kbit/s for `.mp3`). Prints one `NORMALIZE` line; exit 0 done, 1 ffmpeg failed or silent file, 2 bad usage. `eleven.mjs sfx` and `eleven.mjs music` now run it on every file they write; `--no-normalize` keeps the API bytes, and a failed normalize keeps the file, prints `WARN normalize: …` and still exits 0.
- `data/directions.json`: four `native` seams, `impact-frame`, `smear-cut`, `ink-wipe` and `speed-lines`. The plan gate accepts them in the "Nối sang beat sau" column, the recipe pack prints their `mo_ta` (which names the Motion Studio recipe), and `whip-pan + smear-cut` no longer trips the banned word `cut`.
- `scripts/suggest.mjs --project <dir> [--json]`: deterministic suggestion from BRIEF.md, the three directions `make-pitch init` would pick (one per tier) with their reasons and the `styles_goi_y` that fit the brief's energy; no network, no file written. `COMMANDS.suggest` declares it for Studio (`{ file, args: ["--project", "{project}", "--json"] }`).
- `make-pitch.mjs init --directions <A?,A?,…>`: builds the pitch from one to three directions the user chose, in that order (picks 1..n, each keeps its tier) instead of the three `directions.mjs pick` would choose; an unknown, repeated, banned or aspect-mismatched id exits 2. `COMMANDS.pitchInit` declares it for Studio with `{project}`, `{topic}`, `{aspect}`, `{category}`, `{energy}` and `{directions}`; empty `--category` and `--energy` keep the old defaults.
- Gateway op `set_workflow_mode` (`{ op, mode }`, mode `dao-dien`, `nhanh`, `tu-nhac` or `timeline`) writes the optional `project.json` field `workflow_mode`; `manifest.mjs` validates it when present. `gateway.mjs` exports `OPS`, the frozen list of every op `applyOps` accepts, and `studio-api.mjs` re-exports it so Studio checks an op before sending it. `STUDIO_API` stays 4: no existing export changes shape.

### Fixed (Studio, gates)
- `pictureHash` and `visualHash` (`render-final.mjs`) skip `assets/gen/` when walking `assets/`: drawing batches, raw and keyed drawings and rig previews are not on screen, so a thumbnail batch or a late redraw no longer FAILs `check-preflight --stage final` ("hình đã đổi sau animatic") or refuses `--audio-only`. A file there that the composition references directly is still hashed.
- The director Motion Studio runs (`MOTION_STUDIO_RUNNER`/`OPUS_STUDIO_RUNNER=cli`) is refused by the scripts themselves, since Claude Code matches Bash rules as text and `eleven.mjs "tts"` or `scripts/./eleven.mjs` passed them: in an episode of a series (the cwd or any project the command names), `eleven.mjs` runs only `sfx` and `music` and every other command exits 5 before reading the key; `make-demo.mjs --record-audio-review` exits 2 for any director (the user's "Nghe rồi, được" is recorded by Studio). New `scripts/director-guard.mjs`.
- `VOICE_DENIED_TOOLS` now lists `Bash(*eleven.mjs <cmd>*)` for every `eleven.mjs` command but `sfx` and `music` (adds `probe-models`, `doctor`, `voice-info`, `models`; the leading `*` covers `./` and `//` in the path), and `DENIED_TOOLS` adds `Bash(*--record-audio-review*)`. Same shape, `STUDIO_API` stays 4.

## v2.5.0 (2026-10-22): STUDIO_API 4

Why: Motion Studio now reaches the plugin through a provider adapter, and the adapter still named the plugin's script files and the `make-pitch choose` argv itself. The plugin now names them, and Studio's environment names lose the plugin prefix.

### New
- `scripts/studio-api.mjs`: `STUDIO_API = 4`. `SKILLS` is the frozen list of skills the director uses (`ov-studio`, `ov-build`, `ov-script`, `ov-audio`, `ov-deliver`). `COMMANDS` is a frozen object: `render`, `mix`, `pitch`, `import`, `demo`, `recipe`, `preflight`, `cases`, `styles` are absolute paths to the `.mjs` Studio runs as `node <path> …`, and `choose` is `{ file, args }` with `file` the path of `make-pitch.mjs` and `args` `["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"]` (Studio fills `{project}` and `{pick}`).
- `mcp/server.mjs` reads `MOTION_STUDIO_RUNNER` first and falls back to `OPUS_STUDIO_RUNNER`; a non-empty new name wins.

### Changed
- `scripts/studio.mjs` without Studio prints the clone command with a folder of your choice and the `export MOTION_STUDIO_HOME=…` line, and names a `MOTION_STUDIO_HOME` that has no `bin/motion-studio.mjs`. The search order is unchanged: `MOTION_STUDIO_HOME`, then `~/Projects/motion-studio`.

### Kept
- Every API 3 export keeps its name and shape. Motion Studio v1.1.0 checks `STUDIO_API >= 3`, so it runs on this release unchanged; Studio with the provider adapter accepts 3 and 4 and uses `COMMANDS` when present. `OPUS_STUDIO_RUNNER` still works; `OPUS_STUDIO_REQUEST` was never read by the MCP server.

## v2.4.0 (2026-10-20): lớp lemo-canvas

Why: some briefs need a look GSAP and the DOM cannot draw: brushwork that paints itself on paper, or a glass product with refraction and dispersion. [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (MIT) already has engines for these styles. They now paint into a canvas under the composition's DOM layer, while the GSAP timeline, the player, Motion Studio, `render-final.mjs`, the viet-pro gate and Vietnamese text stay as they are.

### New
- `scripts/lemo.mjs` (`fetch`, `list [--json]`, `add --project --style [--force]`, `remove`). `fetch` takes only the catalogued files from the pinned lemo-opuscar commit (`b5e8ef9`, about 0.5 MB) plus three.js 0.170.0 into `~/.cache/opus-video/lemo-opuscar` (`LEMO_OPUSCAR_HOME`). `add` copies the engine to `assets/lemo/` (three.js to `assets/three/`), writes the licences and `CREDITS`, makes `paper.jpg` for watercolor, fills the layer and the bridge, and creates `scene.js` or `scene3d.js` from a template only when the project has none. `remove` takes the layer out and keeps the scene. Exit 2 bad usage or unknown style, 3 `index.html` without the markers, 4 cache missing or `paper.py` failed, 5 layer already there (pass `--force`).
- Catalogue `data/lemo/styles.json` with two verified styles: `watercolor` (2D canvas) and `glass-product` (three.js).
- Scene contract: `window.lemoRender(t, win)` is a pure function of `t`, with `win = { <scene id>: [start, end] }` from `WINDOWS` and `TIMING`. Scenes time their beats as fractions of a shot, so `resize_shot` stretches the painting. The 3D module loads after the timeline script and paints from `__lemoT` and `__lemoWin`.
- `composition.mjs init` skeleton carries four empty markers: `<!-- LEMO-LAYER:BEGIN/END -->` in `#bg` and `/* LEMO:BEGIN/END */` after the `WINDOWS.forEach` block.
- Style profiles `lemo-watercolor` and `lemo-glass-product` (64 profiles with `variety-captions`). Profiles take an optional `engine` (`hyperframes` by default, or `lemo-canvas`) and `lemo: { style, kind }`; `styles.mjs validate` checks both, `index` has an `engine` column, `show` prints the `lemo.mjs add` command, and `resolve` warns when the BRIEF's lemo profile has no layer in `index.html`.
- `make-pitch.mjs init --lemo <slug>` (or `lemo_style:` in BRIEF.md) gives the bold styleframe a lemo profile and the opus-video skeleton; with `lemo_style:` set, `choose` keeps that lemo profile whichever direction wins.
- `reframe.mjs` prints `WARN lemo` for a project with the layer: the scene is drawn for the landscape layout and needs its own vertical scene.
- `references/lemo-canvas.md`, section 1b of `engine-selection.md`, `lemo_style:` in the brief template, the `engine` field in `style-system.md`, and pointers in `ov-build` and `ov-direction`. `NOTICE` and `third_party/` carry the lemo-opuscar and three.js MIT licences.
- `judge.mjs score`: Gemini chấm 7 tiêu chí 1–10 (style_fidelity, concept_wow, motion_craft, design_typography, finish_texture, sound_sync, technical) theo mốc cố định, chạy 3 lượt độc lập, ghi trung vị, độ dao động và 5–10 fix có mốc giây. Chỉ quan sát, không chặn render. `--style <id>` đưa signature moves của profile cho giám khảo.
- `signature_moves` nhận object `{ name, technique, numbers, check }` bên cạnh chuỗi; `styles.mjs validate` kiểm dạng mới.
- Profile `variety-captions` (Hoa chữ show giải trí): phụ đề 9:16 viền dày nảy theo lời, từ nhấn kèm sticker, trong vùng an toàn TikTok.
- `check-preflight.mjs`: mục `## Nhịp` trong PLAN.md (Hook ≤ 0,5 s, cao trào bắt đầu trong 55–78 % thời lượng, giữ cuối 0,8–1,2 s), chỉ cảnh báo.

### Fixed
- Đạo diễn của Motion Studio không còn sửa được file ngoài dự án. `ALLOWED_TOOLS` trong `scripts/studio-api.mjs` bỏ hai luật `Edit` và `Write` không kèm đường dẫn: với chúng, `claude -p` sửa được mọi file không nhạy cảm trên đĩa (ví dụ `/tmp/…`). Chế độ `acceptEdits` vẫn cho sửa trong thư mục dự án (cwd). Kiểm bằng `claude -p` 2.1.304 với haiku: sửa trong dự án được, sửa `/tmp/<probe>` bị chặn.

### Measured
- 10 s, 300 frames, HyperFrames 0.8.144, MacBook GPU: watercolor renders in about 1.3 times the plain skeleton and two renders are byte-identical; glass-product takes about 5 times and two renders reach PSNR 56–59 dB (not byte-identical). With `--no-browser-gpu` a 3D render takes about 30 minutes.

## v2.3.0 (2026-10-17): timeline sửa nhanh

Why: Motion Studio's timeline could only resize shots and move lines; sound effects, music trims and fades, and redo still needed the director or a hand edit. The gateway now has the ops a CapCut-style timeline sends, one version per drop, and the render hears what the timeline shows.

### New
- Gateway ops `update_music` (several fields of a bed at once: `start`, `end` or `null` to the end, `media_start`, `gain`, `fade_in`, `fade_out`), `move_event`, `add_event` and `remove_event`. `add_event` creates a studio event (`studio: true`, default id the lowest free `sfx-<n>` that is not already an `<audio>` id, volume 0.8); derive inserts its `<audio … data-studio-sfx>` tag after the last live `<audio>` with `data-track-index` ≥ 30 and removes the tag when the event goes. Tags without `data-studio-sfx` are never removed.
- `remove_event` accepts only studio events; an event the director placed is INVALID (Studio shows "Nhờ đạo diễn" for it). A studio event whose id is already on another `<audio>` tag is refused before any file is written (exit 5, HTTP 422 in Studio).
- `gateway.mjs redo` re-applies the change the newest undo reverted, as a new version (actor `redo`); any other change clears what can be redone. Exit 9 nothing to redo.
- `scripts/studio-api.mjs`: `STUDIO_API = 3`, exports `redo` and the pure `redoTarget(history)` (whether and what redo would re-apply). Motion Studio v1.1.0 requires `STUDIO_API >= 3`.
- Derive writes each music bed's `data-media-start`, `data-fade-in` and `data-fade-out` (removed when 0), and each event's `data-volume`. `audio-mix.mjs` applies `afade` in and out to a bed, so fades are heard in the exported video; the preview player does not fade.
- `manifest-import --force` keeps the studio events of the old manifest whose shot still exists (others are dropped with a WARN).
- MCP `project_patch` lists the new ops for the director.

### Fixed
- A music bed's `gain` is now written to `data-volume`. Before, changing `gain` (the Studio volume slider, `set_music`) did not change the render.

## v2.2.0 (2026-10-17): Motion Studio tách repo

Why: the plugin and the web app have different users and release pace; Studio now lives in [abm-dungtq/motion-studio](https://github.com/abm-dungtq/motion-studio) (v1.0.0, history kept) and reads the plugin only through `scripts/studio-api.mjs`.

### Breaking
- `studio/` and its tests left the plugin. `scripts/studio.mjs` is now a shim: it runs `bin/motion-studio.mjs` from `$MOTION_STUDIO_HOME` or `~/Projects/motion-studio` with the same arguments and exit code, and without Studio prints the `git clone` command and exits 2.

### Kept
- `scripts/studio-api.mjs` (`STUDIO_API = 2`) and its surface test stay in the plugin; Studio checks `STUDIO_API`, the manifest schema and plugin major 2 when it starts.

## v2.1.0 (2026-10-17): Motion Studio làm cửa chính

Why: Studio only opened projects that already existed, had no place to give the AI a task, and the director could not ask the user anything, so a new video still started in the terminal and both human gates (direction, animatic) were written by hand.

### New
- Studio "Dự án mới": name, aspect (16:9, 9:16, both), mode (`tu-dau`, `video-co-san`, `theo-nhac`, `mau-nhanh`), duration, topic, audience and a first task. `POST /api/projects/new` runs `new-project.sh`, writes `mode/topic/audience/duration_s` into BRIEF.md (never `direction:`), creates an editable `project.json`, opens the project and queues the first task.
- Studio media: browse folders under home and `/Volumes` and register video, audio and image files (`GET /api/media/browse`, `POST /api/media/register`, `GET /api/media`). A file already under `footage/`, `shared-assets/` or the project's `assets/` is used in place; any other is copied to `footage/raw/` (a taken name gets `-2`, never overwritten). Paths are checked by realpath; ffprobe metadata goes to `.opus/media.json` for the director.
- Multi-turn director: request status `waiting_user` and the seventh MCP tool `studio_ask` (`choice`, `approve`, `text`, with artifacts and an optional `gate`). The answer (`POST /api/director/answer`) queues a follow-up request (`follows`, same session, `--resume`). A request waiting more than 24 hours becomes `failed`.
- Human gates written by the Studio server only: a `direction` card answer runs `make-pitch.mjs choose --pick N`; an approved `animatic` card writes `approval: user@studio <ISO> duyệt animatic <file>` into DEMO.md. The director's `claude -p` denies `Edit(DEMO.md)`, `Edit(BRIEF.md)`, `make-pitch.mjs choose`, `replace-in-file.mjs`, `cp`, `mv` and Bash commands naming either file.
- Agent status: `GET /api/agent` (`claude` found, version, logged in, runner, last job, ffprobe, ffmpeg) and an agent chip in the Studio top bar.
- `scripts/studio-api.mjs`: the one file Studio imports from the plugin (manifest, gateway, requests, `OV`, `PLUGIN_VERSION`, `STUDIO_API = 2`, director tool lists).
- Studio UI: light high-contrast theme; the left panel is a six-item rail (Giao việc cho AI, Footage & chất liệu, Lời & giọng, Nhạc & âm thanh, Thư viện mẫu, Xuất bản) with a heading and one-line description per panel, badges for waiting cards and stale lines, `?tab=` and Alt+1…6; the AI tab is a chat with gate cards.
- SFX events in `project.json`: an optional `events` array of `{id, shot, offset, sound?, label}`, validated with Vietnamese errors (projects without it stay valid). `gateway.mjs` derive writes each event's `<audio id>` `data-start` as shot start + offset, so `resize_shot`, `add_shot` and undo move sound effects with their shot and `sfx-sync` stays PASS with no hand edit (in the v2.0.0 E2E the director copied two values from `sfx-sync --fix`). `remove_shot` drops the shot's events with a receipt warning; undo restores them and the `## Sự kiện` rows the change dropped (kept in the history line as `dropped_rows`). `move_line` leaves events alone and moves the `chữ:` rows inside the moved line. A remapped Thời điểm keeps its decimals (`3.0` stays `3.0`).
- `manifest-import.mjs` imports events from the PLAN.md `## Sự kiện` rows that name a sound file, matching `<audio>` tags by src (nearest `data-start`, each tag once); a row with no tag or a tag with no id is a WARN. The IMPORT line prints `events=N`.

### Fixed
- `manifest-import.mjs` names each PLAN.md shot from its `## Cảnh` Hình / hiệu ứng cell: the first quoted on-screen text, else the start of the cell, at most 40 characters. Imported shots had empty names, so the Studio timeline showed "1 -".
- `gateway.mjs` derive writes each music bed's `<audio id>` `data-start` and `data-duration` (end − start; a bed with no end runs to the root duration) from `project.json` `music`. In the v2.0.0 E2E the bgm kept `data-duration="10"` while `music.end` was 10.55. A bed with no live tag is a derive WARN.
- Studio director: `claude -p` no longer gets `--add-dir` for the plugin (Read and Skill reach the plugin files without it). Edit and Write under the plugin are denied by path, because the plain Edit/Write allow rules also reach files outside the project. `Bash(node <plugin>/scripts/*)` no longer runs a `..` path: `node <plugin>/scripts/../../…/x.mjs` ran any script before. All checked with `claude -p --model haiku`.
- Studio starts the director on every project with queued requests when it starts listening, so requests queued while it was down no longer wait for the next click.
- Studio jobs: a job still `cancelling` keeps its project and kind BUSY until it exits, so a new director run or export cannot start beside a child that is still stopping.

## v2.0.0 (2026-10-16): plugin with eleven skills, four operating modes, project.json manifest

Why: the 45 KB root `SKILL.md` loaded every rule of every step into each session, could not be routed by intent (a quick template video and a timeline edit read the same 253 lines), and the timeline had no single source of truth: seconds lived in PLAN.md, the TIMING block and the voice tags at once, with nothing to undo a change.

### Breaking
- The root `SKILL.md` is gone. The repo is the Claude Code plugin `opus-video` (`.claude-plugin/plugin.json`, private marketplace `opus-video-private` in `.claude-plugin/marketplace.json`) with eleven skills under `skills/`: `opus-video` (router), `ov-setup`, `ov-brief`, `ov-direction`, `ov-cases`, `ov-script`, `ov-audio`, `ov-build`, `ov-footage`, `ov-deliver`, `ov-studio`. Every rule of the old file moved into exactly one skill (text moved, not paraphrased); `scripts/tests/plugin-layout.test.mjs` checks names, descriptions, length (≤ 150 lines) and every `$OV/scripts|references` path.
- Under `~/.claude/skills/opus-video` Claude Code loads the checkout in place as `opus-video@skills-dir`; do not also install it from the marketplace on that machine. `install.sh` / `install.ps1` detect a local checkout by `skills/opus-video/SKILL.md`, and for Codex and Antigravity copy the router `SKILL.md` to the plugin root and link (Windows: copy) each `ov-*` skill beside it.

### New
- Four operating modes in the router: `dao-dien` (full director, default), `nhanh` (one case instead of three styleframes; BRIEF records `creative_override: nhanh theo case <id>`, the animatic gate stays), `tu-nhac` (music or footage first), `timeline` (edit an existing project through `ov-studio`).
- `scripts/manifest.mjs`: `project.json` schema `opus-video/project@1` (shots back to back from 0, voice lines, music beds, assets, version) and `validate` with Vietnamese errors.
- `scripts/gateway.mjs`: the one writer of `project.json`. `patch` (ops `resize_shot` with ripple, `move_line`, `set_shot`, `set_line_text` → gate `stale`, `set_music`, `add_shot`, `remove_shot`), `undo` (a new version restoring the previous snapshot, never past the latest import), `log`, `show`, `derive`. Each change is a version with a snapshot in `.opus/versions/` and a line in `.opus/history.jsonl`, serialized by `.opus/lock`. Derived files (TIMING block, voice `data-start`/`data-duration`, root `data-duration`, PLAN.md Thời điểm cells, `timing.json`) are written before `project.json`; tags inside HTML comments are skipped and a line without a live tag is a WARN. Exit 3 CONFLICT, 4 view only, 5 INVALID, 7 nothing to undo, 8 BUSY.
- `scripts/manifest-import.mjs`: `project.json` for a project made before the manifest (title from BRIEF `title:`/`topic:` or the first heading after the frontmatter; shots from PLAN.md, scene sub-compositions, audio_meta voices or the root; lines by midpoint; text from `script/NN.txt`, audio_meta or the `words.json` sidecar). It only adds `project.json` and `.opus/`; projects without TIMING markers are view only.
- `timing.mjs` on a project with `project.json` goes through `gateway.mjs derive`.
- `setup-check.mjs` prints `opus-video plugin: installed|missing` (a WARN, never MISSING).
- `mcp/server.mjs`: stdio MCP server `opus-video` (declared in `plugin.json` `mcpServers`). Tools `project_get`, `project_log`, `project_patch` (actor `director`, optional `receipt_note` kept in history), `project_undo`, `studio_request_next`, `studio_request_done`.
- Motion Studio: `scripts/studio.mjs start [--background] [--root <dir>] | status | stop` serves `studio/` on `127.0.0.1:4317` (one server per machine; another root or a held port is exit 3). Player (HyperFrames runtime injected into the project page, see `studio/PLAYER.md`), timeline with shot-edge and voice drags, inspector, versions and undo (Ctrl/Cmd+Z), seven panels, SSE refresh on `project.json` and request changes, "Nhập dự án" for projects without a manifest. Every edit goes through the gateway as actor `human`; 409 reloads. Host and Origin checks, a per-run token for POST, no dotfiles outside `.opus/`. The director buttons run the user's own Claude Code (below).
- Studio director (`studio/director.mjs`): "Nhờ đạo diễn" (project, shot, line) and "Dùng mẫu này" queue a request; runner `cli` (default, `director.runner` in `studio.json`) runs `claude -p … --output-format stream-json --permission-mode acceptEdits` in the project with an allow-list (no `Bash(node:*)`, no web tools), one request at a time per project, resuming the session kept in `.opus/director.json` (a failed resume retries once without it). Runner `mcp` leaves the request for `studio_request_next`. Requests can be cancelled from Studio, stuck `running` ones included. The MCP server closes requests as runner `cli` when started by such a director (`OPUS_STUDIO_RUNNER`).
- Studio jobs (`studio/jobs.mjs`): child processes in their own process group, last 500 log lines, live over SSE `job`, one per project and kind, SIGTERM then SIGKILL on cancel, all stopped with the server. "Xuất video" runs `render-final.mjs`, then `compress-final.sh` into `…-final.mp4`; exit 5 shows the FAIL lines as "Thiếu cổng: …".
- A shot change (resize, add, remove, and undo) also moves the `## Sự kiện` rows of PLAN.md: each row keeps its offset inside the shot that held it, so `word-sync` and `sfx-sync` see the new times. Rows of a removed shot are dropped and a row past its shot's new end is kept with a warning, both in the receipt. SFX `data-start` is not in the manifest; `sfx-sync --fix` moves it.
- The director re-runs `recipe-pack` and `make-demo --animatic` after any timing or motion change and says the animatic needs approval again; "Xuất video" stays at exit 5 until `approval:` is written back into DEMO.md.
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
