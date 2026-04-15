# Wake-Up Research: Making Hermes Act Autonomously

**Task:** `wake-up-research`
**Date:** 2026-04-14
**Author:** Developer subagent

## The core constraint

Claude Code is a foreground REPL. Once it prints a turn and returns to the
prompt, the process is blocked on `read()` from its controlling TTY. It does
**not** poll files, it does **not** accept IPC on a socket, it does **not**
run background watchers inside its own event loop. Cron can write anything
it wants into `~/.hermes/`, but nothing in the Hermes process will notice
until *something puts bytes on its stdin*. Every workable "wake-up"
mechanism therefore reduces to one of two shapes:

1. **Inject stdin into a long-lived session** (tmux send-keys, screen stuff,
   ptyproxy, expect). Hermes keeps its memory, its context window, its
   scrollback.
2. **Spawn a fresh one-shot session on a trigger** (cron fires
   `claude -p "<prompt>"` or equivalent). Hermes has no memory except what
   the prompt re-injects from disk.

Everything below is a variant of one of those two shapes. I'll be blunt
about which ones are real and which are cargo-culted.

## 1. tmux send-keys to a Hermes tmux session — **WORKS**

This is the pattern every production "24/7 Claude" project uses. Hermes
runs inside a named tmux session; cron fires a shell script that calls
`tmux send-keys` against that session's pane.

```bash
# Cron line (every 10 minutes):
*/10 * * * * /home/maurice/.hermes/bin/nudge-hermes.sh

# nudge-hermes.sh:
#!/usr/bin/env bash
PROMPT="Tick received. Read ~/.hermes/queues/hermes.md and act on the top unchecked task."
tmux send-keys -t hermes:0 "$PROMPT" C-m  # C-m = Enter, more reliable than 'Enter'
```

**Gotchas found in practice:**
- Use `C-m` not the literal string `Enter`. Some tmux/Claude builds eat
  `Enter` as the word.
- Two-step send (text, then Enter) is more reliable than one-shot for
  long prompts — Claude Code's input buffer occasionally debounces fast
  concatenated input. Tmux-Orchestrator and ccgram both do a short sleep
  between the text send and the `C-m` send.
- Target the session by *name*, not index. `tmux send-keys -t hermes:0`
  breaks if the session gets renumbered; `tmux send-keys -t hermes` is
  safer when the session has a fixed name.
- Scrollback is a non-issue for correctness but a real issue for
  debugging — pipe `tmux capture-pane -pS -10000` to a log file if you
  want to see what Hermes saw.
- If Hermes is mid-turn when the inject happens, the text gets queued and
  fires after the current turn. That's usually fine; it's occasionally
  surprising.

**Production users:** [Tmux-Orchestrator](https://github.com/Jedward23/Tmux-Orchestrator)
(original), [Tmux-Orchestrator-Enhanced](https://github.com/AW2307/Tmux-Orchestrator-Enhanced-AW),
[ccgram](https://github.com/alexei-led/ccgram) (Telegram bridge),
[ccbot](https://github.com/six-ddc/ccbot), [claudecode-telegram](https://github.com/hanxiao/claudecode-telegram),
[teamclaude](https://github.com/albertnahas/teamclaude). This is the
de-facto industry standard for autonomous Claude Code.

## 2. inotifywait piped into tmux send-keys — **WORKS, but is just #1 with a watcher**

```bash
# Background daemon:
inotifywait -m -e create,modify ~/.hermes/agent-queue/hermes/ |
while read dir event file; do
  tmux send-keys -t hermes "Queue event: $file" C-m
done
```

**Verdict:** functionally equivalent to #1. The question is just whether
the *trigger* is time-based (cron) or event-based (file touch). Event-based
is nicer for low-latency reactions to Designer/Developer pushing artifacts.
**Gotcha:** `inotifywait` needs a `systemd --user` service or a
`@reboot` cron line to stay alive — it won't survive a WSL restart on
its own. Combine both: cron for periodic ticks, inotifywait for
event-driven nudges.

## 3. Unix Domain Socket — **DOES NOT WORK (for Hermes directly)**

Hermes-the-REPL cannot `accept()` on a socket while blocked on stdin.
You'd need an external injector process that listens on the socket and
then calls `tmux send-keys`. At which point the socket is pointless
ceremony — cron can call `tmux send-keys` directly. **Skip.**

## 4. WebSocket server — **DOES NOT WORK (same reason)**

Identical failure mode as #3. A persistent bidirectional connection
requires an event loop Hermes does not have. Again, you'd just build a
sidecar that send-keys into tmux, and the WebSocket is dead weight.
**Skip.** (Exception: if you replace Claude Code with a *custom harness*
built on the Anthropic SDK, you own the event loop and this becomes
viable. Out of scope here — that's rebuilding Hermes, not waking it up.)

## 5. Telegram / push-notification nudge — **HUMAN-IN-THE-LOOP, not autonomous**

A daemon decides Hermes should act, and sends Maurice a Telegram ping.
Maurice opens his phone and types into Hermes. This is a **notification**
pattern, not an autonomy pattern. It's valuable for "hey, a PR review is
waiting" but it does nothing for cron-driven 3am work. Calling it
"autonomous" is a category error. **Use it as an escalation channel, not
the primary wake-up.**

## 6. Claude Bridge — **ALREADY EXISTS IN THIS REPO**

There is a `~/.hermes/claude-bridge/` directory with `active/`,
`archive/`, `inbox/`, `outbox/` subdirectories and live YAML envelopes
(e.g. `1776110895.yaml`, a review request from Evey about carousel
support in Post-Ready). This is a **file-based request/response queue**
already wired into Hermes' workflow — the "bridge" half is a folder of
YAML files, not a socket.

There is no public "Claude Bridge" GitHub project that matches what this
directory does; it appears to be a Hermes-internal convention. The
upshot: **the envelopes exist, but nothing currently wakes Hermes when a
new envelope lands**. Solving wake-up means putting an inotifywait on
`claude-bridge/inbox/` that tmux-injects into the Hermes session —
which is mechanism #2 on top of existing infrastructure.

## 7. Paperclip-style / fresh-session heartbeat — **WORKS, different tradeoffs**

The pattern: cron (or systemd timer) spawns a *new* Claude Code process
with `-p` (print mode) or equivalent, passing a prompt that says
"read your state files, do one unit of work, exit". The new process
reads `~/.hermes/queues/hermes.md`, does the task, commits, exits.
Continuity lives entirely on disk (WAL, memory.md, queue, task-board).

```bash
*/15 * * * * cd ~ && claude -p "$(cat ~/.hermes/prompts/tick-prompt.md)" >> ~/.hermes/ticks.log 2>&1
```

**This is what Letta/MemGPT call a "heartbeat"** ([Letta heartbeats docs](https://docs.letta.com/guides/agents/heartbeats)),
though Letta's meaning is narrower: in Letta, a heartbeat is a
tool-call-chaining mechanism *inside one agent turn* (`request_heartbeat=true`
lets the agent chain another tool call). The *cron-spawned one-shot*
pattern is closer to what the [AutoGPT-era](https://github.com/Significant-Gravitas/AutoGPT)
community calls a "tick loop" or "autonomous cycle." "Paperclip-style"
is Maurice's personal term — the Paperclip skill in this env is a
control-plane API for agents, which is thematically related but not
the same mechanism. Call it **heartbeat** or **tick-loop** in shared
writing.

**Tradeoffs vs tmux:**
- Fresh session = fresh context window every tick. No drift, no runaway
  token costs, no "what was I doing" confusion. Cheaper.
- Fresh session = no in-memory scratchpad. Everything must be on disk.
  WAL + memory.md must be airtight or the agent forgets.
- Can't ask clarifying questions; each tick must be self-contained.
- Perfect for cron-driven routine work (standups, lint, doc fixes).
- Bad for multi-step investigations that span hours.

## Recommendation

**Use a hybrid. Both tmux send-keys AND heartbeat — they solve
different problems.**

### Primary: tmux send-keys into a persistent Hermes session (mechanism #1 + #2)

Hermes-the-person runs in a long-lived tmux session. Cron and
inotifywait are the two nudge sources, both funneling through
`tmux send-keys -t hermes C-m`:

- `*/10 * * * *` cron tick → injects "check queue, act on top unchecked item"
- inotifywait on `~/.hermes/claude-bridge/inbox/` → injects
  "new envelope: $file, read and dispatch"
- inotifywait on `~/.hermes/agent-push.fifo` → injects per-envelope
  notification (the FIFO is already the subagent-to-Hermes channel)

This preserves Hermes' working memory (scrollback, task-board state,
in-flight reasoning) which matters for the orchestration role. It's
also what every other production 24/7 Claude project does, so the
failure modes are well-understood.

### Secondary: heartbeat one-shots for scheduled bounded work (mechanism #7)

For tasks that are genuinely self-contained and don't need Hermes'
live context — daily standup generation, WAL rotation, queue
pruning, BMAD doc linting — spawn a fresh `claude -p` session from
cron. These are cheap, deterministic, and don't eat Hermes' context
budget. Think of them as serverless functions: stateless by design,
state lives on disk.

### Do not build

- **Socket/WebSocket servers (#3, #4).** They require an event loop
  Hermes doesn't have; every useful variant degrades into "sidecar
  calls tmux send-keys", so build the tmux send-keys path directly.
- **Telegram as primary wake-up (#5).** Keep it as an escalation
  channel for questions needing Maurice's decision, not as the
  trigger for routine work.

### Concrete next steps

1. Add `nudge-hermes.sh` to `~/.hermes/bin/` with the send-keys
   two-step pattern.
2. Add a `systemd --user` unit (or `@reboot` cron) that runs
   `inotifywait -m` on `claude-bridge/inbox/` and `agent-queue/hermes/`
   and calls `nudge-hermes.sh` on events.
3. Write a `~/.hermes/prompts/tick-prompt.md` for the heartbeat
   pattern — self-contained instructions that assume zero context.
4. Add cron entries: `*/10` for tmux tick, `0 9 * * *` for heartbeat
   standup, etc.
5. Add a `tmux capture-pane` logger that rotates every hour so
   debugging "why didn't Hermes act" is tractable.

## Sources

- [Tmux-Orchestrator (Jedward23)](https://github.com/Jedward23/Tmux-Orchestrator)
- [Tmux-Orchestrator-Enhanced (AW2307)](https://github.com/AW2307/Tmux-Orchestrator-Enhanced-AW)
- [ccgram — Telegram/tmux bridge](https://github.com/alexei-led/ccgram)
- [ccbot — Telegram/tmux bridge](https://github.com/six-ddc/ccbot)
- [claudecode-telegram (hanxiao)](https://github.com/hanxiao/claudecode-telegram)
- [teamclaude — autonomous sprint plugin](https://github.com/albertnahas/teamclaude)
- [smux — tmux config with agent-to-agent comms](https://github.com/ShawnPana/smux)
- [Letta heartbeats docs](https://docs.letta.com/guides/agents/heartbeats)
- [Rearchitecting Letta's Agent Loop](https://www.letta.com/blog/letta-v1-agent)
- [Tao of Tmux — scripting](https://tao-of-tmux.readthedocs.io/en/latest/manuscript/10-scripting.html)
- [tmux send-keys special sequences gist](https://gist.github.com/stephancasas/1c82b66be1ea664c2a8f18019a436938)
- [self-command MCP (Gemini CLI self-wake via tmux)](https://github.com/stevenAthompson/self-command)
