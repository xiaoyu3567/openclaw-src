param(
  [Parameter(Mandatory = $true)]
  [string]$BackupId,
  [int]$Port = 18789
)

$ErrorActionPreference = "Stop"
$BackupRoot = Join-Path $HOME ".openclaw/deploy-backups"
$BackupDir = Join-Path $BackupRoot $BackupId
$MetaFile = Join-Path $BackupDir "meta.env"

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

Require-Command "openclaw"
Require-Command "robocopy"

if (-not (Test-Path $BackupDir) -or -not (Test-Path $MetaFile)) {
  throw "Backup not found: $BackupDir"
}

$meta = @{}
Get-Content $MetaFile | ForEach-Object {
  if ($_ -match "=") {
    $parts = $_.Split("=", 2)
    if ($parts.Length -eq 2) {
      $meta[$parts[0]] = $parts[1]
    }
  }
}
$scope = if ($meta.ContainsKey("scope")) { $meta["scope"] } else { "ui" }

$openclawRoot = Resolve-OpenClawRoot
$openclawDist = Join-Path $openclawRoot "dist"
$targetUi = Join-Path $openclawDist "control-ui"

Write-Host "Restoring backup $BackupId (scope=$scope)..."
if ($scope -eq "ui") {
  $src = Join-Path $BackupDir "control-ui"
  if (-not (Test-Path $src)) {
    throw "Backup archive missing: $src"
  }
  & robocopy $src $targetUi /MIR
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
  }
} else {
  $src = Join-Path $BackupDir "dist"
  if (-not (Test-Path $src)) {
    throw "Backup archive missing: $src"
  }
  & robocopy $src $openclawDist /MIR
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE"
  }
}

& openclaw gateway restart
& openclaw gateway status

try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
  if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
    Write-Host "Rollback succeeded and gateway is reachable on port $Port."
  }
} catch {
  Write-Warning "Rollback completed but gateway HTTP check failed on port $Port."
}
