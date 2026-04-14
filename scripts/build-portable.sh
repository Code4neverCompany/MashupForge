#!/bin/bash
# build-portable.sh — Creates portable MashupForge for Windows.
#
# Produces dist/portable/MashupForge/ with:
#   - standalone/ (Next.js standalone server + correctly placed static/public)
#   - standalone/node_modules/@img/sharp-win32-x64 (Windows native binding)
#   - standalone/node_modules/@next/swc-win32-x64-msvc (Windows SWC binding)
#   - node/node-v22.11.0-win-x64/ (bundled Node runtime)
#   - start.bat (launcher pinned to 127.0.0.1)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/dist/portable"
APP_DIR="$OUTPUT_DIR/MashupForge"
NODE_VER="v22.11.0"
NODE_DIR_NAME="node-${NODE_VER}-win-x64"
# 3001 chosen so the portable build does not collide with a WSL
# dev server on 3000 (Windows sees WSL's localhost bindings).
PORT="3001"

echo "=== MashupForge Portable Build ==="

# Clean
rm -rf "$OUTPUT_DIR"
mkdir -p "$APP_DIR"

# Step 1: Build Next.js
echo "[1/6] Building Next.js..."
cd "$REPO_ROOT"
npm run build 2>&1 | tail -3

# Step 2: Copy standalone with static/public in the RIGHT place.
#
# server.js calls process.chdir(__dirname) so it serves
# ./public and ./.next/static relative to its own folder.
# If we drop static/public at $APP_DIR root they never get served.
echo "[2/6] Copying standalone + static + public..."
cp -r .next/standalone "$APP_DIR/"
mkdir -p "$APP_DIR/standalone/.next"
cp -r .next/static "$APP_DIR/standalone/.next/static"
# standalone/public may already exist (traced assets); merge our public/ into it.
mkdir -p "$APP_DIR/standalone/public"
if [ -d public ]; then
  cp -r public/. "$APP_DIR/standalone/public/"
fi

# Step 3: Install Windows-native bindings into standalone/node_modules.
#
# The host build runs on Linux/WSL, so standalone/node_modules holds
# @img/sharp-linux-x64 and no @next/swc-*. Windows node.exe cannot
# load Linux .node files. npm's --os/--cpu flags pull the optional
# deps for a foreign platform without executing their install
# scripts.
echo "[3/6] Installing Windows-native bindings..."
cd "$APP_DIR/standalone"
npm install \
  --force \
  --no-save \
  --no-audit \
  --loglevel=error \
  --os=win32 \
  --cpu=x64 \
  @img/sharp-win32-x64 \
  @next/swc-win32-x64-msvc 2>&1 | tail -3
# Sanity-check: the Windows .node files must be present.
if [ ! -f node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node ]; then
  echo "  [error] sharp-win32-x64 binding missing after install"
  exit 1
fi
if [ ! -f node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node ]; then
  echo "  [error] @next/swc-win32-x64-msvc binding missing after install"
  exit 1
fi
cd "$REPO_ROOT"

# Step 4: Download Node.js for Windows
echo "[4/6] Downloading Node.js ${NODE_VER}..."
cd "$OUTPUT_DIR"
wget -q "https://nodejs.org/dist/${NODE_VER}/${NODE_DIR_NAME}.zip" -O node.zip
unzip -q node.zip -d "$APP_DIR/node"
rm node.zip

# Step 5: Create launcher
echo "[5/6] Creating launcher..."
cat > "$APP_DIR/start.bat" << BAT
@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  MashupForge Desktop
echo ========================================
echo.

if not exist "logs" mkdir logs

set "NODE_EXE=%~dp0node\\${NODE_DIR_NAME}\\node.exe"
if not exist "%NODE_EXE%" (
  echo [error] Bundled Node.js not found at:
  echo   %NODE_EXE%
  echo.
  pause
  exit /b 1
)

if not exist "standalone\\server.js" (
  echo [error] standalone\\server.js missing. Re-extract the portable zip.
  pause
  exit /b 1
)

REM Pin loopback to avoid Windows Defender Firewall prompt.
set HOSTNAME=127.0.0.1
set HOST=127.0.0.1
set PORT=${PORT}
set NODE_ENV=production

REM Persistent pi.dev install location. Without this, pi-setup.ts
REM falls back to %TEMP%\mashupforge-pi-install which Windows
REM disk cleanup can wipe between sessions — user would have to
REM reinstall pi every launch. %APPDATA%\MashupForge is the same
REM root the Tauri desktop wrapper uses for config.json.
if not defined APPDATA set "APPDATA=%USERPROFILE%\\AppData\\Roaming"
set "MASHUPFORGE_PI_DIR=%APPDATA%\\MashupForge\\pi"
set MASHUPFORGE_DESKTOP=1
if not exist "%MASHUPFORGE_PI_DIR%" mkdir "%MASHUPFORGE_PI_DIR%" 2> nul

echo Starting Next.js server on http://127.0.0.1:${PORT} ...
start /B "" "%NODE_EXE%" standalone\\server.js > logs\\server.log 2>&1

echo Waiting for server...
set /a TRIES=0
:wait
timeout /t 1 /nobreak > nul
set /a TRIES+=1
curl -s -o nul http://127.0.0.1:${PORT}
if not errorlevel 1 goto ready
if %TRIES% GEQ 20 goto srv_timeout
goto wait

:srv_timeout
echo.
echo [error] Server did not respond within 20 seconds.
echo ---- logs\\server.log ----
type logs\\server.log
echo --------------------------
echo.
pause
exit /b 1

:ready
echo Server ready.
start http://127.0.0.1:${PORT}
echo.
echo Press any key to stop the server and exit...
pause > nul

taskkill /F /IM node.exe > nul 2>&1
echo Server stopped.
endlocal
BAT

# Step 6: README + archive
echo "[6/6] Creating README + archive..."
cat > "$APP_DIR/README.txt" << 'TXT'
MashupForge Desktop - Portable Version

1. Extract this folder anywhere
2. Double-click start.bat
3. Browser opens automatically at http://127.0.0.1:${PORT}

Logs: logs\server.log
Stop: press any key in the console window

Requirements:
- Windows 10/11 x64
- No other requirements (Node.js is bundled)
TXT

cd "$OUTPUT_DIR"
if command -v zip > /dev/null 2>&1; then
  zip -rq MashupForge-portable.zip MashupForge/
  echo "Zip:    $OUTPUT_DIR/MashupForge-portable.zip"
fi
tar -czf MashupForge-portable.tar.gz MashupForge/
echo "Tar.gz: $OUTPUT_DIR/MashupForge-portable.tar.gz"

echo ""
echo "=== DONE ==="
echo "Portable build: $APP_DIR"
echo ""
echo "To test on Windows:"
echo "1. Copy the zip/tar.gz over"
echo "2. Extract"
echo "3. Run start.bat"
