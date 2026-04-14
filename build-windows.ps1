# build-windows.ps1
#
# MashupForge Windows desktop build orchestrator. Runs the full Phase 1
# build pipeline and emits .msi / setup.exe installers at
# src-tauri\target\<release|debug>\bundle\.
#
# Usage:
#   .\build-windows.ps1                 # release build (unsigned .msi + setup.exe)
#   .\build-windows.ps1 -Dev             # debug build (faster, keeps assertions)
#   .\build-windows.ps1 -SkipToolchainCheck  # bypass the upfront tool check
#
# Prerequisites (one-time setup, see docs/WINDOWS-BUILD.md):
#   - Node.js 22 LTS on PATH
#   - Rust via rustup, with x86_64-pc-windows-msvc target
#   - Visual Studio 2022 Build Tools with "Desktop development with C++"
#   - WebView2 Runtime (pre-installed on Win11, stub installer on Win10)
#   - Git for Windows

param(
    [switch]$Dev = $false,
    [switch]$SkipToolchainCheck = $false
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$ScriptsDir = Join-Path $RepoRoot 'scripts'
Set-Location $RepoRoot

Write-Host ""
Write-Host "=== MashupForge Windows Desktop Build ==="
Write-Host "Repo:  $RepoRoot"
Write-Host "Mode:  $(if ($Dev) { 'debug' } else { 'release' })"
Write-Host ""

# -----------------------------------------------------------------------------
# [1/7] Toolchain sanity check
# -----------------------------------------------------------------------------
if (-not $SkipToolchainCheck) {
    Write-Host "[1/7] Toolchain check ..."
    $required = @('node', 'npm', 'cargo', 'rustc', 'git')
    foreach ($cmd in $required) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "Missing required tool: $cmd. See docs/WINDOWS-BUILD.md for install instructions."
        }
    }
    $rustupOutput = & rustup target list --installed 2>$null
    if ($LASTEXITCODE -ne 0 -or -not ($rustupOutput -match 'x86_64-pc-windows-msvc')) {
        throw "Rust target x86_64-pc-windows-msvc not installed. Run: rustup target add x86_64-pc-windows-msvc"
    }
    Write-Host "      OK — node $(& node --version), rustc $(& rustc --version | ForEach-Object { $_.Split(' ')[1] })"
} else {
    Write-Host "[1/7] Skipping toolchain check (--SkipToolchainCheck)"
}

# -----------------------------------------------------------------------------
# [2/7] npm ci
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/7] Installing JS dependencies (npm ci) ..."
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

# -----------------------------------------------------------------------------
# [3/7] Fetch bundled Node.js
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/7] Fetching bundled Node.js for sidecar ..."
& (Join-Path $ScriptsDir 'fetch-windows-node.ps1')
if ($LASTEXITCODE -ne 0) { throw "fetch-windows-node.ps1 failed" }

# -----------------------------------------------------------------------------
# [4/7] Bake pi into resources
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[4/7] Baking pi into resources ..."
& (Join-Path $ScriptsDir 'bake-pi.ps1')
if ($LASTEXITCODE -ne 0) { throw "bake-pi.ps1 failed" }

# -----------------------------------------------------------------------------
# [5/7] Next.js standalone build
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[5/7] Next.js standalone build ..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

# -----------------------------------------------------------------------------
# [6/7] Copy standalone tree into Tauri resources
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[6/7] Copying standalone tree -> src-tauri/resources/app ..."
& (Join-Path $ScriptsDir 'copy-standalone-to-resources.ps1')
if ($LASTEXITCODE -ne 0) { throw "copy-standalone-to-resources.ps1 failed" }

# -----------------------------------------------------------------------------
# [7/7] Tauri build
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "[7/7] Tauri build ..."
if ($Dev) {
    npx tauri build --debug
} else {
    npx tauri build
}
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

# -----------------------------------------------------------------------------
# Report artifacts
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "=== Build complete ==="

$BundleRoot = if ($Dev) {
    Join-Path $RepoRoot 'src-tauri\target\debug\bundle'
} else {
    Join-Path $RepoRoot 'src-tauri\target\release\bundle'
}

$Msi = Get-ChildItem -Path $BundleRoot -Filter '*.msi' -Recurse -ErrorAction SilentlyContinue
$Nsis = Get-ChildItem -Path $BundleRoot -Filter '*-setup.exe' -Recurse -ErrorAction SilentlyContinue

if ($Msi) {
    Write-Host "MSI:      $($Msi.FullName)"
}
if ($Nsis) {
    Write-Host "NSIS EXE: $($Nsis.FullName)"
}
if (-not $Msi -and -not $Nsis) {
    Write-Warning "No installer artifacts found under $BundleRoot"
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Double-click the .msi (or setup.exe) to install."
Write-Host "  2. Click past the SmartScreen warning (unsigned — Phase 3 will add a cert)."
Write-Host "  3. On first launch, create %APPDATA%\MashupForge\config.json with your API keys."
Write-Host "     See docs/WINDOWS-BUILD.md section 'Runtime configuration' for the schema."
Write-Host ""
