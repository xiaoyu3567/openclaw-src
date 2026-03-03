param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath

& node (Join-Path $ScriptDir "deploy-assistant.mjs") @Args
exit $LASTEXITCODE
