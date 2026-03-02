param(
  [ValidateSet("ui", "full")]
  [string]$Scope = "ui",
  [string]$Branch = "main",
  [switch]$Yes,
  [switch]$DryRun,
  [switch]$SkipPull,
  [int]$BackupRetain = 5,
  [int]$Port = 18789,
  [switch]$HealthOnly
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$BackupRoot = Join-Path $HOME ".openclaw/deploy-backups"
$BackupId = ""

function Write-Section([string]$Text) {
  Write-Host ""
  Write-Host "== $Text =="
}

function Invoke-Run([string]$File, [string[]]$Args) {
  if ($DryRun) {
    Write-Host "[dry-run] $File $($Args -join ' ')"
    return
  }
  & $File @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Args -join ' ')"
  }
}

function Invoke-Robocopy([string]$Source, [string]$Target) {
  if ($DryRun) {
    Write-Host "[dry-run] robocopy $Source $Target /MIR"
    return
  }
  & robocopy $Source $Target /MIR
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
  }
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Resolve-OpenClawRoot {
  $npmRoot = (npm root -g).Trim()
  if ($npmRoot) {
    $candidate = Join-Path $npmRoot "openclaw"
    if (Test-Path (Join-Path $candidate "dist")) {
      return $candidate
    }
  }
  throw "Unable to resolve global openclaw install root"
}

function Run-HealthOnly {
  Write-Section "Health check"
  foreach ($cmd in @("git", "node", "pnpm", "openclaw")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
      Write-Host "[OK] $cmd"
    } else {
      Write-Host "[FAIL] $cmd not found"
    }
  }

  try {
    Invoke-Run "openclaw" @("gateway", "status")
    Write-Host "[OK] gateway status"
  } catch {
    Write-Host "[WARN] gateway status check failed"
  }

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      Write-Host "[OK] http://127.0.0.1:$Port/ reachable"
    }
  } catch {
    Write-Host "[WARN] http://127.0.0.1:$Port/ not reachable"
  }
}

if ($HealthOnly) {
  Run-HealthOnly
  exit 0
}

Write-Section "Step 1/7 - Preflight"
Require-Command "git"
Require-Command "node"
Require-Command "pnpm"
Require-Command "openclaw"
Require-Command "robocopy"

$OpenClawRoot = Resolve-OpenClawRoot
$OpenClawDist = Join-Path $OpenClawRoot "dist"
$TargetUi = Join-Path $OpenClawDist "control-ui"

if (-not (Test-Path $OpenClawDist)) {
  throw "OpenClaw dist not found: $OpenClawDist"
}

if (-not $Yes) {
  $answer = Read-Host "Proceed with $Scope deploy on branch $Branch? [y/N]"
  if ($answer -notin @("y", "Y", "yes", "YES")) {
    Write-Host "Cancelled."
    exit 0
  }
}

Write-Section "Step 2/7 - Update source"
Set-Location $RepoRoot
if (-not $SkipPull) {
  Invoke-Run "git" @("fetch", "origin", $Branch)
  Invoke-Run "git" @("pull", "--rebase", "origin", $Branch)
} else {
  Write-Host "[SKIP] git pull"
}

Write-Section "Step 3/7 - Build"
if ($Scope -eq "ui") {
  Invoke-Run "pnpm" @("ui:build")
} else {
  Invoke-Run "pnpm" @("tsdown")
  Invoke-Run "pnpm" @("ui:build")
}

Write-Section "Step 4/7 - Backup"
if (-not (Test-Path $BackupRoot)) {
  New-Item -Path $BackupRoot -ItemType Directory | Out-Null
}
$BackupId = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$BackupDir = Join-Path $BackupRoot $BackupId
if (-not $DryRun) {
  New-Item -Path $BackupDir -ItemType Directory | Out-Null
  @(
    "scope=$Scope",
    "created_at=$(Get-Date -Format o)",
    "openclaw_root=$OpenClawRoot"
  ) | Set-Content -Path (Join-Path $BackupDir "meta.env") -Encoding UTF8
  if ($Scope -eq "ui") {
    Copy-Item -Path $TargetUi -Destination (Join-Path $BackupDir "control-ui") -Recurse -Force
  } else {
    Copy-Item -Path $OpenClawDist -Destination (Join-Path $BackupDir "dist") -Recurse -Force
  }
}
Write-Host "[OK] backup_id=$BackupId"

try {
  Write-Section "Step 5/7 - Deploy"
  if ($Scope -eq "ui") {
    $src = Join-Path $RepoRoot "dist/control-ui"
    if (-not (Test-Path $src)) {
      throw "Build output missing: $src"
    }
    Invoke-Robocopy $src $TargetUi
  } else {
    $src = Join-Path $RepoRoot "dist"
    Invoke-Robocopy $src $OpenClawDist
  }

  Write-Section "Step 6/7 - Restart gateway"
  Invoke-Run "openclaw" @("gateway", "restart")

  Write-Section "Step 7/7 - Verify"
  Invoke-Run "openclaw" @("gateway", "status")
  if (-not $DryRun) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Write-Host "[OK] http://127.0.0.1:$Port/ reachable"
      }
    } catch {
      Write-Warning "Gateway HTTP check failed on port $Port"
    }
  }
} catch {
  if ($BackupId -and -not $DryRun) {
    Write-Warning "Deploy failed. Attempting auto rollback with $BackupId"
    & (Join-Path $ScriptDir "rollback.ps1") -BackupId $BackupId -Port $Port
  }
  throw
}

if (-not $DryRun) {
  $backups = Get-ChildItem -Path $BackupRoot -Directory | Where-Object { $_.Name -like "backup-*" } | Sort-Object Name -Descending
  $backups | Select-Object -Skip $BackupRetain | ForEach-Object { Remove-Item -Path $_.FullName -Recurse -Force }
}

Write-Section "Done"
Write-Host "Deploy succeeded."
Write-Host "scope=$Scope"
Write-Host "backup_id=$BackupId"
Write-Host "rollback=scripts/rollback.ps1 -BackupId $BackupId"
