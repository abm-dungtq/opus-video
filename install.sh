#!/usr/bin/env bash
# install.sh — install opus-video and everything it depends on, for every agent host found.
# macOS, Linux, WSL and Git Bash on Windows. (Native Windows PowerShell: install.ps1.)
#
#   curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash
#   curl -fsSL …/install.sh | bash -s -- --codex          # one host only
#   ./install.sh --claude                                 # from a clone
#
# Steps: check git/node/ffmpeg → copy opus-video into each host's skills dir (old copy moved to
# ~/.opus-video-backups/) → install viet-pro (its own installer, same hosts) → install every
# HyperFrames skill (`npx hyperframes skills`, all supported agents) → create the key file
# template → run scripts/setup-check.mjs. Nothing is deleted; a git checkout is never overwritten.
set -euo pipefail

REPO="https://github.com/abm-dungtq/opus-video.git"
REF="main"
VP_REF="v5.3.0"
WANT_CLAUDE=false WANT_CODEX=false WANT_AGY=false WANT_AGY_CLI=false EXPLICIT=false
WORKSPACE=false SKIP_DEPS=false WITH_REMOTION=false

usage() {
  cat <<'EOF'
Usage: install.sh [options]
  --claude         Claude Code      ~/.claude/skills/opus-video
  --codex          OpenAI Codex     ~/.agents/skills/opus-video
  --agy            Antigravity app  ~/.gemini/config/skills/opus-video
  --agy-cli        Antigravity CLI  ~/.gemini/antigravity-cli/skills/opus-video
  --all            every host found on this machine (default)
  --workspace, -w  this project only: ./.claude/skills and ./.agents/skills
  --ref <ref>      opus-video branch or tag (default main)
  --with-remotion  also install the Remotion agent skills (only for engine: remotion)
  --skip-deps      install opus-video only (no viet-pro / HyperFrames)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --claude) WANT_CLAUDE=true; EXPLICIT=true ;;
    --codex) WANT_CODEX=true; EXPLICIT=true ;;
    --agy|--antigravity) WANT_AGY=true; EXPLICIT=true ;;
    --agy-cli) WANT_AGY_CLI=true; EXPLICIT=true ;;
    --all) EXPLICIT=false ;;
    --workspace|-w) WORKSPACE=true ;;
    --ref) REF="$2"; shift ;;
    --with-remotion) WITH_REMOTION=true ;;
    --skip-deps) SKIP_DEPS=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

os_fix() { # $1 = node|git|ffmpeg
  case "$(uname -s)" in
    Darwin) case "$1" in node) echo "brew install node@22";; git) echo "xcode-select --install";; ffmpeg) echo "brew install ffmpeg";; esac ;;
    Linux) case "$1" in node) echo "nvm install 22 (https://github.com/nvm-sh/nvm)";; *) echo "sudo apt install $1 (or dnf/pacman)";; esac ;;
    *) case "$1" in node) echo "winget install OpenJS.NodeJS.LTS";; git) echo "winget install Git.Git";; ffmpeg) echo "winget install Gyan.FFmpeg";; esac ;;
  esac
}

# 1. prerequisites
command -v git >/dev/null || fail "git not found — $(os_fix git)"
command -v node >/dev/null || fail "Node.js not found — $(os_fix node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) is too old (need ≥ 22) — $(os_fix node)"
command -v ffmpeg >/dev/null || echo "WARN: ffmpeg not found — $(os_fix ffmpeg) (setup-check will report it)"

# 2. source: this clone, or a fresh shallow clone of $REF
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/SKILL.md" ] && [ -f "$SCRIPT_DIR/scripts/eleven.mjs" ]; then
  SRC="$SCRIPT_DIR"
else
  say "downloading opus-video ($REF)"
  git clone --quiet --depth 1 --branch "$REF" "$REPO" "$TMP/opus-video"
  SRC="$TMP/opus-video"
fi

# 3. targets
TARGETS=()
if [ "$WORKSPACE" = true ]; then
  TARGETS+=("$PWD/.claude/skills" "$PWD/.agents/skills")
else
  if [ "$EXPLICIT" = false ]; then
    [ -d "$HOME/.claude" ] && WANT_CLAUDE=true
    { [ -d "$HOME/.agents" ] || [ -d "${CODEX_HOME:-$HOME/.codex}" ]; } && WANT_CODEX=true
    [ -d "$HOME/.gemini" ] && WANT_AGY=true
    [ -d "$HOME/.gemini/antigravity-cli" ] && WANT_AGY_CLI=true
    if [ "$WANT_CLAUDE$WANT_CODEX$WANT_AGY$WANT_AGY_CLI" = falsefalsefalsefalse ]; then WANT_CLAUDE=true; fi
  fi
  [ "$WANT_CLAUDE" = true ] && TARGETS+=("$HOME/.claude/skills")
  [ "$WANT_CODEX" = true ] && TARGETS+=("$HOME/.agents/skills")
  [ "$WANT_AGY" = true ] && TARGETS+=("$HOME/.gemini/config/skills")
  [ "$WANT_AGY_CLI" = true ] && TARGETS+=("$HOME/.gemini/antigravity-cli/skills")
fi

# 4. copy opus-video into each target
STAMP="$(date +%Y%m%d-%H%M%S)-$$"
PRIMARY=""
for dir in "${TARGETS[@]}"; do
  dest="$dir/opus-video"
  if [ -d "$dest/.git" ] && [ "$(cd "$dest" && pwd -P)" != "$(cd "$SRC" && pwd -P)" ]; then
    say "$dest is a git checkout — left as is (update it with: git -C \"$dest\" pull)"
  elif [ "$(cd "$dest" 2>/dev/null && pwd -P)" = "$(cd "$SRC" && pwd -P)" ]; then
    say "$dest is this checkout — nothing to copy"
  else
    mkdir -p "$dir"
    if [ -e "$dest" ]; then
      mkdir -p "$HOME/.opus-video-backups/$STAMP"
      mv "$dest" "$HOME/.opus-video-backups/$STAMP/$(echo "$dir" | tr '/' '_')"
      say "previous copy moved to ~/.opus-video-backups/$STAMP/"
    fi
    mkdir -p "$dest"
    (cd "$SRC" && tar --exclude .git -cf - .) | (cd "$dest" && tar -xf -)
    say "installed $dest"
  fi
  [ -z "$PRIMARY" ] && PRIMARY="$dest"
done

if [ "$SKIP_DEPS" = false ]; then
  # 5. viet-pro for the same hosts
  VP_ARGS=()
  if [ "$WORKSPACE" = true ]; then VP_ARGS+=(--workspace)
  elif [ "$EXPLICIT" = true ]; then
    [ "$WANT_CLAUDE" = true ] && VP_ARGS+=(--claude)
    [ "$WANT_CODEX" = true ] && VP_ARGS+=(--codex)
    [ "$WANT_AGY" = true ] && VP_ARGS+=(--agy)
    [ "$WANT_AGY_CLI" = true ] && VP_ARGS+=(--agy-cli)
  fi
  say "installing viet-pro $VP_REF"
  curl -fsSL "https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/$VP_REF/install.sh" | bash -s -- ${VP_ARGS[@]+"${VP_ARGS[@]}"}

  # 6. HyperFrames: CLI + every published skill (core, media-use, all workflows) for all agents
  say "installing HyperFrames skills (npx hyperframes skills)"
  npx --yes hyperframes skills || fail "npx hyperframes skills failed; fallback: npx --yes skills add heygen-com/hyperframes --all"

  if [ "$WITH_REMOTION" = true ]; then
    say "installing Remotion agent skills"
    npx --yes skills add remotion-dev/skills || echo "WARN: Remotion skills not installed (only needed for engine: remotion)"
  fi
fi

# 7. key file template (values are filled in by the user; never printed)
CONF="$HOME/.config/opus-video"
mkdir -p "$CONF"
if [ ! -f "$CONF/.env" ]; then
  printf '# opus-video keys (KEY=VALUE, no quotes needed)\nELEVENLABS_API_KEY=\nOPUS_VIDEO_VOICE_ID=\n# optional: TypeSafe Jev case ranking + script audit\nTYPESAFE_API_KEY=\n' > "$CONF/.env"
  chmod 600 "$CONF/.env"
  say "created $CONF/.env — fill in ELEVENLABS_API_KEY and OPUS_VIDEO_VOICE_ID"
fi

# 8. verify
[ -n "$PRIMARY" ] || fail "no install target"
say "setup check"
node "$PRIMARY/scripts/setup-check.mjs" || { echo; echo "Install the MISSING items above, then run: node \"$PRIMARY/scripts/setup-check.mjs\""; exit 1; }
say "done — open a new agent session so it loads the skills"
