$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
Set-Location $repoRoot

Write-Host "[1/6] Fetch remotes"
git fetch origin --prune
git fetch upstream --prune

Write-Host "[2/6] Rebase current branch onto upstream/main"
git rebase upstream/main

Write-Host "[3/6] Install deps"
corepack pnpm install --frozen-lockfile

Write-Host "[4/6] Electron checks"
corepack pnpm --dir apps/windows-electron check
corepack pnpm --dir apps/windows-electron build
corepack pnpm --dir apps/windows-electron test

Write-Host "[5/6] Owner smoke"
corepack pnpm --dir apps/windows-electron smoke:owner

Write-Host "[6/6] Root build"
corepack pnpm build

Write-Host "Upstream sync flow complete."
