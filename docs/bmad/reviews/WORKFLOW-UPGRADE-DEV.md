# WORKFLOW-UPGRADE-DEV — Research Report

> ⚠️ **Status: research-only — superseded by E1–E4 implementation.** Parameter values in this doc (e.g. stall threshold = 5 min) may differ from the shipped implementation. See `E1-RELIABILITY.md` and `ARCHITECTURE-WORKFLOW-UPGRADE.md` for authoritative values.

**Author:** Developer subagent
**Date:** 2026-04-22
**Audience:** Hermes orchestrator + 3 Claude Code agents (Developer / Designer / TBD) + vault-keeper
**Brief:** `/tmp/hermes-task-developer.txt` — research patterns for the next iteration of our tmux fleet.

The fleet today: Hermes (Python orchestrator at `~/.hermes/`) writes per-agent FIFO envelopes and tick flags; agents run in long-lived tmux panes, poll their queue files (`~/.hermes/queues/<agent>.md`), and push back via `~/.hermes/agent-push.fifo`. State persists in JSON / markdown files; cron drops `tick`/`pause`/`standup`/`promote-discoveries` flags into `~/.hermes/agent-queue/<agent>/`.

This report covers five upgrade vectors. Each section is structured: **Pattern → Why it works → How we adopt it.**

---

## 1. Claude Code multi-agent best practices (tmux setups)

### Pattern

Anthropic shipped an experimental **Agent Teams** mode (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) in 2026 that auto-detects an existing tmux session and spawns each teammate into its own pane. One session becomes the **team lead** in *delegate mode* — restricted to coordination only, no code/test/edit tools — while teammates run independently with their own context windows and can message each other directly via a built-in `TeammateTool`. Recommended setup: tmux + `tmux -CC` (iTerm2 control mode) so each pane maps to a native tab/window.

The community pattern that predates and complements Agent Teams is **Itty Bitty / Shipyard / Swarm**: a thin orchestrator (Python or shell) that owns tmux session creation, names panes deterministically (`hermes`, `developer`, `designer`, `vault`), and writes structured envelopes to a shared queue/inbox dir. This is essentially what we already have.

### Why it works

- **Pane-per-agent visibility** is the single biggest win — you can scan all agents at a glance and spot a stuck one in seconds. Hidden background processes are debugged at 10× the cost.
- **Delegate mode** prevents the orchestrator from accidentally implementing things itself (a known failure mode for any LLM that has tools available).
- **Independent context windows** stop one agent's noisy compaction from poisoning another's reasoning trace.

### How we adopt it

Our current shape is very close to the recommended pattern. Concrete deltas to consider:

1. **Toggle delegate mode on Hermes itself.** Today Hermes can edit files (it wrote `arc-wiki-bridge.py` last week). If Hermes were *strictly* coordination-only, we'd remove a class of "Hermes silently fixed it instead of routing to Developer" surprises. Implementation: a settings flag in Hermes' system prompt + tool allowlist at startup.
2. **Try `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`** in a sandboxed tmux session before committing — it would replace our hand-rolled pane management with built-in `TeammateTool` messaging. If it works, we get back ~150 LOC of bash/python orchestration. If it doesn't, no harm done.
3. **Auto-kill orphan tmux sessions on Hermes exit.** Documented pitfall: Agent Teams sessions persist after orchestrator dies. Add a `trap EXIT` in the launcher that does `tmux kill-session -t hermes-fleet` if it owns the session.

Sources:
- [Orchestrate teams of Claude Code sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Multi-Agent tmux Setup — Dariusz Parys, Medialesson, Feb 2026](https://medium.com/medialesson/claude-code-multi-agent-tmux-setup-7361b71ff5c4)
- [IttyBitty for Multi-agent Claude Code — Adam Wulf](https://adamwulf.me/2026/01/itty-bitty-ai-agent-orchestrator/)
- [Shipyard — Multi-agent orchestration for Claude Code in 2026](https://shipyard.build/blog/claude-code-multi-agent/)
- [The Code Agent Orchestra — Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/)

---

## 2. Git worktree isolation for parallel agent work

### Pattern

**One task → one branch → one worktree → one agent.** Each worktree is a separate checked-out copy that shares the same `.git` object store but has its own working tree and HEAD. Changes in one worktree are invisible to siblings until an explicit merge — that invisibility *is* the safety primitive.

```bash
# Spawn an isolated worktree for a Developer task
git worktree add ../mashup-T123 -b dev/T123-fix-pipeline
# Hand the path to Developer; it operates there in isolation.
# When done, merge back:
cd <main-repo>
git merge dev/T123-fix-pipeline --no-ff
git worktree remove ../mashup-T123
git branch -d dev/T123-fix-pipeline
```

Claude Code shipped first-class `--worktree` / `EnterWorktree` tool support in early 2026; JetBrains 2026.1 (March) and VS Code (July 2025) both have UI. Our `Agent` tool already supports `isolation: "worktree"` per its schema.

### Why it works

- **No `.git/index.lock` contention.** With multiple agents on the same checkout, two agents staging files at the same instant collide on the lock file. Worktrees give each their own index.
- **No silent overwrites.** Agent A's mid-edit `useSettings.ts` doesn't blow away Agent B's same-file edit, because they're operating on physically distinct files.
- **No stale-context drift.** Each agent's `git status` reflects only its own changes; it can't be confused by another agent's in-flight work showing up as "uncommitted modifications" it didn't make.

### How we adopt it

1. **Default the `Agent` tool to `isolation: "worktree"` for any task touching code.** Hermes already has access to this — we should make it the default for Developer/Designer dispatches that include file edits, and only skip isolation for read-only research tasks.
2. **Add a `worktree-reaper` cron tick.** Failed runs leave orphaned worktrees. A nightly `git worktree prune` + check for branches with no commits is cheap insurance.
3. **Cap concurrency at 5 agents.** Industry consensus is the ceiling is 5–7 before disk consumption (~5GB per worktree on a 2GB repo) and merge-review overhead cancel out throughput gains. Our fleet is currently 4 — one slot of headroom.

Sources:
- [How to Use Git Worktrees for Parallel AI Agent Execution — Augment Code](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
- [Multi-Agent AI Coding Workflow: Git Worktrees That Scale — The Agentic Blog, Mar 2026](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/)
- [Git Worktrees Need Runtime Isolation for Parallel AI Agent Development — Penligent](https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/)
- [Git Worktrees: The Secret Weapon for Running Multiple AI Coding Agents in Parallel](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96)
- [AI Agents Need Their Own Desk, and Git Worktrees Give Them One — Towards Data Science](https://towardsdatascience.com/ai-agents-need-their-own-desk-and-git-worktrees-give-it-one/)

---

## 3. Self-healing: stuck detection, auto-recovery, timeouts

### Pattern

Three layered controls, applied per agent:

**Layer 1 — Watchdog limits.** Every agent task has a hard `max_steps` (industry default: 50) and `max_wall_time` (5 min for routine, 30 min for complex). Exceeding either kills the run cleanly and writes a `stalled` envelope.

**Layer 2 — Failure-aware retry.** Transient failures (HTTP 503, rate-limit 429, network blip, timeout) retry with exponential backoff (e.g., 1s → 2s → 4s → 8s, max 4 attempts). Permanent failures (auth error, schema error, semantic LLM refusal) escalate immediately — no retry.

**Layer 3 — Patrol loop.** A separate process (cron or systemd timer) inspects agent state every ~10s and:
- If `last_heartbeat > 5 min ago` → mark `stalled`, send `restart` flag.
- If `restart` count this hour > 3 → switch to `auto-fix → alert → human task` chain (don't restart-loop a broken agent).
- Cooldown between restarts prevents storms.

```python
# Sketch — patrol loop in ~/.hermes/scripts/patrol.py
THRESHOLD_STALLED = 300  # 5 min
RESTART_BUDGET = 3       # per agent per hour

for agent in AGENTS:
    state = json.loads((STATE_DIR / f"{agent}.json").read_text())
    age = time.time() - parse_iso(state["last_heartbeat"]).timestamp()
    if age > THRESHOLD_STALLED and state["status"] != "stalled":
        state["status"] = "stalled"
        write_flag(agent, "restart")
        bump_restart_counter(agent)
    if restart_count_last_hour(agent) > RESTART_BUDGET:
        push_envelope({"from": "patrol", "type": "escalate",
                       "agent": agent, "reason": "restart-storm"})
```

### Why it works

- **Bounded steps prevent the most common failure mode**: context overflow. An agent that needs >50 steps for one task is almost always in a bad reasoning loop — kill and re-decompose beats waiting it out.
- **Backoff with a hard cap** handles 90% of API-side flakes without human attention; the cap stops a broken upstream from spinning forever.
- **Cooldown + budget** is the difference between self-healing and crash-looping. Without a budget, a perma-broken agent restarts every 10s until the disk fills with logs.

### How we adopt it

Our current setup has heartbeats (`agent-state/<name>.json:last_heartbeat`) but no patrol. Concrete additions:

1. **`~/.hermes/scripts/patrol.py`** as above, fired by cron every minute. Reuses our existing state file format, adds restart accounting in a sidecar `~/.hermes/agent-state/restarts.json`.
2. **Per-task envelope timeout in Hermes.** When Hermes pushes a task to an agent's queue, also write an `expires_at` field. Patrol reaps expired tasks (`status: timed_out`, push `blocked` envelope back) so a frozen agent doesn't permanently block its queue.
3. **Escalation chain.** Today blocked items just sit in `proposals.md`. Add a tier: `blocked` → `auto-retry once` → `escalate to Hermes` → `surface to human via standup digest`.

Sources:
- [Building Self-Healing AI Agents with Claude API — Claude Lab](https://claudelab.net/en/articles/api-sdk/claude-api-self-healing-agent-production-patterns)
- [The Self-Healing Agent Pattern — DEV Community](https://dev.to/the_bookmaster/the-self-healing-agent-pattern-how-to-build-ai-systems-that-recover-from-failure-automatically-3945)
- [Building Self-Healing AI Agents: 7 Error Handling Patterns That Keep Your Agent Running at 3 AM — DEV Community](https://dev.to/techfind777/building-self-healing-ai-agents-7-error-handling-patterns-that-keep-your-agent-running-at-3-am-5h81)
- [Why Your AI Agent Crashes at 3 AM (And 4 Recovery Patterns That Fix It) — CipherBuilds](https://cipherbuilds.ai/blog/ai-agent-crash-recovery-patterns)
- [Algomox — Self-Healing Infrastructure: Agentic AI in Auto-Remediation Workflows](https://www.algomox.com/resources/blog/self_healing_infrastructure_with_agentic_ai/)

---

## 4. Event-driven vs polling — which is more reliable in practice?

### Pattern

**Event-driven wins for reliability AND throughput**, but requires a broker. The pattern: agents publish to topics on a central bus (Kafka, NATS, Redis Streams, or a local FIFO/socket); other agents subscribe to topics they care about. The broker handles delivery, persistence, and broadcast.

Key numbers from the literature:
- **70–90% latency reduction** vs polling (no wait-for-next-poll-tick).
- **Connection complexity drops from O(N²) to O(N)** — agents talk to the bus, not each other directly.
- **Decoupled lifecycles** — producers can publish and exit; subscribers read when they reconnect. Great for restart-prone agents.

### Why polling persists despite being worse

- **Simpler to debug.** A `tail -f queues/developer.md` is more legible than tracing a Kafka topic.
- **No new infrastructure.** A file-based queue works on day 1 with zero ops.
- **Ordering guarantees are trivial** (file order = event order); broker-level ordering needs partitioning discipline.

### How we adopt it

Honest assessment: **we are polling-heavy today** (cron-driven tick flags, queue file reads on every turn) and it works fine because our agent count (4) and tick frequency (~minute-scale) keep volume tiny. Pure event-driven would be over-engineered.

The pragmatic upgrade is **hybrid**:

1. **Keep polling for low-frequency lifecycle events** (cron ticks, standups, promote-discoveries). These are inherently scheduled, not event-driven.
2. **Switch the FIFO inbox to true event semantics.** Today `~/.hermes/agent-push.fifo` is one-way and Hermes only reads it on its own turn. Replace with:
   - A long-lived listener (`tail -f` + `jq` filter, or a tiny Python `select()` loop) that consumes envelopes the moment they're pushed.
   - On consume, immediately spawn the response (e.g., a `done` envelope from Developer triggers Hermes' next-task router *now*, not on the next tick).

```python
# ~/.hermes/scripts/inbox-listener.py — fires Hermes on envelope arrival
import json, subprocess, time
from pathlib import Path

INBOX = Path.home() / ".hermes" / "inbox.jsonl"
INBOX.touch(exist_ok=True)
with INBOX.open() as f:
    f.seek(0, 2)  # seek to end
    while True:
        line = f.readline()
        if not line:
            time.sleep(0.5)
            continue
        env = json.loads(line)
        # Route envelope to Hermes immediately
        subprocess.run(["tmux", "send-keys", "-t", "hermes",
                        f"/inbox-event {env['from']} {env['type']}", "Enter"])
```

3. **Defer Kafka/NATS until fleet > 10 agents.** The infra cost (broker uptime, monitoring, dead-letter queues) only pays off above that scale.

Sources:
- [The Future of AI Agents is Event-Driven — Sean Falconer](https://seanfalconer.medium.com/the-future-of-ai-agents-is-event-driven-9e25124060d6)
- [Event-Driven Architecture for AI Agents — Atlan](https://atlan.com/know/event-driven-architecture-for-ai-agents/)
- [Four Design Patterns for Event-Driven, Multi-Agent Systems — Confluent](https://www.confluent.io/blog/event-driven-multi-agent-systems/)
- [The Benefits of Event-Driven Architecture for AI Agent Communication — HiveMQ](https://www.hivemq.com/blog/benefits-of-event-driven-architecture-scale-agentic-ai-collaboration-part-2/)
- [The Event-Driven Agent Era — StreamNative](https://streamnative.io/blog/the-event-driven-agent-era-why-streams-matter-now)

---

## 5. Minimizing human input — auto-escalation and auto-routing

### Pattern

**Confidence-tiered routing.** Every agent decision carries an implicit or explicit confidence; only the lowest tier escalates to a human. Industry target: **10–15% of cases require human review**, the rest auto-resolve.

The decision tree:

```
Agent produces a candidate action
       │
       ├── HIGH confidence + low blast-radius  → execute autonomously (no review)
       ├── MEDIUM confidence OR medium blast-radius → execute, log for batch review
       ├── LOW confidence OR HIGH blast-radius → block, request approval
       └── No confidence (refusal/error)       → escalate to next-level agent
                                                   (not direct to human)
```

The second key pattern is **typed routing**: not all escalations go to the same place.
- Code/architecture questions → the lead Developer
- Build/CI failures → the platform agent (or autorestart)
- Security/auth/payments → human (always)
- Style/design → Designer
- Vault/memory inconsistencies → vault-keeper

### Why it works

- **Eliminates the bottleneck of "ask the human about everything."** A human reviewing 100% of agent actions caps throughput at human reading speed (~30s/decision = ~120/hr).
- **Typed routing means the right reviewer sees the question first.** A finance variance going to the engineering oncall is wasted; a 503 going to the CFO is wasted. Match the question to the queue.
- **Blast-radius gating is the asymmetry that matters.** "Rename a local variable" wrong is cheap to undo; "rotate prod credentials" wrong is catastrophic. Confidence is necessary but not sufficient — multiply by reversibility.

### How we adopt it

Our current setup already has a **routine vs complex** split (CLAUDE.md). The upgrade is to make it richer and more automatic:

1. **Add a `confidence` field to every agent envelope.** Self-rated 0.0–1.0; agents that don't know default to 0.5. Hermes routes:
   - `> 0.8 + routine` → auto-approve, agent executes
   - `0.5–0.8` → auto-approve but log for batch review (daily standup digest)
   - `< 0.5 OR complex` → push to `proposals.md` for human review
2. **Typed escalation queues.** Today everything funnels through `proposals.md`. Split into:
   - `~/.hermes/proposals/code.md` (Developer / Designer disputes)
   - `~/.hermes/proposals/infra.md` (CI, hooks, configs)
   - `~/.hermes/proposals/human.md` (security, payments, brand decisions)
3. **Auto-route based on classification, not by hand.** Hermes should pattern-match the envelope's `task` field against a routing table, not require the human to triage.
4. **Batch the standup digest.** Instead of paging the human every time something pauses, accumulate `medium-confidence` decisions and `blocked` items, then surface them once per morning standup.

```python
# ~/.hermes/scripts/route.py — sketch
ROUTING_TABLE = [
    (re.compile(r"auth|payment|secret|credential"), "human"),
    (re.compile(r"build|ci|hook|config"),           "infra"),
    (re.compile(r"design|color|layout"),            "designer"),
    (re.compile(r".*"),                             "developer"),  # default
]

def route(envelope):
    if envelope["confidence"] >= 0.8 and envelope["classification"] == "routine":
        return "auto-approve"
    target = next(t for pat, t in ROUTING_TABLE if pat.search(envelope["task"]))
    if target == "human":
        return "human-now"
    return f"queue:{target}"  # routes to that agent's queue, not human
```

Sources:
- [Human-in-the-Loop SAP Agents: Approval, Escalation, and Audit — SAP Community](https://community.sap.com/t5/artificial-intelligence-blogs-posts/human-in-the-loop-sap-agents-approval-escalation-and-audit-series-2-part-5/ba-p/14372994)
- [Enforcing Human-in-the-Loop Controls for AI Agents — Prefactor](https://prefactor.tech/learn/enforcing-human-in-the-loop-controls)
- [Human-in-the-Loop: A 2026 Guide to AI Oversight — Strata](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
- [The Multi-Agent Trap — Towards Data Science](https://towardsdatascience.com/the-multi-agent-trap/)
- [Multi-Agent System Architecture Guide for 2026 — ClickIT Tech](https://www.clickittech.com/ai/multi-agent-system-architecture/)

---

## Combined adoption plan (ordered by leverage / cost)

| # | Change | Effort | Risk | Payoff |
|---|---|---|---|---|
| 1 | Inbox listener (true event semantics for FIFO) | S | Low | Cuts response latency from minutes to seconds |
| 2 | Patrol loop with timeout + restart budget | S | Low | Eliminates "agent silently froze" debugging |
| 3 | Default `Agent` dispatches to `isolation: "worktree"` | S | Low | Removes whole class of file-collision incidents |
| 4 | Confidence + typed routing in envelopes | M | Med | Cuts human-review volume by ~5× per the 10–15% target |
| 5 | Try `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in sandbox | S | Low | May replace ~150 LOC of orchestration if it works |
| 6 | Per-agent worktree-reaper cron | S | Low | Prevents disk drift over weeks |
| 7 | Delegate-mode lockdown for Hermes | M | Med | Forces clean separation of orchestration vs implementation |
| 8 | Kafka/NATS broker | L | High | **Skip until fleet > 10 agents** |

Items 1–3 are the highest-leverage, lowest-risk wins and could ship in one Hermes self-improvement cycle. Items 4 and 7 are cultural/structural and warrant a proposal-and-discussion loop before implementing.

---

## Sources (consolidated)

### Multi-agent tmux orchestration
- [Orchestrate teams of Claude Code sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Multi-Agent tmux Setup — Medialesson, Feb 2026](https://medium.com/medialesson/claude-code-multi-agent-tmux-setup-7361b71ff5c4)
- [IttyBitty for Multi-agent Claude Code — Adam Wulf](https://adamwulf.me/2026/01/itty-bitty-ai-agent-orchestrator/)
- [Shipyard Multi-agent orchestration for Claude Code in 2026](https://shipyard.build/blog/claude-code-multi-agent/)
- [The Code Agent Orchestra — Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/)
- [Claude Code Swarm Orchestration Skill — gist](https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea)

### Git worktrees
- [How to Use Git Worktrees for Parallel AI Agent Execution — Augment Code](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
- [Multi-Agent AI Coding Workflow: Git Worktrees That Scale — Mar 2026](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/)
- [Git Worktrees Need Runtime Isolation for Parallel AI Agent Development — Penligent](https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/)
- [Using Git Worktrees for Multi-Feature Development with AI Agents — Nick Mitchinson](https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/)
- [AI Agents Need Their Own Desk — Towards Data Science](https://towardsdatascience.com/ai-agents-need-their-own-desk-and-git-worktrees-give-it-one/)
- [Git Worktrees: Secret Weapon for Multiple AI Coding Agents in Parallel](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96)

### Self-healing
- [Building Self-Healing AI Agents with Claude API — Claude Lab](https://claudelab.net/en/articles/api-sdk/claude-api-self-healing-agent-production-patterns)
- [The Self-Healing Agent Pattern — DEV Community](https://dev.to/the_bookmaster/the-self-healing-agent-pattern-how-to-build-ai-systems-that-recover-from-failure-automatically-3945)
- [Building Self-Healing AI Agents: 7 Error Handling Patterns — DEV Community](https://dev.to/techfind777/building-self-healing-ai-agents-7-error-handling-patterns-that-keep-your-agent-running-at-3-am-5h81)
- [Why Your AI Agent Crashes at 3 AM — CipherBuilds](https://cipherbuilds.ai/blog/ai-agent-crash-recovery-patterns)
- [Self-Healing Infrastructure: Agentic AI in Auto-Remediation Workflows — Algomox](https://www.algomox.com/resources/blog/self_healing_infrastructure_with_agentic_ai/)

### Event-driven vs polling
- [The Future of AI Agents is Event-Driven — Sean Falconer](https://seanfalconer.medium.com/the-future-of-ai-agents-is-event-driven-9e25124060d6)
- [Event-Driven Architecture for AI Agents — Atlan](https://atlan.com/know/event-driven-architecture-for-ai-agents/)
- [Four Design Patterns for Event-Driven, Multi-Agent Systems — Confluent](https://www.confluent.io/blog/event-driven-multi-agent-systems/)
- [The Benefits of Event-Driven Architecture for AI Agent Communication — HiveMQ](https://www.hivemq.com/blog/benefits-of-event-driven-architecture-scale-agentic-ai-collaboration-part-2/)
- [The Event-Driven Agent Era — StreamNative](https://streamnative.io/blog/the-event-driven-agent-era-why-streams-matter-now)

### Human-in-the-loop / auto-routing
- [Human-in-the-Loop SAP Agents: Approval, Escalation, and Audit — SAP Community](https://community.sap.com/t5/artificial-intelligence-blogs-posts/human-in-the-loop-sap-agents-approval-escalation-and-audit-series-2-part-5/ba-p/14372994)
- [Enforcing Human-in-the-Loop Controls for AI Agents — Prefactor](https://prefactor.tech/learn/enforcing-human-in-the-loop-controls)
- [Human-in-the-Loop: A 2026 Guide to AI Oversight — Strata](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
- [The Multi-Agent Trap — Towards Data Science](https://towardsdatascience.com/the-multi-agent-trap/)
- [Multi-Agent System Architecture Guide for 2026 — ClickIT Tech](https://www.clickittech.com/ai/multi-agent-system-architecture/)
