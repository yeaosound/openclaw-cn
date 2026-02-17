$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
pnpm build
pnpm exec electron .
