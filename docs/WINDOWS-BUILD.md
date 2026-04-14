# MashupForge — Windows Desktop Build

This document is the Phase 1 runbook for building the MashupForge
Windows desktop installer from source on your Windows PC.

The desktop build ships a self-contained Next.js server + Node.js
runtime + pi.dev CLI inside a Tauri webview. The web app runs **locally**
on a random `127.0.0.1` port — no network dependency on the Vercel
deploy, pi.dev runs as a local subprocess.

> **Phased roadmap** (nothing below is abandoned, just sequenced):
>
> - **Phase 1** (you are here) — local build on Maurice's PC via `build-windows.ps1`
> - **Phase 2** — GitHub Actions CI/CD on `windows-latest` (auto-builds on tag)
> - **Phase 3** — Real icon, code-signing cert, installer polish
> - **Phase 4** — Auto-update via Tauri updater plugin

---

## 1. One-time toolchain setup

Install the following on your Windows PC. This is the only manual
install step — everything else is automated by `build-windows.ps1`.

### Required

| Tool | Install via | Why |
|---|---|---|
| **Node.js 22 LTS** | https://nodejs.org/ (LTS installer) | Runs `npm ci`, `next build`, and `npx tauri`. Separate from the Node we bundle for the sidecar. |
| **Rust** | https://rustup.rs (`rustup-init.exe`) | Tauri is Rust. After install run `rustup target add x86_64-pc-windows-msvc` if not already present. |
| **Visual Studio 2022 Build Tools** | https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022 → select **"Desktop development with C++"** workload | MSVC linker + Windows SDK needed by Rust + Tauri's WiX/NSIS bundlers. ~6 GB. |
| **WebView2 Runtime** | https://developer.microsoft.com/microsoft-edge/webview2/ | Webview renderer. Pre-installed on Windows 11. The Tauri installer auto-provisions it for Win10. |
| **Git for Windows** | https://git-scm.com/download/win | Cloning the repo. |

### Verify

Open **PowerShell** (not WSL) and run:

```powershell
node --version     # v22.x.x
npm --version      # 10.x or 11.x
rustc --version    # 1.8x+ or 1.9x+
cargo --version
git --version
rustup target list --installed
```

The `rustup target list --installed` output must include
`x86_64-pc-windows-msvc`. If it doesn't:

```powershell
rustup target add x86_64-pc-windows-msvc
```

---

## 2. Clone the repo

```powershell
cd $HOME\projects
git clone <your-repo-url> MashupForge
cd MashupForge
```

If you already have it in WSL, clone a **fresh copy on the Windows
side** — don't reuse the WSL tree. Line endings and path translation
between WSL and Windows PowerShell will break the build.

---

## 3. Build

From the repo root in PowerShell:

```powershell
.\build-windows.ps1
```

That's it. The script:

1. Sanity-checks your toolchain.
2. Runs `npm ci`.
3. Downloads Node.js 22 LTS Windows portable and drops it at
   `src-tauri\resources\node\`. Cached in `.cache\node\` on repeat runs.
4. `npm install`s `@mariozechner/pi-coding-agent` into
   `src-tauri\resources\pi\` using the bundled Node (so pi is locked to
   the same Node version the sidecar runs).
5. `npm run build` — Next.js builds in standalone mode, producing
   `.next\standalone\server.js` + a trace-minimized `node_modules`.
6. Copies `.next\standalone\*`, `.next\static\*`, and `public\*` into
   `src-tauri\resources\app\` and installs
   `scripts\tauri-server-wrapper.js` as `start.js` next to `server.js`.
7. `npx tauri build` — produces the Windows installer.

**Expected time on a cold build:**
- ~3 min: npm ci + Next build
- ~2 min: Node download + pi install
- ~8–15 min: Tauri's first Rust build (cached thereafter)
- Total first run: ~15–20 min. Subsequent runs: ~5 min.

**Artifacts:**
- `src-tauri\target\release\bundle\msi\MashupForge_0.1.0_x64_en-US.msi`
- `src-tauri\target\release\bundle\nsis\MashupForge_0.1.0_x64-setup.exe`

Double-click either to install. Both are unsigned in Phase 1 — Windows
SmartScreen will show a warning on first run. Click **"More info"** →
**"Run anyway"**. Phase 3 will add a real code-signing cert so users
don't see this.

### Faster iteration: `-Dev` flag

```powershell
.\build-windows.ps1 -Dev
```

Produces a debug build (`src-tauri\target\debug\bundle\...`) which is
~3× faster to compile and keeps Rust assertions + `tauri-plugin-log`
enabled so the sidecar prints to the debug console. Use this while
shaking out the first build; switch to release once everything works.

---

## 4. Runtime configuration (first launch)

The desktop app reads API keys from a per-user JSON file, **not** from
the Settings modal's localStorage. After installing, create:

```
%APPDATA%\MashupForge\config.json
```

Schema — a flat JSON object where every string value becomes a
`process.env` entry inside the Next server:

```json
{
  "LEONARDO_API_KEY": "your-leonardo-key-here",
  "INSTAGRAM_ACCESS_TOKEN": "optional",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID": "optional",
  "PINTEREST_ACCESS_TOKEN": "optional"
}
```

Keys with empty string values are skipped. Nested objects and arrays
are ignored (not hydrated to `process.env`).

You can also point at a custom dir by setting the
`MASHUPFORGE_CONFIG_DIR` environment variable before launching the
app — useful for multi-profile testing.

### pi.dev login

pi.dev auth is stored at `%USERPROFILE%\.pi\agent\auth.json` — the same
path `lib/pi-setup.ts` checks on every platform. On first launch, open
the Settings modal and walk through the existing pi setup flow; it will
spawn the bundled `pi.cmd` interactively.

If auth still fails, verify the bundled pi works from PowerShell
directly:

```powershell
"C:\Program Files\MashupForge\resources\pi\pi.cmd" --version
```

---

## 5. Troubleshooting

### "Missing required tool: cargo"

You installed Rust but didn't restart PowerShell. The rustup installer
only patches the PATH for **new** shells. Close and reopen PowerShell.

### "Rust target x86_64-pc-windows-msvc not installed"

```powershell
rustup target add x86_64-pc-windows-msvc
```

### "link.exe not found" or "LNK1181"

MSVC Build Tools are either missing or the wrong workload was
installed. Re-run the VS Installer and ensure **"Desktop development
with C++"** is checked (not just "Linux development").

### SmartScreen blocks the installer

Phase 1 ships unsigned. Click **More info** → **Run anyway**. Phase 3
will add a signing cert.

### Sidecar crashes / blank window after install

1. Run the installed app from PowerShell so you can see stderr:
   ```powershell
   & "C:\Program Files\MashupForge\MashupForge.exe"
   ```
2. Check the Tauri log file at
   `%APPDATA%\com.4nevercompany.mashupforge\logs\MashupForge.log`.
3. If the log shows `node.exe not found`, `bake-pi.ps1` or
   `fetch-windows-node.ps1` didn't populate `resources/` correctly —
   rebuild.

### "npm install failed" inside bake-pi.ps1

Check that the bundled Node downloaded fully:

```powershell
& "src-tauri\resources\node\node.exe" --version
```

Should print `v22.11.0`. If not, delete `.cache\node\` and re-run.

### "glob pattern resources/**/* path not found"

The resources dir is empty. Run `build-windows.ps1` so the fetch + bake
scripts populate it — or manually ensure at least
`src-tauri\resources\README.md` exists (Tauri requires at least one
file to match the bundle resource glob).

### Port collisions

The sidecar picks a random ephemeral port each launch via
`TcpListener::bind("127.0.0.1:0")`, so port conflicts with the web dev
server (3100) or other local services won't occur. If you somehow hit
a race, relaunching the app picks a different port.

---

## 6. Architecture notes

### What ships inside the .msi

```
C:\Program Files\MashupForge\
├── MashupForge.exe             Tauri shell (Rust)
├── WebView2Loader.dll
└── resources\
    ├── README.md
    ├── node\
    │   ├── node.exe            Node.js 22 LTS portable
    │   ├── npm.cmd
    │   └── node_modules\npm\
    ├── app\
    │   ├── start.js            Tauri server wrapper (env hydration)
    │   ├── server.js           Next.js standalone entrypoint
    │   ├── .next\              compiled Next output + static assets
    │   ├── public\
    │   └── node_modules\       trace-minimized runtime deps
    └── pi\
        ├── pi.cmd              @mariozechner/pi-coding-agent shim
        └── node_modules\@mariozechner\pi-coding-agent\
```

Installed size: ~200–250 MB. Most of that is Node + Next's traced
`node_modules` + Leonardo SDK deps.

### Boot sequence

1. User launches `MashupForge.exe`.
2. Tauri opens the window, loads `frontend-stub/index.html` → shows
   the loading spinner.
3. Rust `setup()` hook picks a free port, spawns
   `node.exe start.js` with `PORT`, `HOSTNAME=127.0.0.1`, `PI_BIN`,
   and `MASHUPFORGE_RESOURCES_DIR` env vars.
4. `start.js` reads `%APPDATA%\MashupForge\config.json` and injects
   every string entry into `process.env`, then `require('./server.js')`.
5. Next boots, binds `127.0.0.1:<port>`, starts accepting requests.
6. Rust polls the port (100 ms interval, 30s timeout).
7. Rust navigates the window to `http://127.0.0.1:<port>` — the real
   MashupForge UI replaces the loading stub.
8. On window close, Rust kills the Node child.

### Why we bake pi at build time instead of installing at first run

The Vercel-era `lib/pi-setup.ts:installPi()` runs `npm install` at
request time into a writable tmpdir. That approach hit the write-probe
rabbit hole during the Vercel lambda work (see commits `f14094a` /
`28aa0b0`) and would hit a whole new set of rabbit holes on Windows:
HOME resolution, npm's Windows-specific `.cmd` shim behavior, missing
`vcruntime140.dll`, etc.

Baking pi at build time means a successful `build-windows.ps1` run is
the only place npm can fail. Once the `.msi` is built, the installer
ships a known-good pi binary — no network, no npm, no mystery.

The tradeoff: pi version updates require a rebuild + re-install. For
Phase 1 this is acceptable (pi changes rarely and the app rebuilds
quickly once the toolchain is warm). Phase 4's auto-update will make
this transparent.

---

## 7. What's NOT in Phase 1 (and where it goes)

| Item | Phase | Rationale |
|---|---|---|
| GitHub Actions `windows-latest` CI | 2 | Need a working local build first to know what CI should reproduce |
| Real MashupForge logo / icon | 3 | Placeholder .ico is fine for functional validation |
| Code-signing cert + signed .msi | 3 | SmartScreen warning is acceptable for "works on Maurice's PC" |
| Windows Credential Manager for API keys | 3 | Plain `config.json` is simpler and works — CM is polish |
| Tauri updater plugin / `latest.json` | 4 | Needs signed builds from Phase 3 |
| macOS (.dmg) / Linux (.AppImage) builds | — | Future, not scheduled |

Each of these becomes a new task in the task board when its phase
starts. Nothing above is forgotten.
