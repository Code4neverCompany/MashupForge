use std::fs::{File, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

/// Holds the running Node sidecar child so we can kill it on window close.
struct SidecarState(Mutex<Option<Child>>);

/// Stable loopback port for the Next.js sidecar.
///
/// STORY-121: the webview persists settings via IndexedDB, which is
/// origin-scoped (`host:port`). Previously we picked an ephemeral port
/// on every launch, so each run produced a new origin
/// (`http://127.0.0.1:<random>`) and the IndexedDB lookup missed the
/// previous session's data — settings, carousel groups, pipeline
/// state, API keys all appeared wiped. WebView2 was faithfully
/// persisting everything, just under the prior launch's origin key.
///
/// Fixing the port pins the origin across launches. 19782 is IANA-
/// unassigned, outside both the Windows (49152–65535) and Linux
/// (32768–60999) ephemeral ranges, and well above the privileged-
/// port cutoff so no elevation is needed.
const DESKTOP_PORT: u16 = 19782;

/// Resolve the port to bind the sidecar on.
///
/// First tries the stable `DESKTOP_PORT` (IndexedDB persistence). If
/// something else is already bound there, falls back to an ephemeral
/// port so the app still launches — but logs a prominent warning that
/// settings persistence is broken for this session, which is the one
/// regression we'd otherwise hit silently.
fn resolve_port(log_dir: &Path) -> Option<u16> {
    match TcpListener::bind(("127.0.0.1", DESKTOP_PORT)) {
        Ok(listener) => {
            let port = listener.local_addr().ok()?.port();
            startup_log_line(log_dir, &format!("bound stable port {}", port));
            Some(port)
        }
        Err(e) => {
            startup_log_line(
                log_dir,
                &format!(
                    "WARN stable port {} unavailable ({}) — falling back to ephemeral. \
                     Settings WILL NOT persist across launches until the conflicting \
                     process is closed.",
                    DESKTOP_PORT, e
                ),
            );
            let listener = TcpListener::bind("127.0.0.1:0").ok()?;
            let addr = listener.local_addr().ok()?;
            startup_log_line(log_dir, &format!("bound ephemeral port {}", addr.port()));
            Some(addr.port())
        }
    }
}

/// Poll the loopback port until it accepts a TCP connection, up to `timeout`.
fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    let target = format!("127.0.0.1:{}", port);
    while start.elapsed() < timeout {
        if let Ok(addr) = target.parse::<std::net::SocketAddr>() {
            if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(150));
    }
    false
}

/// Resolve a named subdirectory inside the Tauri resources dir.
///
/// STORY-110 resolved the long-standing question about how Tauri v2
/// places globbed resources. Inspection of the signed MSI (msiinfo
/// export File/Directory tables against commit 5edb4e0) confirmed
/// that `"resources/**/*"` in array-form produces the NESTED layout:
/// files land at `<resource_dir>/resources/<name>/...`, preserving
/// the full relative path via `resource_relpath()` in
/// tauri-utils-2.8.3/src/resources.rs:216-219. The flat layout
/// (prefix stripped) only occurs with the map form + glob key, which
/// we intentionally do not use because it breaks local `cargo check`
/// on WSL where the gitignored staging dirs are empty.
///
/// We nevertheless keep the flat-layout probe as insurance: a future
/// Tauri upgrade could change the default, and the cost of the extra
/// `exists()` call is ~1µs on Windows. If this ever fires in
/// production, `log_dir_tree` will have already written the real
/// layout to `startup.log` so we can re-verify in seconds.
fn find_resource_subdir(resource_dir: &Path, name: &str) -> Option<PathBuf> {
    let flat = resource_dir.join(name);
    if flat.exists() {
        return Some(flat);
    }
    let nested = resource_dir.join("resources").join(name);
    if nested.exists() {
        return Some(nested);
    }
    None
}

/// Resolve the bundled Node.js binary inside the Tauri resources dir.
/// Build scripts place the Windows `node.exe` at `resources/node/node.exe`
/// and a Unix `node` (used only for Linux validation builds from WSL)
/// at `resources/node/bin/node`. `node_root` is the directory returned by
/// `find_resource_subdir(&resource_dir, "node")`.
fn node_binary_path(node_root: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        node_root.join("node.exe")
    } else {
        node_root.join("bin").join("node")
    }
}

/// Walk `dir` up to `max_depth` levels and append every entry to
/// startup.log. Used on the first boot after a fresh install so we
/// have an authoritative record of the on-disk resource layout
/// regardless of how Tauri v2 decides to place globbed files.
fn log_dir_tree(log_dir: &Path, root: &Path, label: &str, max_depth: usize) {
    startup_log_line(log_dir, &format!("---- {} tree ({}) ----", label, root.display()));
    fn walk(log_dir: &Path, dir: &Path, depth: usize, max_depth: usize) {
        if depth > max_depth {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) => {
                startup_log_line(log_dir, &format!("  read_dir({}) failed: {}", dir.display(), e));
                return;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let indent = "  ".repeat(depth + 1);
            let kind = if path.is_dir() { "dir " } else { "file" };
            startup_log_line(log_dir, &format!("{}{} {}", indent, kind, path.display()));
            if path.is_dir() {
                walk(log_dir, &path, depth + 1, max_depth);
            }
        }
    }
    walk(log_dir, root, 0, max_depth);
    startup_log_line(log_dir, "---- end tree ----");
}

/// Resolve the per-user log directory. Returns the app_data_dir joined with
/// "logs". Falls back to a tempdir if app_data_dir itself is unavailable,
/// because we'd rather write logs *somewhere* than panic our panic handler.
fn resolve_log_dir(app_data_dir: Option<PathBuf>) -> PathBuf {
    let base = app_data_dir.unwrap_or_else(std::env::temp_dir);
    base.join("logs")
}

/// Append a line to startup.log. Ignores I/O errors — the diagnostic log
/// must never be the thing that takes down the app.
fn startup_log_line(log_dir: &Path, line: &str) {
    let _ = std::fs::create_dir_all(log_dir);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("startup.log"))
    {
        let ts = chrono_like_timestamp();
        let _ = writeln!(f, "[{}] {}", ts, line);
    }
}

/// Tiny timestamp helper so we don't pull in `chrono` for one format call.
/// Format: seconds-since-epoch. Good enough for correlating log lines.
fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => format!("{}", d.as_secs()),
        Err(_) => "?".to_string(),
    }
}

/// Prune old crash logs — keep the N most-recent files, delete the rest.
/// Called once on startup so crash dirs don't grow unbounded.
fn prune_crash_logs(crash_dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(crash_dir) else { return };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let meta = std::fs::metadata(&p).ok()?;
            if meta.is_file() { Some((meta.modified().unwrap_or(std::time::UNIX_EPOCH), p)) } else { None }
        })
        .collect();
    if files.len() <= keep { return }
    files.sort_by_key(|(t, _)| *t);
    for (_, path) in files.iter().take(files.len() - keep) {
        let _ = std::fs::remove_file(path);
    }
}

/// Install a panic hook that writes the panic payload to startup.log AND a
/// dedicated crash file so Release builds leave a breadcrumb on crash.
/// `crash_dir` is `<log_dir>/crashes/`.
fn install_panic_hook(log_dir: PathBuf) {
    let crash_dir = log_dir.join("crashes");
    let _ = std::fs::create_dir_all(&crash_dir);
    prune_crash_logs(&crash_dir, 50);

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown location".to_string());

        // Write to startup.log (existing behaviour)
        startup_log_line(&log_dir, &format!("PANIC at {}: {}", loc, payload));

        // Write a dedicated timestamped crash file
        let ts = chrono_like_timestamp();
        let crash_path = crash_dir.join(format!("crash-{}.log", ts));
        if let Ok(mut f) = std::fs::File::create(&crash_path) {
            let bt = std::backtrace::Backtrace::force_capture();
            let _ = writeln!(f, "MashupForge crash report");
            let _ = writeln!(f, "version: {}", env!("CARGO_PKG_VERSION"));
            let _ = writeln!(f, "os: {} {}", std::env::consts::OS, std::env::consts::ARCH);
            let _ = writeln!(f, "timestamp: {}", ts);
            let _ = writeln!(f, "location: {}", loc);
            let _ = writeln!(f, "panic: {}", payload);
            let _ = writeln!(f, "---backtrace---\n{}", bt);
        }

        default_hook(info);
    }));
}

/// Show a Windows native MessageBox via user32.MessageBoxW.
/// No-op on non-Windows. Uses direct FFI so we avoid pulling a dialog
/// crate just for a startup error popup.
#[cfg(target_os = "windows")]
fn show_error_dialog(title: &str, body: &str) {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }
    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;

    let to_wide = |s: &str| -> Vec<u16> { OsStr::new(s).encode_wide().chain(once(0)).collect() };
    let wtitle = to_wide(title);
    let wbody = to_wide(body);
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wbody.as_ptr(),
            wtitle.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_error_dialog(_title: &str, _body: &str) {
    // No-op on non-Windows hosts — Linux validation builds don't need it.
}

/// Validate that every resource the sidecar needs is present on disk.
/// Returns a human-readable error with the first missing path.
fn preflight_resources(
    resource_dir: &Path,
    node_bin: &Path,
    start_js: &Path,
) -> Result<(), String> {
    if !resource_dir.exists() {
        return Err(format!(
            "resource_dir missing at {} — the installer may be corrupted",
            resource_dir.display()
        ));
    }
    if !node_bin.exists() {
        return Err(format!(
            "bundled Node.js missing at {} — rerun build-windows.ps1 step [3/7] (fetch-windows-node.ps1)",
            node_bin.display()
        ));
    }
    if !start_js.exists() {
        return Err(format!(
            "Node sidecar entry missing at {} — rerun build-windows.ps1 step [6/7] (copy-standalone-to-resources.ps1)",
            start_js.display()
        ));
    }
    let server_js = start_js.with_file_name("server.js");
    if !server_js.exists() {
        return Err(format!(
            "Next standalone server missing at {} — .next/standalone was not copied correctly",
            server_js.display()
        ));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        // tauri-plugin-log runs in BOTH debug and release so the installed
        // .msi leaves a diagnostic trail under
        // %APPDATA%\MashupForge\logs\. Previously this plugin was
        // debug-only, which meant Release crashes were completely silent
        // (no console thanks to `windows_subsystem = "windows"`, no log
        // file, no error dialog) — see STORY-080.
        // STORY-122 followup: opener plugin lets the UpdateBanner open the
        // GitHub release URL in the user's default browser instead of
        // asking them to copy-paste a text input. No capability churn
        // beyond the default permission set (see capabilities/default.json).
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("tauri".to_string()),
                    }),
                ])
                .build(),
        )
        .setup(|app| {
            // ---- step 0: set up observability FIRST so every subsequent
            // error gets logged. `app.path().app_data_dir()` is the same
            // folder tauri-plugin-log writes tauri.log into, which means
            // the panic hook and plugin agree on one output location.
            let app_data_dir = app.path().app_data_dir().ok();
            let log_dir = resolve_log_dir(app_data_dir.clone());
            let _ = std::fs::create_dir_all(&log_dir);
            install_panic_hook(log_dir.clone());

            startup_log_line(&log_dir, "=== MashupForge launcher starting ===");
            startup_log_line(
                &log_dir,
                &format!("build_mode={}", if cfg!(debug_assertions) { "debug" } else { "release" }),
            );

            // ---- step 1: resolve paths
            let resource_dir = match app.path().resource_dir() {
                Ok(d) => d,
                Err(e) => {
                    let msg = format!("resource_dir() failed: {}", e);
                    startup_log_line(&log_dir, &msg);
                    show_error_dialog(
                        "MashupForge — startup error",
                        &format!(
                            "Could not locate the app resources directory.\n\n{}\n\nLog: {}",
                            msg,
                            log_dir.display()
                        ),
                    );
                    return Err(e.into());
                }
            };
            startup_log_line(&log_dir, &format!("resource_dir = {}", resource_dir.display()));
            startup_log_line(&log_dir, &format!("log_dir      = {}", log_dir.display()));

            // Dump the full resource_dir tree on every launch so we have
            // an authoritative record of what the installer actually
            // shipped. Cheap (<1ms for a few hundred entries) and
            // priceless after a crash.
            log_dir_tree(&log_dir, &resource_dir, "resource_dir", 2);

            // Tauri v2 globbing may or may not strip the `resources/`
            // segment from `"resources/**/*"`. Probe both layouts.
            let node_root = match find_resource_subdir(&resource_dir, "node") {
                Some(p) => {
                    startup_log_line(&log_dir, &format!("node_root    = {}", p.display()));
                    p
                }
                None => {
                    let msg = format!(
                        "bundled Node.js dir not found under {} (checked /node and /resources/node) — installer is missing resources, rerun build-windows.ps1",
                        resource_dir.display()
                    );
                    startup_log_line(&log_dir, &format!("PREFLIGHT FAIL: {}", msg));
                    show_error_dialog(
                        "MashupForge — missing resource",
                        &format!(
                            "{}\n\nFull log: {}",
                            msg,
                            log_dir.join("startup.log").display()
                        ),
                    );
                    return Err(msg.into());
                }
            };
            let app_dir = match find_resource_subdir(&resource_dir, "app") {
                Some(p) => {
                    startup_log_line(&log_dir, &format!("app_dir      = {}", p.display()));
                    p
                }
                None => {
                    let msg = format!(
                        "Next standalone app dir not found under {} (checked /app and /resources/app) — installer is missing resources, rerun build-windows.ps1",
                        resource_dir.display()
                    );
                    startup_log_line(&log_dir, &format!("PREFLIGHT FAIL: {}", msg));
                    show_error_dialog(
                        "MashupForge — missing resource",
                        &format!(
                            "{}\n\nFull log: {}",
                            msg,
                            log_dir.join("startup.log").display()
                        ),
                    );
                    return Err(msg.into());
                }
            };
            let node_bin = node_binary_path(&node_root);
            let start_js = app_dir.join("start.js");

            startup_log_line(&log_dir, &format!("node_bin     = {}", node_bin.display()));
            startup_log_line(&log_dir, &format!("start_js     = {}", start_js.display()));

            // ---- step 2: pre-flight existence checks
            if let Err(msg) = preflight_resources(&resource_dir, &node_bin, &start_js) {
                startup_log_line(&log_dir, &format!("PREFLIGHT FAIL: {}", msg));
                show_error_dialog(
                    "MashupForge — missing resource",
                    &format!(
                        "The installer is missing a required file:\n\n{}\n\nFull log: {}",
                        msg,
                        log_dir.join("startup.log").display()
                    ),
                );
                return Err(msg.into());
            }

            // ---- step 3: pi.dev runtime install dir (user-writable)
            let app_data_dir_for_pi = app.path().app_data_dir()?;
            let pi_install_dir = app_data_dir_for_pi.join("pi");
            if let Err(e) = std::fs::create_dir_all(&pi_install_dir) {
                startup_log_line(
                    &log_dir,
                    &format!(
                        "could not create pi_install_dir {}: {}",
                        pi_install_dir.display(),
                        e
                    ),
                );
            }

            // ---- step 4: resolve loopback port (stable for IndexedDB
            // persistence, ephemeral fallback if the stable port is
            // already in use — see STORY-121).
            let port = match resolve_port(&log_dir) {
                Some(p) => p,
                None => {
                    let msg = "could not bind any 127.0.0.1 port";
                    startup_log_line(&log_dir, msg);
                    show_error_dialog(
                        "MashupForge — networking error",
                        &format!(
                            "Could not acquire a free local port on 127.0.0.1.\n\nLog: {}",
                            log_dir.join("startup.log").display()
                        ),
                    );
                    return Err(msg.into());
                }
            };
            startup_log_line(&log_dir, &format!("picked port {}", port));

            // ---- step 5: spawn sidecar with stdout/stderr piped to a log file
            //
            // In Release builds `windows_subsystem = "windows"` hides the
            // console, so `Stdio::inherit()` silently drops every console.log
            // the sidecar emits. We redirect both streams to sidecar.log
            // under the same log_dir so Maurice can grep it after a crash.
            let sidecar_log_path = log_dir.join("sidecar.log");
            let sidecar_log_file = match File::create(&sidecar_log_path) {
                Ok(f) => f,
                Err(e) => {
                    let msg = format!(
                        "could not create {}: {}",
                        sidecar_log_path.display(),
                        e
                    );
                    startup_log_line(&log_dir, &msg);
                    show_error_dialog("MashupForge — startup error", &msg);
                    return Err(msg.into());
                }
            };
            let sidecar_log_file_err = sidecar_log_file.try_clone().map_err(|e| {
                let m = format!("clone sidecar log handle: {}", e);
                startup_log_line(&log_dir, &m);
                m
            })?;

            let mut cmd = Command::new(&node_bin);
            cmd.arg(&start_js)
                .current_dir(&app_dir)
                .env("PORT", port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("HOST", "127.0.0.1")
                .env("NODE_ENV", "production")
                .env("MASHUPFORGE_RESOURCES_DIR", &resource_dir)
                .env("MASHUPFORGE_PI_DIR", &pi_install_dir)
                .env("MASHUPFORGE_LOG_DIR", &log_dir)
                .env("MASHUPFORGE_CRASH_DIR", log_dir.join("crashes"))
                .env("MASHUPFORGE_DESKTOP", "1")
                .stdout(Stdio::from(sidecar_log_file))
                .stderr(Stdio::from(sidecar_log_file_err));

            // Suppress the flashing console window on Windows release spawn.
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    let msg = format!(
                        "failed to spawn node sidecar at {}: {}",
                        node_bin.display(),
                        e
                    );
                    startup_log_line(&log_dir, &msg);
                    show_error_dialog(
                        "MashupForge — sidecar failed to start",
                        &format!(
                            "{}\n\nCheck {} for details.",
                            msg,
                            log_dir.join("startup.log").display()
                        ),
                    );
                    return Err(msg.into());
                }
            };

            startup_log_line(&log_dir, &format!("spawned sidecar pid={}", child.id()));

            app.state::<SidecarState>()
                .0
                .lock()
                .expect("sidecar state poisoned")
                .replace(child);

            // ---- step 6: wait for the server on a background thread,
            // then navigate the main window. While we wait, the window
            // keeps showing the frontend-stub loading screen.
            //
            // Timeout bumped from 30s to 60s: on freshly installed Program
            // Files builds, Windows Defender scans every .js on first
            // require(), and Next.js standalone boot on a cold filesystem
            // routinely crosses the 30s mark on lower-end hardware.
            let handle = app.handle().clone();
            let log_dir_bg = log_dir.clone();
            thread::spawn(move || {
                if wait_for_port(port, Duration::from_secs(60)) {
                    startup_log_line(
                        &log_dir_bg,
                        &format!("next server up on 127.0.0.1:{}", port),
                    );
                    let url_str = format!("http://127.0.0.1:{}", port);
                    match tauri::Url::parse(&url_str) {
                        Ok(url) => match handle.get_webview_window("main") {
                            Some(window) => {
                                if let Err(e) = window.navigate(url) {
                                    startup_log_line(
                                        &log_dir_bg,
                                        &format!("window.navigate failed: {}", e),
                                    );
                                }
                            }
                            None => startup_log_line(
                                &log_dir_bg,
                                "main window not found for navigation",
                            ),
                        },
                        Err(e) => startup_log_line(
                            &log_dir_bg,
                            &format!("parse sidecar url: {}", e),
                        ),
                    }
                } else {
                    startup_log_line(
                        &log_dir_bg,
                        "next server did not come up within 60s — see sidecar.log",
                    );
                    // Don't close the window — leave the loading screen
                    // visible so the user sees SOMETHING and can find
                    // logs rather than facing an instant exit.
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            log::info!("[tauri] killing sidecar pid={}", child.id());
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
