# Technical Research: Agent Wake-Up & Orchestration Mechanisms

**Agent:** QA (Quinn)
**Date:** 2026-04-14
**Purpose:** Evaluate technical options for triggering agent wake-up on file change or schedule — informing potential Hermes autoloop improvements.

---

## 1. Python `watchdog` — Cross-Platform File System Monitoring

**How it works:** Wraps platform-native APIs (inotify on Linux, FSEvents on macOS, ReadDirectoryChangesW on Windows) behind a unified Observer/Handler pattern. Subclass `FileSystemEventHandler`, override `on_modified`/`on_created`/`on_deleted`, attach to an `Observer` background thread.

```python
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class MyHandler(FileSystemEventHandler):
    def on_modified(self, event):
        # event.src_path, event.is_directory
        ...

observer = Observer()
observer.schedule(MyHandler(), path="/watched/dir", recursive=False)
observer.start()
```

**Latency:** Near-instant on Linux (inotify-backed). `PollingObserver` fallback for NFS/CIFS adds configurable poll interval (default 1 s).

**Cross-platform:** Yes. Falls back to polling for network filesystems — explicit opt-in required.

**Pros:** Pure Python, pip-installable, works on Linux/macOS/Windows, handles recursive watches cleanly.

**Cons:** Thread-based, not async-native. On Linux it's just a wrapper around inotify — adds overhead vs. direct inotify. CIFS/NFS requires manual fallback.

---

## 2. pyinotify / asyncinotify — Direct Linux inotify Interface

**How it works:** Direct Python binding to the Linux kernel `inotify` subsystem (kernel 2.6.13+). The kernel delivers file-change events via a file descriptor — zero polling, zero busy-wait.

```python
# Classic pyinotify
import pyinotify

wm = pyinotify.WatchManager()
mask = pyinotify.IN_MODIFY | pyinotify.IN_CREATE | pyinotify.IN_CLOSE_WRITE

class EventHandler(pyinotify.ProcessEvent):
    def process_IN_CLOSE_WRITE(self, event):
        ...

notifier = pyinotify.Notifier(wm, EventHandler())
wm.add_watch('/watched/path', mask, rec=True)
notifier.loop()
```

**asyncio-native option (recommended over pyinotify):**
```python
# asyncinotify — modern path
from asyncinotify import Inotify, Mask

async def watch():
    with Inotify() as inotify:
        inotify.add_watch('/watched/path', Mask.CLOSE_WRITE | Mask.CREATE)
        async for event in inotify:
            # event.path, event.mask
            ...
```

**Latency:** Sub-millisecond. Kernel pushes events directly — no polling interval.

**Note on event mask:** Prefer `IN_CLOSE_WRITE` over `IN_MODIFY`. `IN_MODIFY` fires on every write syscall (including partial writes mid-file); `IN_CLOSE_WRITE` fires once when the file descriptor is closed after writing — the file is complete at that point. Critical distinction for artifact handoff use.

**Linux-only:** Hard constraint.

**Pros:** Lowest latency of all file-watching approaches; kernel-native; asyncinotify is async-native; supports granular event masks.

**Cons:** Linux-only (no macOS/Windows). Original pyinotify is unmaintained — use asyncinotify.

---

## 3. systemd Path Units — Kernel-Level File Trigger Without Userspace Daemon

**How it works:** A `.path` unit monitors a file or directory using inotify internally. When the condition is met, systemd activates a paired `.service` unit. No userspace polling.

```ini
# /etc/systemd/system/myagent.path
[Unit]
Description=Watch for agent task file

[Path]
PathChanged=/home/hermes/.hermes/agent-queue/developer/tick
Unit=myagent.service

[Install]
WantedBy=multi-user.target
```

**Available directives:**

| Directive | Triggers when |
|---|---|
| `PathExists=` | Path appears (file or dir created) |
| `PathChanged=` | File closed after write (not every write) |
| `PathModified=` | Any write, including partial |
| `DirectoryNotEmpty=` | Directory gains content |

**Known bugs / caveats:**
- `PathExists=` can trigger continuously on some systemd versions, causing CPU spin ([issue #16669](https://github.com/systemd/systemd/issues/16669))
- `PathExists=` does NOT trigger if the file already exists at unit activation ([issue #19123](https://github.com/systemd/systemd/issues/19123))
- Rapid create/delete cycles may be coalesced — not every event guaranteed to fire a service start
- Adds ~10–50 ms service-start overhead per trigger (fork/exec of the `.service`)

**Latency:** Effectively inotify latency for the kernel event, plus ~10–50 ms for process startup.

**Pros:** No userspace daemon needed; integrates with journald; supports `Persistent=true` for missed-event recovery on reboot; OS-managed process lifecycle.

**Cons:** Linux/systemd only; edge-case bugs in rapid file churn; adds per-trigger startup cost; harder to debug than Python code.

---

## 4. asyncio Unix Domain Socket — Push-Based IPC

**How it works:** A watcher (inotify or watchdog) detects file changes and pushes a notification over a Unix domain socket to a sleeping agent process. The agent holds an open asyncio connection and wakes instantly on data arrival — no fork/exec, no cold start.

```python
# Agent side — waits for wakeup signals
import asyncio

async def handle_wakeup(reader, writer):
    data = await reader.read(100)  # e.g. b'tick' or b'STORY-020'
    writer.close()
    await process_task(data.decode())

server = await asyncio.start_unix_server(handle_wakeup, path='/tmp/hermes-agent.sock')
async with server:
    await server.serve_forever()

# Watcher/cron side — sends wakeup (any language/process)
reader, writer = await asyncio.open_unix_connection('/tmp/hermes-agent.sock')
writer.write(b'tick')
await writer.drain()
writer.close()
```

**Latency:** Sub-millisecond in-kernel Unix socket delivery. Agent process stays resident — no cold start overhead.

**Pros:** Agent stays alive in memory; decouples watcher from agent logic; composable (any process can send the wakeup, including shell scripts); bidirectional (agent can ACK); asyncio-native; works on Linux and macOS.

**Cons:** Requires a persistent agent process; socket file lifecycle management needed (cleanup on crash/restart); more setup than a simple file watch.

---

## 5. POSIX Signals (SIGUSR1) — Interrupt a Running Process

**How it works:** A watcher or cron job sends `SIGUSR1` to a known agent PID. The agent registers a signal handler via Python's `signal` module and wakes from `signal.pause()` or its asyncio event loop.

```python
import signal

def handle_wakeup(signum, frame):
    do_work()  # called synchronously in signal context — keep it short

signal.signal(signal.SIGUSR1, handle_wakeup)
signal.pause()  # sleeps until any signal arrives — zero CPU

# asyncio-compatible version (preferred):
loop = asyncio.get_event_loop()
loop.add_signal_handler(signal.SIGUSR1, schedule_work)
```

**Sending from cron or watcher:**
```bash
kill -USR1 $(cat /var/run/hermes-agent.pid)
# or: kill -USR1 $(pgrep -f hermes_agent.py)
```

**Latency:** Signal delivery is kernel-synchronous — microseconds from `kill()` to handler entry.

**Pros:** Simplest wakeup for a long-running process; zero dependencies; works with any scheduler or watcher as the trigger; asyncio integrates cleanly via `add_signal_handler`.

**Cons:** Requires a stable PID file; signals are NOT queued — rapid signals collapse to one delivery; no payload (agent must inspect files to know what changed); `signal.pause()` blocks the asyncio event loop (use `add_signal_handler` to avoid this).

---

## 6. cron vs. systemd Timers — Time-Based Wake-Up

**Cron:** Classic `* * * * *` syntax, minimum 1-minute granularity. Spawns a new process each tick. No missed-job recovery — silently skips if system is off.

**systemd Timers:** `.timer` + `.service` pair. Strictly superior for agent use:

| Feature | cron | systemd timer |
|---|---|---|
| Missed job recovery | No | Yes (`Persistent=true`) |
| Single-instance guarantee | No | Yes |
| Sub-minute granularity | No | Yes (`OnUnitActiveSec=10s`) |
| Stdout/stderr logging | Manual redirect | Automatic (journald) |
| Dependency on other units | No | Yes |
| Boot-relative scheduling | No | Yes (`OnBootSec=`) |

```ini
# /etc/systemd/system/hermes-tick.timer
[Timer]
OnCalendar=*:*:0/30      # every 30 seconds
Persistent=true
Unit=hermes-tick.service

[Install]
WantedBy=timers.target
```

**Signal + timer pattern:** Either cron or a systemd timer can send `kill -USR1 <pid>` to a resident agent rather than launching a new process — combining timer precision with signal latency.

---

## Comparison Table

| Mechanism | Latency | Linux-only | Persistent process | Async-native | Complexity |
|---|---|---|---|---|---|
| watchdog | ~1 ms (inotify) | No | Yes (thread) | No | Low |
| asyncinotify | sub-ms (kernel) | Yes | Yes | Yes | Medium |
| systemd path unit | sub-ms + ~50 ms startup | Yes | No | N/A | Low–Med |
| Unix socket (asyncio) | sub-ms | No (Linux + macOS) | Yes | Yes | Medium |
| POSIX signal (SIGUSR1) | microseconds | No | Yes | Via `add_signal_handler` | Low |
| cron | ~1 min min. | No | No | N/A | Low |
| systemd timer | flexible (seconds+) | Yes | No | N/A | Low–Med |

---

## Recommendation for Hermes Autoloop

The current setup (tick.sh every 1 minute via cron) has ~60 s worst-case latency. Three upgrade paths in order of complexity:

**Option A — Drop-in improvement (minimal change):**
Replace cron tick with a systemd timer at `OnCalendar=*:*:0/15` (every 15 s) with `Persistent=true`. Add `kill -USR1 <pid>` to fire the existing agent logic. Reduces worst-case wake latency to 15 s with no architecture change.

**Option B — File-drop triggers (medium change):**
Wire `asyncinotify` (Linux, sub-ms) or `watchdog` (cross-platform) to watch `~/.hermes/agent-queue/developer/`. On `IN_CLOSE_WRITE` event, push a Unix socket message to the agent process. Agent wakes in <1 ms of flag file landing. Eliminates the tick interval entirely for file-triggered work.

**Option C — Full event-driven (larger change):**
Persistent asyncio agent process with `add_signal_handler(SIGUSR1)` + Unix socket server. Watcher (asyncinotify) and systemd timer both send to the same socket. Agent processes events from a unified queue. Sub-millisecond response to file drops; timer-based heartbeats for health checks.

**QA note:** `IN_CLOSE_WRITE` is the correct inotify event for artifact handoffs — fires once when the writing process closes the file, guaranteeing the artifact is complete. Using `IN_MODIFY` risks reading a partial file mid-write.

---

## Sources

- [Mastering File System Monitoring with Watchdog](https://developer-service.blog/mastering-file-system-monitoring-with-watchdog-in-python/)
- [watchdog PyPI](https://pypi.org/project/watchdog/)
- [asyncinotify documentation](https://asyncinotify.readthedocs.io/en/latest/)
- [Linode: Monitor Filesystem Events with Pyinotify](https://www.linode.com/docs/guides/monitor-filesystem-events-with-pyinotify/)
- [freedesktop.org systemd.path manpage](https://www.freedesktop.org/software/systemd/man/latest/systemd.path.html)
- [Path-Based Activation — SergeantBiggs Blog](https://blog.sergeantbiggs.net/posts/systemd-path-based-activation/)
- [Using systemd Path Units — Putorius](https://www.putorius.net/systemd-path-units.html)
- [PathExists CPU hog issue #16669](https://github.com/systemd/systemd/issues/16669)
- [Python asyncio Streams docs](https://docs.python.org/3/library/asyncio-stream.html)
- [SuperFastPython: Asyncio Echo Unix Socket Server](https://superfastpython.com/asyncio-echo-unix-socket-server/)
- [Python signal module docs](https://docs.python.org/3/library/signal.html)
- [Stop using cron — Systemd Timers Explained](https://coady.tech/systemd-timer-vs-cron/)
- [Why I Prefer systemd Timers — Thomas Stringer](https://trstringer.com/systemd-timer-vs-cronjob/)
- [Cron Jobs and Systemd Timers — dasroot.net (Mar 2026)](https://dasroot.net/posts/2026/03/cron-jobs-systemd-timers-scheduling-tasks/)
