# Studio player: how preview plays

Decision (2026-10-16): **option A with the HyperFrames runtime.** The player iframe loads
`/p/<name>/index.html`. Studio adds one tag before `</body>`, `<script src="/hf/runtime.js">`.
It serves that file from the installed HyperFrames package, `dist/hyperframe.runtime.iife.js`:
the project's own install first, then the global npm root. The runtime is the same one
`hyperframes preview` uses. It loads every `data-composition-src` sub-composition, sets
`window.__timelines`, and exposes `window.__player` with `play`, `pause`, `seek(t)`,
`getTime`, `getDuration` and `isPlaying`. It also drives each `<audio>`/`<video>`
`currentTime` from `data-start`. `player.js` therefore calls `__player` and does not set media
times itself. The project's files on disk are never changed.

Plain option A, without the runtime, is not enough. A real project's scenes are empty `<div
data-composition-src>` until the runtime loads them, so the picture would be blank. Option B
(iframe `hyperframes preview`) was not needed.

## Measured (Browser pane, `__player.pause(); __player.seek(t)`, read after 0.8 s)

| Project | t | `__timelines.main.time()` | voice | `voice.currentTime` | expected |
|---|---|---|---|---|---|
| copy of `scripts/tests/fixtures/manifest` (with a 3 s mp3 and a GSAP timeline added) | 5.0 | 5.000 | `vo-01` (start 2.5) | 2.500 | 2.500 |
| `claude-code-ceo-sme` (180.16 s, 15 sub-compositions) | 5.0 | 5.000 | `el-01-three-jobs-voice` (start 0) | 5.000 | 5.000 |
| `claude-code-ceo-sme` | 12.0 | 12.000 | `el-02-describe-voice` (start 10.76) | 1.240 | 1.240 |

Both pass: the timeline is within 0.05 s and the voice within 0.1 s.

While playing, the playhead must read `__player.getTime()`. `__timelines.main.time()` stays
at the seek point because the runtime keeps its own clock. In a hidden Browser pane,
`requestAnimationFrame` is throttled: `getTime()` advanced 0.035 s while the audio advanced
1.5 s. That comes from the hidden pane, not from the player, so playback sync has to be judged
in a visible window.
