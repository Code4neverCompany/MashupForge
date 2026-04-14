use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, WindowEvent};

/// Holds the running Node sidecar child so we can kill it on window close.
struct SidecarState(Mutex<Option<Child>>);

/// Bind an ephemeral port, drop the listener, return the port number.
/// Small race window between pick and sidecar bind, but a single-process
/// desktop app on `127.0.0.1` makes that effectively impossible in practice.
fn pick_free_port() -> Option<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let addr = listener.local_addr().ok()?;
    Some(addr.port())
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

/// Resolve the bundled Node.js binary inside the Tauri resources dir.
/// Build scripts place the Windows `node.exe` at `resources/node/node.exe`
/// and a Unix `node` (used only for Linux validation builds from WSL)
/// at `resources/node/bin/node`.
fn node_binary_path(resource_dir: &PathBuf) -> PathBuf {
    if cfg!(target_os = "windows") {
        resource_dir.join("node").join("node.exe")
    } else {
        resource_dir.join("node").join("bin").join("node")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let resource_dir = app.path().resource_dir()?;
            let node_bin = node_binary_path(&resource_dir);
            let app_dir = resource_dir.join("app");
            let start_js = app_dir.join("start.js");

            // Runtime-install target for pi.dev. The Next sidecar's
            // /api/pi/install route reads MASHUPFORGE_PI_DIR as the npm
            // `--prefix` target, so this must point at a user-writable
            // location (never inside `resource_dir`, which is read-only
            // under Program Files on Windows). Create it eagerly so the
            // first install attempt doesn't race on mkdir.
            let app_data_dir = app.path().app_data_dir()?;
            let pi_install_dir = app_data_dir.join("pi");
            if let Err(e) = std::fs::create_dir_all(&pi_install_dir) {
                log::error!(
                    "[tauri] could not create pi install dir {}: {}",
                    pi_install_dir.display(),
                    e
                );
            }

            log::info!("[tauri] resource_dir:   {}", resource_dir.display());
            log::info!(
                "[tauri] node_bin:       {} (exists={})",
                node_bin.display(),
                node_bin.exists()
            );
            log::info!(
                "[tauri] start_js:       {} (exists={})",
                start_js.display(),
                start_js.exists()
            );
            log::info!(
                "[tauri] pi_install_dir: {} (exists={})",
                pi_install_dir.display(),
                pi_install_dir.exists()
            );

            let port = pick_free_port().ok_or("could not bind ephemeral 127.0.0.1 port")?;
            log::info!("[tauri] picked port {}", port);

            let mut cmd = Command::new(&node_bin);
            cmd.arg(&start_js)
                .current_dir(&app_dir)
                .env("PORT", port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("MASHUPFORGE_RESOURCES_DIR", &resource_dir)
                .env("MASHUPFORGE_PI_DIR", &pi_install_dir)
                .env("MASHUPFORGE_DESKTOP", "1")
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit());

            // Suppress the flashing console window on Windows release spawn.
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let child = cmd.spawn().map_err(|e| {
                format!(
                    "failed to spawn node sidecar at {}: {}",
                    node_bin.display(),
                    e
                )
            })?;

            log::info!("[tauri] spawned node sidecar pid={}", child.id());

            app.state::<SidecarState>()
                .0
                .lock()
                .expect("sidecar state poisoned")
                .replace(child);

            // Wait for the server to accept connections on a background
            // thread, then navigate the main window to the local URL.
            // While we wait, the window keeps showing the frontend-stub
            // loading screen.
            let handle = app.handle().clone();
            thread::spawn(move || {
                if wait_for_port(port, Duration::from_secs(30)) {
                    log::info!("[tauri] next server up on 127.0.0.1:{}", port);
                    let url_str = format!("http://127.0.0.1:{}", port);
                    match tauri::Url::parse(&url_str) {
                        Ok(url) => match handle.get_webview_window("main") {
                            Some(window) => {
                                if let Err(e) = window.navigate(url) {
                                    log::error!("[tauri] window.navigate failed: {}", e);
                                }
                            }
                            None => log::error!("[tauri] main window not found for navigation"),
                        },
                        Err(e) => log::error!("[tauri] parse sidecar url: {}", e),
                    }
                } else {
                    log::error!("[tauri] next server did not come up within 30s");
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
