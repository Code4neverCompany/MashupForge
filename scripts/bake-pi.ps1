# scripts/bake-pi.ps1
#
# Installs @mariozechner/pi-coding-agent into src-tauri/resources/pi using
# the bundled Node + npm from src-tauri/resources/node. Baking pi at build
# time (vs installing at first run) eliminates a whole class of desktop
# failure modes around npm, HOME, and network availability.
#
# Re-running wipes the pi dir to guarantee a clean install. Run this
# after fetch-windows-node.ps1.

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$NodeDir = Join-Path $RepoRoot 'src-tauri\resources\node'
$PiDir = Join-Path $RepoRoot 'src-tauri\resources\pi'
$NodeExe = Join-Path $NodeDir 'node.exe'
$NpmCli = Join-Path $NodeDir 'node_modules\npm\bin\npm-cli.js'

Write-Host "[bake-pi] Node:   $NodeExe"
Write-Host "[bake-pi] Target: $PiDir"

if (-not (Test-Path $NodeExe)) {
    throw "[bake-pi] Missing bundled Node at $NodeExe — run scripts/fetch-windows-node.ps1 first."
}
if (-not (Test-Path $NpmCli)) {
    throw "[bake-pi] Missing npm-cli.js at $NpmCli — bundled Node install is incomplete."
}

if (Test-Path $PiDir) {
    Write-Host "[bake-pi] Removing stale $PiDir ..."
    Remove-Item -Recurse -Force $PiDir
}
New-Item -ItemType Directory -Force -Path $PiDir | Out-Null

# Quiet npm's interactive chatter.
$env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'
$env:NO_UPDATE_NOTIFIER = '1'
$env:NPM_CONFIG_FUND = 'false'
$env:NPM_CONFIG_AUDIT = 'false'

Write-Host "[bake-pi] Installing @mariozechner/pi-coding-agent ..."
& $NodeExe $NpmCli install '--prefix' $PiDir '--global' '@mariozechner/pi-coding-agent'
if ($LASTEXITCODE -ne 0) {
    throw "[bake-pi] npm install failed with exit code $LASTEXITCODE"
}

$PiCmd = Join-Path $PiDir 'pi.cmd'
if (-not (Test-Path $PiCmd)) {
    # Older npm layouts drop the shim into a bin/ subdir. Fall back to a search.
    $PiCmdFallback = Get-ChildItem -Path $PiDir -Filter 'pi.cmd' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $PiCmdFallback) {
        throw "[bake-pi] Expected pi.cmd under $PiDir after install, not found."
    }
    Write-Host "[bake-pi] pi.cmd found at non-default path: $($PiCmdFallback.FullName)"
    Write-Warning "[bake-pi] Rust launcher assumes $PiDir\pi.cmd — consider copying or symlinking."
    Copy-Item -Path $PiCmdFallback.FullName -Destination $PiCmd -Force
}

Write-Host "[bake-pi] Done. pi.cmd at $PiCmd"
