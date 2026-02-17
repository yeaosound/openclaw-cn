param(
  [switch]$SkipGitOps
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
Set-Location $repoRoot

$reportRoot = Join-Path $env:USERPROFILE ".openclaw/runtime/windows-electron/upstream-sync"
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
$startedAt = Get-Date
$script:steps = @()
$syncSucceeded = $false

function Assert-CommandSucceeded {
  param(
    [string]$Command
  )

  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $Command"
  }
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  $stepStarted = Get-Date
  try {
    & $Action
    $script:steps += [pscustomobject]@{
      name = $Name
      status = "ok"
      startedAt = $stepStarted.ToString("o")
      finishedAt = (Get-Date).ToString("o")
    }
  } catch {
    $script:steps += [pscustomobject]@{
      name = $Name
      status = "failed"
      startedAt = $stepStarted.ToString("o")
      finishedAt = (Get-Date).ToString("o")
      error = $_.Exception.Message
    }
    throw
  }
}

try {
  if ($SkipGitOps) {
    $script:steps += [pscustomobject]@{
      name = "git-ops"
      status = "skipped"
      reason = "SkipGitOps switch enabled"
      startedAt = (Get-Date).ToString("o")
      finishedAt = (Get-Date).ToString("o")
    }
  } else {
    Invoke-Step "fetch-origin" {
      Write-Host "[1/6] Fetch origin"
      git fetch origin --prune
      Assert-CommandSucceeded "git fetch origin --prune"
    }

    Invoke-Step "fetch-upstream" {
      Write-Host "[2/6] Fetch upstream"
      git fetch upstream --prune
      Assert-CommandSucceeded "git fetch upstream --prune"
    }

    Invoke-Step "rebase-upstream-main" {
      Write-Host "[3/6] Rebase current branch onto upstream/main"
      git rebase upstream/main
      Assert-CommandSucceeded "git rebase upstream/main"
    }
  }

  Invoke-Step "install-deps" {
    Write-Host "[4/6] Install deps"
    corepack pnpm install --frozen-lockfile
    Assert-CommandSucceeded "corepack pnpm install --frozen-lockfile"
  }

  Invoke-Step "windows-electron-checks" {
    Write-Host "[5/6] Electron checks"
    corepack pnpm --dir apps/windows-electron check
    Assert-CommandSucceeded "corepack pnpm --dir apps/windows-electron check"
    corepack pnpm --dir apps/windows-electron build
    Assert-CommandSucceeded "corepack pnpm --dir apps/windows-electron build"
    corepack pnpm --dir apps/windows-electron test
    Assert-CommandSucceeded "corepack pnpm --dir apps/windows-electron test"
    corepack pnpm --dir apps/windows-electron smoke:owner
    Assert-CommandSucceeded "corepack pnpm --dir apps/windows-electron smoke:owner"
  }

  Invoke-Step "root-build" {
    Write-Host "[6/6] Root build"
    corepack pnpm build
    Assert-CommandSucceeded "corepack pnpm build"
  }

  $syncSucceeded = $true
  if ($SkipGitOps) {
    Write-Host "Verification flow complete (git sync skipped)."
  } else {
    Write-Host "Upstream sync flow complete."
  }
} finally {
  $finishedAt = Get-Date
  $reportPath = Join-Path $reportRoot ("sync-" + $startedAt.ToString("yyyyMMdd-HHmmss") + ".json")
  $report = [pscustomobject]@{
    startedAt = $startedAt.ToString("o")
    finishedAt = $finishedAt.ToString("o")
    durationSeconds = [Math]::Round(($finishedAt - $startedAt).TotalSeconds, 2)
    success = $syncSucceeded
    mode = $(if ($SkipGitOps) { "verify-only" } else { "full-sync" })
    repoRoot = $repoRoot
    steps = $script:steps
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "Upstream sync report: $reportPath"
}
