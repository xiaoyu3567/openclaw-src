param(
  [ValidateSet("ui", "full")]
  [string]$Scope = "ui",
  [string]$Branch = "main",
  [string]$Repo = "https://github.com/xiaoyu3567/openclaw-src"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Write-Host "[1/5] Checking base tools..."
Require-Command "git"
Require-Command "node"

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
  if (Get-Command "corepack" -ErrorAction SilentlyContinue) {
    Write-Host "pnpm not found, installing via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
  }
}
Require-Command "pnpm"

Write-Host "[2/5] Ensuring OpenClaw is installed..."
if (-not (Get-Command "openclaw" -ErrorAction SilentlyContinue)) {
  npm install -g openclaw@latest --omit=optional
}
Require-Command "openclaw"

Write-Host "[3/5] Preparing repository..."
$workspace = Join-Path $HOME ".openclaw\workspace"
$repoDir = Join-Path $workspace "openclaw-src"
if (-not (Test-Path $workspace)) {
  New-Item -Path $workspace -ItemType Directory | Out-Null
}

if (Test-Path (Join-Path $repoDir ".git")) {
  Write-Host "Repo exists: $repoDir"
} else {
  git clone --branch $Branch --single-branch $Repo $repoDir
}

Write-Host "[4/5] Installing dependencies..."
Set-Location $repoDir
pnpm install

Write-Host "[5/5] Running deploy assistant..."
$action = "deploy-recommended"
if ($Scope -eq "full") {
  $action = "deploy-full"
}
node scripts/deploy-assistant.mjs --action $action --yes --branch $Branch

Write-Host ""
Write-Host "Done. openclaw-src deployment completed."
