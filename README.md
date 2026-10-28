# opus-video

**English** · [Tiếng Việt](README.vi.md)

**Your AI video studio, packaged as an agent skill.** Describe the video you want. opus-video plans it with you, writes the script, voices it, builds the motion graphics, checks every frame and renders delivery-ready MP4s in 16:9, 9:16 or 1:1. You approve the look before anything is built and the motion before anything is final.

[![Release](https://img.shields.io/badge/release-v2.7.1-orange.svg)](https://github.com/abm-dungtq/opus-video/releases/tag/v2.7.1)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933.svg)
![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Antigravity-6f42c1.svg)
![OS](https://img.shields.io/badge/OS-macOS%20%C2%B7%20Linux%20%C2%B7%20WSL%20%C2%B7%20Windows-555.svg)
![Tests](https://img.shields.io/badge/tests-671%20passing-brightgreen.svg)

[See it work](#see-it-work) · [Why opus-video](#why-opus-video) · [How it works](#how-it-works) · [Quick start](#quick-start) · [Motion Studio](#motion-studio-the-visual-editor) · [Reference](#reference) · [Work with us](#work-with-us)

---

## See it work

Every video below was made end to end by opus-video. Click a poster to play the MP4 from the [`demo-videos` release](https://github.com/abm-dungtq/opus-video/releases/tag/demo-videos).

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/gemini-argon-9x16.mp4"><img src="docs/demo/gemini-argon-9x16.jpg" height="300" alt="Gemini 4 Argon, 9:16"></a><br>
      <b>Product launch</b><br>9:16 · 15 s<br>
      <sub>Picked from three styleframes, motion approved in two animatic rounds.</sub>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-9x16.mp4"><img src="docs/demo/abm-intro-9x16.jpg" height="300" alt="ABM, 9:16"></a><br>
      <b>Company intro</b><br>9:16 · 30 s<br>
      <sub>Vertical edition built alongside the 16:9 cut from one project.</sub>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/bds-lo-72m2-9x16.mp4"><img src="docs/demo/bds-lo-72m2-9x16.jpg" height="300" alt="Land listing, 9:16"></a><br>
      <b>Real-estate listing</b><br>9:16 · 60 s · Zalo 720p<br>
      <sub>The seller's own phone clip in a picture-in-picture over a live map, captions locked to each word.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" colspan="2">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/viet-pro-intro-16x9.mp4"><img src="docs/demo/viet-pro-intro-16x9.jpg" width="420" alt="Viết Pro, 16:9"></a><br>
      <b>Explainer</b><br>16:9 · 60 s<br>
      <sub>An introduction to the <a href="https://github.com/abm-dungtq/viet-pro-codex">viet-pro</a> writing skill.</sub>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-16x9.mp4"><img src="docs/demo/abm-intro-16x9.jpg" width="300" alt="ABM, 16:9"></a><br>
      <b>Company intro</b><br>16:9 · 30 s
    </td>
  </tr>
</table>

## Why opus-video

AI coding agents can already write HTML animation. Left alone they make slideshows: a few title cards that slide in and fade out, a voice that drifts off the picture, captions that vanish before anyone can read them. opus-video turns the agent into a production crew that follows a real pipeline and cannot skip a step.

- **You choose the look with your eyes, not a prompt.** The agent renders three 3-second styleframes from your actual topic in contrasting directions. You pick one, and it becomes the opening shot. The script is written afterwards, inside that direction's word budget.
- **Nothing ships that you have not seen move.** A 540p animatic is rendered for your approval. Editing the build after approval blocks the final render until you approve again.
- **Every step is measured.** Sound effects are checked against the picture with the ITU-R BT.1359-1 sync windows. Captions are checked against the moment each word is spoken. Music is held 4 to 7 dB under the voice. A video that stands still like a slideshow fails a motion check and does not render.
- **Vietnamese copy written like a professional.** Every spoken line, on-screen word and caption passes the [viet-pro](https://github.com/abm-dungtq/viet-pro-codex) editorial gate. The voice generator refuses a script that has not passed.
- **Real data, not invented numbers.** Points of interest come from OpenStreetMap with walking times. Articles, PDFs and arXiv pages are stored word for word, so every figure on screen can be traced to a source.
- **One project, every format.** 16:9, 9:16 and 1:1 come from one composition, each laid out for its frame rather than cropped, with platform UI safe zones respected.

## What you get

| | |
|---|---|
| **Creative direction** | 8 director directions, 64 visual styles mixable per scene, two hand-painted canvas looks from [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (watercolor and 3D glass product), and an index of 1,003 reference videos made with Claude Opus 5.5 |
| **Script** | viet-pro full editorial pass, fact-checking against stored sources, word budget per direction, captions for Facebook and TikTok |
| **Sound** | ElevenLabs voice with word timestamps, sound effects and music. Music can be composed from a section plan and re-cut bar by bar to your timeline, verified within 2 ms. Forced alignment gives word timings to a real recorded voice |
| **Picture** | [HyperFrames](https://hyperframes.dev) motion graphics (HTML + GSAP), cuts snapped to the beat, sound effects attached to spoken words, Vietnamese karaoke captions and a voice-driven envelope. Remotion or Canvas when a project needs them |
| **Footage** | Cut real footage on safe silences (beta), keep the speaker's own clip as the spine of the video, captions from a Whisper transcript you approve |
| **Quality gates** | Plan gate, animatic approval, motion check, SFX and caption sync, mix balance, 9:16 safe zones, video lint, optional Gemini review, and a single render path that refuses to run when a gate is open |
| **Editing** | Every project can have a `project.json` timeline. Edits go through one command gateway, so each change is a version with undo and redo |
| **Agents** | 11 skills, a director and an executor agent, and an MCP server so any Claude Code session can read and edit a project |

## How it works

```
Brief ─▶ 3 styleframes ─▶ Script (viet-pro) ─▶ PLAN.md ─▶ Voice, music, SFX
  ─▶ Build ─▶ Animatic ─▶ your approval ─▶ Final render ─▶ QA ─▶ Captions & delivery
```

Each arrow is a gate. The plan gate blocks a project with no chosen direction. The voice generator exits with code 4 while the script gate is failing. `render-final.mjs` is the only way to a delivery file and exits with code 5 when the plan, the animatic or your approval is missing.

### Four ways to work

| Mode | When you say | Path |
|---|---|---|
| `dao-dien` (director, default) | "make a video", "explainer", "ad" | brief → styleframes → script → audio → build → deliver |
| `nhanh` (fast) | "quickly", "like this example" | brief → reference case → script → audio → build → deliver |
| `tu-nhac` (from music or footage) | "from this song", "on the beat", "from my clip" | brief → music or footage first → direction → script → build → deliver |
| `timeline` | "edit the video", "open studio", "change a shot" | timeline edit → re-voice changed lines → deliver |

Every mode keeps the viet-pro gate, the plan, the approved animatic and the single render path.

## Quick start

### 1. Install

macOS, Linux, WSL or Git Bash:

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
```

The installer sets up everything the skill needs for every agent it finds: opus-video, viet-pro v5.6.1, the HyperFrames CLI and skills, and a key file template. Older copies are moved to `~/.opus-video-backups/`, never deleted, and a git checkout is left untouched. It ends by running `setup-check` and printing `READY` or the exact command to fix each missing item.

You need Node.js 22 or later, git, and ffmpeg with ffprobe. `agy` (Google Antigravity) is optional and enables the Gemini video review.

### 2. Add your keys

Open `~/.config/opus-video/.env` (Windows: `%USERPROFILE%\.config\opus-video\.env`) and fill in:

```
ELEVENLABS_API_KEY=...
OPUS_VIDEO_VOICE_ID=...
# optional: TypeSafe Jev ranks reference cases and audits scripts
TYPESAFE_API_KEY=...
```

Keep the file readable only by you (`chmod 600`). Scripts read it and never print a key.

### 3. Check the machine

```bash
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

### 4. Make a video

Open a new agent session and ask:

| Agent | Say |
|---|---|
| Claude Code | `/opus-video make a 30-second intro for <product>, in 16:9 and 9:16` |
| OpenAI Codex | `$opus-video make a 30-second intro for <product>, in 16:9 and 9:16` |
| Google Antigravity | `/opus-video …` or "use the opus-video skill to …" |
| Any other agent | "Read `<opus-video>/skills/opus-video/SKILL.md` and follow it to …" |

Your project folder ends up holding the pitch sheet, `BRIEF.md`, the script table, `PLAN.md`, the animatic and its approval, the final MP4s, `QA.md` and `CAPTIONS.md`. opus-video never posts anything to social media for you.

## Motion Studio: the visual editor

[Motion Studio](https://github.com/abm-dungtq/motion-studio) is the companion web app that runs on your machine. Create projects, hand work to the AI director in a chat with approval cards, edit a CapCut-style timeline, and export MP4s or layered bundles for Final Cut Pro, Premiere and DaVinci Resolve. opus-video is its default provider.

```bash
node ~/.claude/skills/opus-video/scripts/studio.mjs start --background   # http://127.0.0.1:4317
```

The plugin publishes a versioned contract for Studio in `scripts/studio-api.mjs` (`STUDIO_API = 4`). Motion Studio 2.0 works with opus-video 2.3.0 up to, but not including, 3.0.

## What's new in v2.7

- **Music arranged to the bar.** Compose from a section plan, re-cut the bars of a raw track onto the target grid, and verify each section against its source.
- **Cuts on the beat, sound effects on the word.** `beat-fit.mjs` moves each cut to the nearest beat without clipping speech, and `cues.mjs` pins a sound effect to a spoken word.
- **Vietnamese karaoke captions** and a voice-driven envelope in the picture, plus a mascot and HUD counter part.
- **Director and executor agents** with a taste review before shipping, and a cheaper one-session mode.
- **v2.7.1** fixes music plans to use the `music_v1` model and keeps karaoke chunks from sticking on screen.

The full history is in [CHANGELOG.md](CHANGELOG.md).

## Reference

<details>
<summary><b>Install options</b></summary>

Install for selected agents only (flags can be combined):

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --codex --agy
```

| Flag | Agent | Install folder |
|---|---|---|
| `--claude` | Claude Code | `~/.claude/skills/opus-video` |
| `--codex` | OpenAI Codex | `~/.agents/skills/opus-video` |
| `--agy` | Google Antigravity app/IDE | `~/.gemini/config/skills/opus-video` |
| `--agy-cli` | Google Antigravity CLI | `~/.gemini/antigravity-cli/skills/opus-video` |
| `--workspace` / `-w` | current project only (every agent) | `./.claude/skills/` and `./.agents/skills/` |
| (none) | every agent with a config folder on the machine, else Claude Code | |

Other flags: `--ref <tag|branch>` (default `main`), `--with-remotion` (adds the Remotion skill, only for `engine: remotion`), `--skip-deps` (opus-video only). PowerShell takes `-Hosts claude,codex,agy,agy-cli`, `-Ref`, `-WithRemotion` and `-SkipDeps`; viet-pro is installed there with `git clone`.

Claude Code loads `~/.claude/skills/opus-video` in place as the plugin `opus-video@skills-dir`, so do not also run `claude plugin install` on that machine. Skills are called as `/opus-video:opus-video`, `/opus-video:ov-brief` and so on. If opus-video lives elsewhere, run `claude plugin marketplace add <path>` and `claude plugin install opus-video@opus-video-private`.

Manual install:

```bash
git clone https://github.com/abm-dungtq/opus-video ~/.claude/skills/opus-video
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/v5.6.1/install.sh | bash -s -- --claude
npx --yes hyperframes skills
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
```

For Codex and Antigravity after a manual clone, copy `skills/opus-video/SKILL.md` to `opus-video/SKILL.md` and link each `skills/ov-*` into the agent's skill folder; the installer does this for you. Update with the install command again, or `git -C <folder> pull` for a git checkout.

</details>

<details>
<summary><b>System tools</b></summary>

| Tool | macOS | Debian/Ubuntu | Windows |
|---|---|---|---|
| Node.js ≥ 22 | `brew install node@22` | `nvm install 22` | `winget install OpenJS.NodeJS.LTS` |
| git | `xcode-select --install` | `sudo apt install git` | `winget install Git.Git` |
| ffmpeg + ffprobe | `brew install ffmpeg` | `sudo apt install ffmpeg` | `winget install Gyan.FFmpeg` |
| agy (optional) | [antigravity.google](https://antigravity.google) | same | same |

`setup-check` looks for skills in every agent folder and requires Node ≥ 22, git, ffmpeg, ffprobe, the `hyperframes` CLI ≥ 0.8.192, viet-pro with its self-test, six HyperFrames skills, the bundled direction tokens, `ELEVENLABS_API_KEY` and `OPUS_VIDEO_VOICE_ID`. `agy`, `TYPESAFE_API_KEY` and Remotion are optional warnings. Add `--json` for machine-readable output.

</details>

<details>
<summary><b>The 11 skills</b></summary>

| Skill | Job |
|---|---|
| `opus-video` | Entry point: picks the mode, the four gates, project layout |
| `ov-setup` | Step 0: `setup-check`, `eleven.mjs doctor`, keys |
| `ov-brief` | Step 1: `BRIEF.md`, brand kit |
| `ov-direction` | Step 1b: three styleframes, direction and style |
| `ov-cases` | Reference cases (Jev or `find-cases`), fast mode from a template |
| `ov-script` | Step 2: full viet-pro gate, source checking |
| `ov-audio` | Step 5: voice, SFX, music, timing, mix |
| `ov-build` | Steps 3–7: storyboard, `PLAN.md`, build, animatic, draft render |
| `ov-footage` | Real footage, the speaker's clip as spine |
| `ov-deliver` | Steps 7–9: delivery render, QA, captions, export |
| `ov-studio` | `project.json`, gateway, importing old projects, MCP server, Motion Studio |

The agents `ov-director` (taste review, `Review <n>: revise|ship`) and `ov-executor` live in `agents/`.

</details>

<details>
<summary><b>Main commands</b></summary>

Every script answers `--help` and uses only Node built-ins.

| Area | Scripts |
|---|---|
| Setup | `setup-check.mjs`, `skill-paths.mjs` |
| Direction | `make-pitch.mjs` (init, render, choose), `directions.mjs`, `styles.mjs`, `lemo.mjs`, `lemo-pick.mjs`, `brand.mjs` |
| Script and sources | `check-viet-pro.mjs`, `voice-gate.mjs`, `source-ingest.mjs`, `poi-fetch.mjs`, `find-cases.mjs`, `rerank-cases.mjs`, `case-template.mjs` |
| Sound | `eleven.mjs` (doctor, tts, sfx, music, align, audio-meta), `beat-grid.mjs`, `arrange-music.mjs`, `verify-arrangement.mjs`, `audio-mix.mjs`, `mix-balance.mjs` |
| Build | `composition.mjs`, `timing.mjs`, `recipe-pack.mjs`, `beat-fit.mjs`, `cues.mjs`, `reframe.mjs` |
| Gates and QA | `check-preflight.mjs`, `make-demo.mjs`, `sfx-sync.mjs`, `word-sync.mjs`, `qc-mp4.mjs`, `video-lint.mjs`, `judge.mjs` |
| Delivery | `render-final.mjs`, `captions-from-transcript.mjs`, `export.mjs` |
| Timeline | `gateway.mjs` (patch, undo, redo, log, show, derive), `manifest-import.mjs`, `studio.mjs` |
| Footage | `cut.mjs` (probe, apply-edl) |

Deeper guides: [introduction](docs/gioi-thieu.md), [agent install guide](docs/cai-dat-agent.md), [feature guide](docs/huong-dan-chuyen-sau.md) and the [prompt library](docs/thu-vien-prompt/README.md), all in Vietnamese.

</details>

<details>
<summary><b>Tests and troubleshooting</b></summary>

```bash
node --test "$HOME/.claude/skills/opus-video/scripts/tests/*.test.mjs"
```

Keep the quotes so Node expands the glob. Tests that need a real project skip themselves; point them at yours with `OPUS_VIDEO_SMOKE_DIR` and `OPUS_VIDEO_ABM_DIR`.

| Symptom | Fix |
|---|---|
| `setup-check` reports a skill not installed | `npx hyperframes skills`, then open a new agent session |
| viet-pro self-test failed | Reinstall viet-pro |
| `eleven.mjs` exits 4 | The script gate is failing: run `check-viet-pro.mjs --project .` and fix the FAIL lines |
| `render-final.mjs` exits 5 | Plan, animatic or approval missing: run `check-preflight.mjs --project . --stage final` |
| Windows cannot find `ffmpeg` after install | Open a new terminal |

To uninstall, delete the `opus-video` folder from each agent's skill folder, and `~/.config/opus-video/` if you no longer need the keys.

</details>

## Work with us

opus-video is free and open source under the MIT license. If you want videos produced for your brand, a pipeline tuned to your team's style and channels, or help running it in production, [open an issue](https://github.com/abm-dungtq/opus-video/issues) or reach out through [@abm-dungtq](https://github.com/abm-dungtq) on GitHub.

## License

Code and documentation are MIT (see `LICENSE`). Third-party material is credited in `NOTICE` and `third_party/`:

- The case corpus in `data/` comes from two MIT-licensed repositories. Each prompt belongs to its original author and every row credits the author with a link. Source videos are not redistributed.
- Style profiles, the composition skeleton, motion principles, beat and reframe algorithms, music arrangement, beat-fit, cues, karaoke and the director/executor roles adapt the motion-video skill of AgentKit (MIT, © 2026 BestAgentKits).
- The two lemo styles adapt [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (MIT). `lemo.mjs` copies its engines and three.js (MIT) into your project with their licences; this repository does not redistribute them. `lemo-pick.mjs` ranks all 59 lemo-opuscar styles for a brief (with Jev when a key is set). Lemo-opuscar is by LemoLab; its demo films are CC BY 4.0.
- `third_party/hyperframes-skills/` is an unchanged copy of HyperFrames v0.8.184 skills (Apache-2.0).
- `scripts/cut.mjs` adapts ideas from [open-edit](https://github.com/veedstudio/open-edit) (Apache-2.0, © VEED LIMITED).
