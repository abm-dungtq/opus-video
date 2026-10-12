# install.ps1 — install opus-video and everything it depends on, on native Windows.
#   irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
#   .\install.ps1 -Hosts claude,codex
# Hosts: claude (~\.claude\skills), codex (~\.agents\skills), agy (~\.gemini\config\skills),
#        agy-cli (~\.gemini\antigravity-cli\skills). Default: every host found, else claude.
# Steps: check git/node/ffmpeg → copy opus-video (old copy moved to ~\.opus-video-backups) →
# viet-pro (git clone of viet-pro-codex at its release tag, skills\viet-pro copied the same way)
# → `npx hyperframes skills` (all HyperFrames skills, all supported agents) → key file template
# → scripts\setup-check.mjs. Nothing is deleted; a git checkout is never overwritten.
param(
  [string[]]$Hosts = @(),
  [string]$Ref = "main",
  [switch]$WithRemotion,
  [switch]$SkipDeps
)
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/abm-dungtq/opus-video.git"
$VpRepo = "https://github.com/abm-dungtq/viet-pro-codex.git"
$VpRef = "v5.3.0"
function Say($m) { Write-Host "==> $m" }
function Need($cmd, $fix) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd not found — $fix" } }

Need git "winget install Git.Git"
Need node "winget install OpenJS.NodeJS.LTS"
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { throw "Node.js $(node -v) is too old (need >= 22) — winget install OpenJS.NodeJS.LTS" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Warning "ffmpeg not found — winget install Gyan.FFmpeg (then reopen the terminal)" }

$H = $HOME
$map = [ordered]@{
  "claude"  = Join-Path $H ".claude\skills"
  "codex"   = Join-Path $H ".agents\skills"
  "agy"     = Join-Path $H ".gemini\config\skills"
  "agy-cli" = Join-Path $H ".gemini\antigravity-cli\skills"
}
if ($Hosts.Count -eq 0) {
  if (Test-Path (Join-Path $H ".claude")) { $Hosts += "claude" }
  if ((Test-Path (Join-Path $H ".agents")) -or (Test-Path (Join-Path $H ".codex"))) { $Hosts += "codex" }
  if (Test-Path (Join-Path $H ".gemini")) { $Hosts += "agy" }
  if (Test-Path (Join-Path $H ".gemini\antigravity-cli")) { $Hosts += "agy-cli" }
  if ($Hosts.Count -eq 0) { $Hosts = @("claude") }
}
$targets = $Hosts | ForEach-Object { if (-not $map.Contains($_)) { throw "unknown host $_ (claude, codex, agy, agy-cli)" }; $map[$_] }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("opus-video-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
function Install-SkillDir($src, $name) {
  foreach ($dir in $targets) {
    $dest = Join-Path $dir $name
    if (Test-Path (Join-Path $dest ".git")) { Say "$dest is a git checkout — left as is (git -C `"$dest`" pull)"; continue }
    New-Item -ItemType Directory -Force $dir | Out-Null
    if (Test-Path $dest) {
      $bk = Join-Path $H ".opus-video-backups\$stamp"
      New-Item -ItemType Directory -Force $bk | Out-Null
      Move-Item $dest (Join-Path $bk ($name + "_" + ($dir -replace '[\\:]', '_')))
      Say "previous $name moved to $bk"
    }
    Copy-Item $src $dest -Recurse -Exclude ".git"
    Remove-Item (Join-Path $dest ".git") -Recurse -Force -ErrorAction SilentlyContinue
    Say "installed $dest"
  }
}
try {
  Say "downloading opus-video ($Ref)"
  git clone --quiet --depth 1 --branch $Ref $Repo (Join-Path $tmp "opus-video")
  Install-SkillDir (Join-Path $tmp "opus-video") "opus-video"

  if (-not $SkipDeps) {
    Say "installing viet-pro $VpRef"
    git clone --quiet --depth 1 --branch $VpRef $VpRepo (Join-Path $tmp "viet-pro-codex")
    Install-SkillDir (Join-Path $tmp "viet-pro-codex\skills\viet-pro") "viet-pro"

    Say "installing HyperFrames skills (npx hyperframes skills)"
    npx --yes hyperframes skills
    if ($LASTEXITCODE -ne 0) { throw "npx hyperframes skills failed; fallback: npx --yes skills add heygen-com/hyperframes --all" }
    if ($WithRemotion) {
      npx --yes skills add remotion-dev/skills
      if ($LASTEXITCODE -ne 0) { Write-Warning "Remotion skills not installed (only needed for engine: remotion)" }
    }
  }

  $conf = Join-Path $H ".config\opus-video"
  New-Item -ItemType Directory -Force $conf | Out-Null
  $envFile = Join-Path $conf ".env"
  if (-not (Test-Path $envFile)) {
    "# opus-video keys (KEY=VALUE)`nELEVENLABS_API_KEY=`nOPUS_VIDEO_VOICE_ID=`n# optional: TypeSafe Jev`nTYPESAFE_API_KEY=`n" | Set-Content -Encoding utf8 $envFile
    # keep the key file readable by the current user only
    icacls $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    Say "created $envFile — fill in ELEVENLABS_API_KEY and OPUS_VIDEO_VOICE_ID"
  }

  $primary = Join-Path $targets[0] "opus-video"
  Say "setup check"
  node (Join-Path $primary "scripts\setup-check.mjs")
  if ($LASTEXITCODE -ne 0) { Write-Host "Install the MISSING items above, then run: node `"$primary\scripts\setup-check.mjs`""; exit 1 }
  Say "done — open a new agent session so it loads the skills"
}
finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
