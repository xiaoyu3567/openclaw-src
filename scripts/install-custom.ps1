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

function Uninstall-ExistingOpenClaw {
  $cmd = Get-Command "openclaw" -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "No existing OpenClaw detected, skip uninstall."
    return
  }

  Write-Host "Existing OpenClaw detected, uninstalling first..."
  try {
    openclaw gateway stop | Out-Null
  } catch {
    # Ignore stop failures and continue uninstall.
  }

  try {
    npm uninstall -g openclaw | Out-Host
  } catch {
    Write-Warning "npm uninstall -g openclaw failed, continuing with verification."
  }

  $npmRoot = (npm root -g).Trim()
  if ($npmRoot) {
    $pkgDir = Join-Path $npmRoot "openclaw"
    if (Test-Path $pkgDir) {
      Remove-Item -Path $pkgDir -Recurse -Force
    }
  }

  $shimDir = Join-Path $env:APPDATA "npm"
  foreach ($shim in @("openclaw", "openclaw.cmd", "openclaw.ps1", "openclaw-gateway", "openclaw-gateway.cmd", "openclaw-gateway.ps1")) {
    $shimPath = Join-Path $shimDir $shim
    if (Test-Path $shimPath) {
      Remove-Item -Path $shimPath -Force
    }
  }

  if (Get-Command "openclaw" -ErrorAction SilentlyContinue) {
    throw "OpenClaw is still present after uninstall. Please remove it manually, then rerun the installer."
  }

  Write-Host "OpenClaw uninstall check passed."
}

Write-Host "[1/6] Checking base tools..."
Require-Command "git"
Require-Command "node"
Require-Command "npm"

if (-not (Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
  if (Get-Command "corepack" -ErrorAction SilentlyContinue) {
    Write-Host "pnpm not found, installing via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
  }
}
Require-Command "pnpm"

Write-Host "[2/6] Uninstalling existing OpenClaw (mandatory clean install)..."
Uninstall-ExistingOpenClaw

Write-Host "[3/6] Installing OpenClaw..."
npm install -g openclaw@latest --omit=optional
Require-Command "openclaw"

Write-Host "[4/6] Preparing repository..."
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

Write-Host "[5/6] Installing dependencies..."
Set-Location $repoDir
pnpm install

Write-Host "[6/6] Running deploy assistant..."
$action = "deploy-recommended"
if ($Scope -eq "full") {
  $action = "deploy-full"
}
node scripts/deploy-assistant.mjs --action $action --yes --branch $Branch

Write-Host ""
Write-Host "Done. openclaw-src deployment completed."
