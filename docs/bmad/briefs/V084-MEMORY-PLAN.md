# V084-MEMORY: LLM-Wiki Memory System Upgrade — Implementation Plan

## Current State (verified by agents)
- MEMORY.md: 2200 chars, pointers only ✓
- sessions/active.yaml: exists, needs enhancement
- sessions/recent/: exists, rolling 7-day
- Vault: 276 pages, 360 files, 100MB
- Qdrant: running, 4660 points, all-MiniLM-L6-v2, 384-dim
- PRE-TASK/POST-TASK hooks: implemented (E5)
- Vector refresh: weekly cron (Sunday 04:00)

## 4-Layer Architecture (Target)

### Layer 1: Hot Memory (MEMORY.md)
- Active rules + pointers only
- 2200 char limit, auto-pruned
- Status: ✓ working

### Layer 2: Working Memory (sessions/active.yaml + sessions/recent/)
- sessions/active.yaml: current agent state, active tasks, heartbeats
- sessions/recent/: rolling 7-day session summaries
- Enhancement: active.yaml needs richer agent state (current_task, task_started_at, last_heartbeat)
- Status: ⚠ exists, needs enhancement

### Layer 3: Knowledge Memory (vault)
- Structured wiki pages with frontmatter
- Cross-referenced via wikilinks
- Status: ✓ working (276 pages)

### Layer 4: Semantic Memory (Qdrant + hybrid search)
- Vector embeddings for all vault pages
- Hybrid BM25 + vector with RRF fusion
- Enhancement: per-write upsert (not just weekly refresh)
- Status: ⚠ exists, needs hybrid search + per-write upsert

## Implementation Tasks

### Task 1: Enhance active.yaml (Designer)
- Add current_task, task_started_at, last_heartbeat to agent_state
- Add fleet overlay to Hermes TUI for real-time status
- Write to ~/Documents/HermesVault/raw/agent-output/V084-ACTIVE-YAML.md

### Task 2: Hybrid Search (Developer)
- Add FTS5 index to Qdrant via sparse vectors
- Implement RRF fusion for BM25 + vector results
- Hook memory2vec-upsert into vault write path
- Fix 17s cold-start with long-lived embedder daemon
- Write to ~/Documents/HermesVault/raw/agent-output/V084-HYBRID-SEARCH.md

### Task 3: Fix QA Gaps (Developer)
- Fix vault_stats.total_pages (98 → 276)
- Create missing discovery files for dev + vault_keeper
- Clean WAL current-session.md boilerplate
- Write to ~/Documents/HermesVault/raw/agent-output/V084-QA-FIXES.md

### Task 4: Auto-Distillation Improvement (QA)
- Improve dream cycle entity extraction
- Add contradiction detection to POST-TASK handler
- Track knowledge growth metrics
- Write to ~/Documents/HermesVault/raw/agent-output/V084-DISTILLATION.md

## Success Metrics
- Query response time: <2s for hybrid search
- Distillation coverage: >80% of sessions filed to vault
- Knowledge growth: >10 new pages/week
- Stale page ratio: <10% of total pages
- Cold-start time: <1s (from 17s)
