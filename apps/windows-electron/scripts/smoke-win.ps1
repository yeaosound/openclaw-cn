$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

pnpm build
$proc = Start-Process -FilePath "pnpm" -ArgumentList "exec", "electron", "." -PassThru
Start-Sleep -Seconds 8
if ($proc.HasExited) {
  throw "Electron smoke run exited early with code $($proc.ExitCode)"
}
Stop-Process -Id $proc.Id -Force
Write-Host "Smoke passed: Electron launched and stayed alive for 8s."
