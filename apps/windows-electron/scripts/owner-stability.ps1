$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $env:USERPROFILE ".openclaw\runtime\owner-checks"
$reportPath = Join-Path $reportDir "$timestamp.json"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

function Run-Step([string]$name, [scriptblock]$action) {
  $start = Get-Date
  try {
    & $action
    return [pscustomobject]@{
      name = $name
      ok = $true
      detail = "ok"
      startedAt = $start.ToString("o")
      durationMs = [int]((Get-Date) - $start).TotalMilliseconds
    }
  } catch {
    return [pscustomobject]@{
      name = $name
      ok = $false
      detail = $_.Exception.Message
      startedAt = $start.ToString("o")
      durationMs = [int]((Get-Date) - $start).TotalMilliseconds
    }
  }
}

$results = @()

$results += Run-Step "cold-start-loop" {
  for ($i = 0; $i -lt 20; $i++) {
    corepack pnpm run windows:electron:smoke | Out-Host
  }
}

$results += Run-Step "hot-restart-loop" {
  for ($i = 0; $i -lt 10; $i++) {
    node "./scripts/run-node.mjs" daemon restart --json | Out-Host
    node "./scripts/run-node.mjs" daemon status --json --no-probe --deep | Out-Host
  }
}

$results += Run-Step "session-relaunch-simulation" {
  $electronExe = Join-Path $appRoot "node_modules/electron/dist/electron.exe"
  if (-not (Test-Path $electronExe)) {
    throw "Electron binary not found at $electronExe"
  }

  $ownerUserDataDir = Join-Path $env:TEMP "openclaw-owner-stability-profile"
  New-Item -ItemType Directory -Path $ownerUserDataDir -Force | Out-Null

  for ($i = 0; $i -lt 5; $i++) {
    corepack pnpm --dir apps/windows-electron build | Out-Host

    # Use an isolated profile for soak checks so single-instance lock conflicts with manual runs do not cause false failures.
    $proc = Start-Process -FilePath $electronExe -ArgumentList ".", "--user-data-dir=$ownerUserDataDir" -WorkingDirectory $appRoot -PassThru
    Start-Sleep -Seconds 4
    if ($proc.HasExited) {
      throw "Electron exited early with code $($proc.ExitCode)"
    }

    taskkill /PID $proc.Id /T /F | Out-Null
    Start-Sleep -Milliseconds 500
  }
}

$summary = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  passed = ($results | Where-Object { -not $_.ok }).Count -eq 0
  results = $results
}

$summary | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
Write-Host "Owner stability report: $reportPath"
if (-not $summary.passed) {
  throw "Owner stability checks failed"
}
