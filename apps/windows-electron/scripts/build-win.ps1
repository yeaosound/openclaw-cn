param(
  [ValidateSet("build", "dir", "nsis", "portable")]
  [string]$Mode = "build",
  [int]$Retry = 3
)

$ErrorActionPreference = "Stop"
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $appRoot

if (-not $env:ELECTRON_CACHE) {
  $env:ELECTRON_CACHE = Join-Path $env:USERPROFILE ".cache/electron"
}
if (-not $env:ELECTRON_BUILDER_CACHE) {
  $env:ELECTRON_BUILDER_CACHE = Join-Path $env:USERPROFILE ".cache/electron-builder"
}

New-Item -ItemType Directory -Path $env:ELECTRON_CACHE -Force | Out-Null
New-Item -ItemType Directory -Path $env:ELECTRON_BUILDER_CACHE -Force | Out-Null

function Invoke-WithRetry {
  param(
    [scriptblock]$Action,
    [string]$Label
  )

  for ($attempt = 1; $attempt -le $Retry; $attempt++) {
    try {
      & $Action
      return
    } catch {
      if ($attempt -eq $Retry) {
        throw
      }
      $waitSeconds = [Math]::Min(20, $attempt * 5)
      Write-Warning "$Label failed on attempt $attempt/$Retry. Retrying in ${waitSeconds}s..."
      Start-Sleep -Seconds $waitSeconds
    }
  }
}

Write-Host "Using ELECTRON_CACHE=$($env:ELECTRON_CACHE)"
Write-Host "Using ELECTRON_BUILDER_CACHE=$($env:ELECTRON_BUILDER_CACHE)"
if ($env:ELECTRON_MIRROR) {
  Write-Host "Using ELECTRON_MIRROR=$($env:ELECTRON_MIRROR)"
}

Invoke-WithRetry -Label "TypeScript build" -Action {
  corepack pnpm build
}

if ($Mode -eq "build") {
  exit 0
}

$targetArgs = switch ($Mode) {
  "dir" { @("--win", "--dir", "--publish", "never") }
  "nsis" { @("--win", "nsis", "--publish", "never") }
  "portable" { @("--win", "portable", "--publish", "never") }
  default { throw "Unsupported mode: $Mode" }
}

Invoke-WithRetry -Label "electron-builder package" -Action {
  & corepack pnpm dlx electron-builder --config electron-builder.yml @targetArgs
}
