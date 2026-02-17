$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "[1/4] Typecheck"
corepack pnpm check

Write-Host "[2/4] Build"
corepack pnpm build

Write-Host "[3/4] Contract tests"
node --test "dist/main/ipc/validate.test.js" "dist/main/service/daemon-status.test.js" "dist/main/mcp/config-manager.test.js"

Write-Host "[4/4] Daemon status probe (no start/stop side effects)"
Push-Location (Join-Path $PSScriptRoot "../../..")
node "./scripts/run-node.mjs" daemon status --json --no-probe --deep
if ($LASTEXITCODE -ne 0) {
  throw "Daemon status probe failed with exit code $LASTEXITCODE"
}
Pop-Location

Write-Host "Smoke complete."
