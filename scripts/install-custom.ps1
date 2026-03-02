param(
  [ValidateSet("ui", "full")]
  [string]$Scope = "full",
  [string]$Branch = "main",
  [string]$Repo = "https://github.com/xiaoyu3567/openclaw-src",
  [string]$BaseUrl = "",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"
$OpenClawVersion = "2026.2.25"
$OpenClawRegistry = "https://registry.npmmirror.com"
$DefaultBaseUrl = "https://jp.code.respyun.com/v1"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Read-RequiredValue([string]$Prompt) {
  while ($true) {
    $value = Read-Host $Prompt
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }
}

function Read-ValueWithDefault([string]$Prompt, [string]$DefaultValue) {
  $value = Read-Host $Prompt
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }
  return $value.Trim()
}

function Prompt-Sub2ApiCredentials {
  if ([string]::IsNullOrWhiteSpace($script:BaseUrl)) {
    $script:BaseUrl = Read-ValueWithDefault "请输入 sub2api baseUrl（回车使用默认 $DefaultBaseUrl）" $DefaultBaseUrl
  }
  if ([string]::IsNullOrWhiteSpace($script:ApiKey)) {
    $script:ApiKey = Read-RequiredValue "请输入 sub2api apiKey（可见输入）"
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
    # ignore
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

function Wait-GatewayStatusReady {
  param(
    [int]$Attempts = 40,
    [int]$DelaySec = 1
  )

  $lastOutput = ""
  for ($i = 1; $i -le $Attempts; $i++) {
    $lastOutput = (& openclaw gateway status 2>&1 | Out-String)
    if ($lastOutput -match "Service unit not found|Service not installed|Could not find service|RPC probe: failed") {
      Start-Sleep -Seconds $DelaySec
      continue
    }
    if (-not [string]::IsNullOrWhiteSpace($lastOutput)) {
      Write-Host $lastOutput
    }
    return
  }

  throw "Gateway status did not become ready in time. Last output: $lastOutput"
}

function Wait-GatewayHttpReady {
  param(
    [int]$Attempts = 40,
    [int]$DelaySec = 1
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:18789/" -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds $DelaySec
      continue
    }
    Start-Sleep -Seconds $DelaySec
  }

  throw "Gateway HTTP check failed on port 18789"
}

function Configure-OpenClawSettings {
  $normalizedBaseUrl = $BaseUrl.TrimEnd("/")
  $provider = @{
    baseUrl = $normalizedBaseUrl
    apiKey = $ApiKey
    api = "openai-responses"
    models = @(
      @{
        id = "gpt-5.3-codex"
        name = "gpt-5.3-codex"
        reasoning = $true
        input = @("text")
        cost = @{
          input = 0
          output = 0
          cacheRead = 0
          cacheWrite = 0
        }
        contextWindow = 200000
        maxTokens = 32768
      }
    )
  } | ConvertTo-Json -Compress -Depth 10

  openclaw config set models.mode merge
  openclaw config set models.providers.sub2api $provider --strict-json
  openclaw config set agents.defaults.model.primary sub2api/gpt-5.3-codex
  openclaw config set "agents.defaults.models[sub2api/gpt-5.3-codex]" "{}" --strict-json
}

function Configure-UsageProvider {
  $stateDir = if ($env:OPENCLAW_STATE_DIR) { $env:OPENCLAW_STATE_DIR } else { Join-Path $HOME ".openclaw" }
  $settingsDir = Join-Path $stateDir "settings"
  $filePath = Join-Path $settingsDir "usage-providers.json"

  if (-not (Test-Path $settingsDir)) {
    New-Item -Path $settingsDir -ItemType Directory | Out-Null
  }

  $snapshot = @{ items = @(); version = 0; updatedAtMs = 0 }
  if (Test-Path $filePath) {
    try {
      $loaded = Get-Content -Raw -Path $filePath | ConvertFrom-Json
      if ($loaded) {
        $snapshot = $loaded
      }
    } catch {
      $snapshot = @{ items = @(); version = 0; updatedAtMs = 0 }
    }
  }

  $items = @()
  if ($snapshot.items) {
    $items = @($snapshot.items)
  }

  $existing = $items | Where-Object { $_.id -eq "sub2api" -or $_.name -eq "sub2api" } | Select-Object -First 1
  $id = if ($existing -and $existing.id) { $existing.id } else { [guid]::NewGuid().ToString() }
  $next = [ordered]@{
    id = $id
    name = "sub2api"
    type = "sub2api"
    baseUrl = $BaseUrl.TrimEnd("/")
    apiKey = $ApiKey
    enabled = $true
    intervalSec = 60
    timeoutMs = 12000
  }

  $replaced = $false
  for ($i = 0; $i -lt $items.Count; $i++) {
    if ($items[$i].id -eq $id -or $items[$i].name -eq "sub2api") {
      $items[$i] = $next
      $replaced = $true
      break
    }
  }
  if (-not $replaced) {
    $items += $next
  }

  $version = 1
  if ($snapshot.version -as [int]) {
    $version = [int]$snapshot.version + 1
  }

  $output = [ordered]@{
    items = $items
    version = $version
    updatedAtMs = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  }

  $json = $output | ConvertTo-Json -Depth 10
  Set-Content -Path $filePath -Value $json -Encoding UTF8
}

Write-Host "[1/9] Checking base tools..."
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

Write-Host "[2/9] Collecting sub2api credentials..."
Prompt-Sub2ApiCredentials

Write-Host "[3/9] Uninstalling existing OpenClaw (mandatory clean install)..."
Uninstall-ExistingOpenClaw

Write-Host "[4/9] Installing OpenClaw $OpenClawVersion..."
npm install -g "openclaw@$OpenClawVersion" --omit=optional --registry="$OpenClawRegistry"
Require-Command "openclaw"

Write-Host "[5/9] Writing OpenClaw model/agent/usage config..."
Configure-OpenClawSettings
Configure-UsageProvider

Write-Host "[6/9] Preparing repository and dependencies..."
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

Set-Location $repoDir
pnpm install

Write-Host "[7/9] Running deploy assistant..."
$action = "deploy-recommended"
if ($Scope -eq "full") {
  $action = "deploy-full"
}
node scripts/deploy-assistant.mjs --action $action --yes --branch $Branch

Write-Host "[8/9] Ensuring gateway service is fully ready..."
Write-Host "[8/9.a] openclaw gateway install"
openclaw gateway install

Write-Host "[8/9.b] waiting gateway service registration"
Wait-GatewayStatusReady

Write-Host "[8/9.c] openclaw gateway start"
openclaw gateway start

Write-Host "[8/9.d] waiting gateway status after start"
Wait-GatewayStatusReady

Write-Host "[8/9.e] waiting gateway HTTP readiness"
Wait-GatewayHttpReady
Write-Host "Gateway HTTP check passed on port 18789."

Write-Host "[9/9] openclaw dashboard"
openclaw dashboard

Write-Host ""
Write-Host "Done. openclaw-src deployment completed."
