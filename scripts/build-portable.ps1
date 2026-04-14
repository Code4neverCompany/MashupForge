# build-portable.ps1
# Creates a portable MashupForge folder that runs on Windows.
#
# Produces dist\portable\MashupForge\ with:
#   - standalone\ (Next.js standalone server + correctly placed static/public)
#   - standalone\node_modules\@img\sharp-win32-x64 (Windows native binding)
#   - standalone\node_modules\@next\swc-win32-x64-msvc (Windows SWC binding)
#   - node\node-v22.11.0-win-x64\ (bundled Node runtime)
#   - start.bat (launcher pinned to 127.0.0.1:3001)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$OutputDir = Join-Path $RepoRoot "dist\portable"
$AppDir = Join-Path $OutputDir "MashupForge"
$NodeVer = "v22.11.0"
$NodeDirName = "node-$NodeVer-win-x64"
# 3001 chosen so the portable build does not collide with a WSL
# dev server on 3000 (Windows sees WSL's localhost bindings).
$Port = 3001

Write-Host "=== MashupForge Portable Build ==="

# Clean output
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

# Step 1: Build Next.js
Write-Host "[1/6] Building Next.js..."
Set-Location $RepoRoot
npm run build 2>&1 | Out-Null

# Step 2: Copy standalone with static/public in the RIGHT place.
#
# server.js calls process.chdir(__dirname) so it serves
# ./public and ./.next/static relative to its own folder.
Write-Host "[2/6] Copying standalone + static + public..."
$Standalone = Join-Path $RepoRoot ".next\standalone"
$StaticDir = Join-Path $RepoRoot ".next\static"
$PublicDir = Join-Path $RepoRoot "public"

Copy-Item $Standalone "$AppDir\" -Recurse
New-Item -ItemType Directory -Path "$AppDir\standalone\.next" -Force | Out-Null
Copy-Item $StaticDir "$AppDir\standalone\.next\static" -Recurse
New-Item -ItemType Directory -Path "$AppDir\standalone\public" -Force | Out-Null
if (Test-Path $PublicDir) {
  Copy-Item "$PublicDir\*" "$AppDir\standalone\public\" -Recurse -Force
}

# Step 3: Install Windows-native bindings into standalone\node_modules.
# Safe on Windows hosts (already native) and on Linux/WSL hosts
# (npm --os/--cpu pulls the foreign binding without running install
# scripts).
Write-Host "[3/6] Installing Windows-native bindings..."
Push-Location "$AppDir\standalone"
npm install `
  --force `
  --no-save `
  --no-audit `
  --loglevel=error `
  --os=win32 `
  --cpu=x64 `
  "@img/sharp-win32-x64" `
  "@next/swc-win32-x64-msvc" 2>&1 | Out-Null
if (-not (Test-Path "node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node")) {
  throw "sharp-win32-x64 binding missing after install"
}
if (-not (Test-Path "node_modules\@next\swc-win32-x64-msvc\next-swc.win32-x64-msvc.node")) {
  throw "@next/swc-win32-x64-msvc binding missing after install"
}
Pop-Location

# Step 4: Download Node.js
Write-Host "[4/6] Downloading Node.js $NodeVer..."
$NodeUrl = "https://nodejs.org/dist/$NodeVer/$NodeDirName.zip"
$NodeZip = Join-Path $OutputDir "node.zip"
Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
Expand-Archive $NodeZip -DestinationPath "$AppDir\node" -Force
Remove-Item $NodeZip

# Step 5: Create launcher
Write-Host "[5/6] Creating launcher..."
$bat = @"
@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  MashupForge Desktop
echo ========================================
echo.

if not exist "logs" mkdir logs

set "NODE_EXE=%~dp0node\$NodeDirName\node.exe"
if not exist "%NODE_EXE%" (
  echo [error] Bundled Node.js not found at:
  echo   %NODE_EXE%
  echo.
  pause
  exit /b 1
)

if not exist "standalone\server.js" (
  echo [error] standalone\server.js missing. Re-extract the portable zip.
  pause
  exit /b 1
)

REM Pin loopback to avoid Windows Defender Firewall prompt.
set HOSTNAME=127.0.0.1
set HOST=127.0.0.1
set PORT=$Port
set NODE_ENV=production

REM Persistent pi.dev install location. Without this, pi-setup.ts
REM falls back to %TEMP% which Windows may clean between sessions.
if not defined APPDATA set "APPDATA=%USERPROFILE%\AppData\Roaming"
set "MASHUPFORGE_PI_DIR=%APPDATA%\MashupForge\pi"
set MASHUPFORGE_DESKTOP=1
if not exist "%MASHUPFORGE_PI_DIR%" mkdir "%MASHUPFORGE_PI_DIR%" 2> nul

echo Starting Next.js server on http://127.0.0.1:$Port ...
start /B "" "%NODE_EXE%" standalone\server.js > logs\server.log 2>&1

echo Waiting for server...
set /a TRIES=0
:wait
timeout /t 1 /nobreak > nul
set /a TRIES+=1
curl -s -o nul http://127.0.0.1:$Port
if not errorlevel 1 goto ready
if %TRIES% GEQ 20 goto srv_timeout
goto wait

:srv_timeout
echo.
echo [error] Server did not respond within 20 seconds.
echo ---- logs\server.log ----
type logs\server.log
echo --------------------------
echo.
pause
exit /b 1

:ready
echo Server ready.
start http://127.0.0.1:$Port
echo.
echo Press any key to stop the server and exit...
pause > nul

taskkill /F /IM node.exe > nul 2>&1
echo Server stopped.
endlocal
"@
$bat | Out-File -FilePath "$AppDir\start.bat" -Encoding ASCII

# Step 6: README + archive
Write-Host "[6/6] Creating README + archive..."
@"
MashupForge Desktop - Portable Version

1. Extract this folder anywhere
2. Double-click start.bat
3. Browser opens automatically at http://127.0.0.1:$Port

Logs: logs\server.log
Stop: press any key in the console window

Requirements:
- Windows 10/11 x64
- No other requirements (Node.js is bundled)
"@ | Out-File -FilePath "$AppDir\README.txt" -Encoding ASCII

$ZipPath = Join-Path $OutputDir "MashupForge-portable.zip"
Compress-Archive -Path $AppDir -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "=== DONE ==="
Write-Host "Portable build: $AppDir"
Write-Host "Zip file: $ZipPath"
Write-Host ""
Write-Host "To test:"
Write-Host "1. Copy $ZipPath to Windows"
Write-Host "2. Extract"
Write-Host "3. Run start.bat"
