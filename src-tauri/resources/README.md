# Tauri Desktop Resources

This directory is populated by the Windows build scripts at build time.
It is intentionally empty on commit — only this README is tracked.

Layout after `build-windows.ps1`:

```
resources/
├── README.md               (this file)
├── node/                   Node.js 22 LTS Windows binary
│   ├── node.exe
│   ├── npm.cmd
│   └── node_modules/npm/
├── app/                    Next.js standalone server
│   ├── start.js            Tauri server wrapper (env hydration + require(./server.js))
│   ├── server.js           Next.js standalone entrypoint
│   ├── .next/              compiled Next output
│   ├── public/             static assets
│   └── node_modules/       trace-minimized runtime deps
└── pi/                     @mariozechner/pi-coding-agent baked in
    ├── pi.cmd              Windows shim
    └── node_modules/@mariozechner/pi-coding-agent/
```

The Tauri Rust launcher (`src/lib.rs`) resolves `resource_dir` at runtime
and spawns `node/node.exe` with `app/start.js`, passing a random ephemeral
`PORT` and a `PI_BIN` env var pointing at `pi/pi.cmd`.

See `docs/WINDOWS-BUILD.md` for the full build flow.
