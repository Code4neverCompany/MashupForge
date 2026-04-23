# V084-MEMORY: LLM-Wiki Memory System Upgrade

## Summary
Upgrade the 3-layer memory system to 4 layers with semantic search, auto-distillation, and cross-notebook synthesis.

## Current State (3 layers)
1. **MEMORY.md** (2200 chars) - Pointers + active rules
2. **Session logs** (raw) - Unstructured session data
3. **Vault** (Obsidian) - Structured wiki pages

## Proposed 4-Layer Architecture

### Layer 1: Hot Memory (MEMORY.md)
- Active rules, current context, pointers
- 2200 char limit, auto-pruned
- Loaded on every session start

### Layer 2: Working Memory (sessions/active.yaml + recent sessions)
- Current session state (agent status, active tasks)
- Recent session summaries (last 7 days)
- Auto-updated by vault-keeper
- Fast access, structured YAML

### Layer 3: Knowledge Memory (vault)
- Structured wiki pages with frontmatter
- Cross-referenced via wikilinks
- Maintained by vault-keeper agent
- Unlimited capacity

### Layer 4: Semantic Memory (vector store + FTS)
- Embeddings for all vault pages
- Fast semantic search across entire knowledge base
- FTS5 for keyword search
- Cross-notebook synthesis via NotebookLM

## Improvements Needed

### 1. Auto-Distillation Pipeline
- Session logs → vault pages automatically
- Dream cycle already does this partially
- Need: better entity extraction, contradiction detection, cross-reference updates

### 2. Semantic Search Layer
- Embed vault pages into vector store (Qdrant or SQLite + FTS5)
- Enable semantic queries across entire knowledge base
- Replace grep-based search with embedding similarity

### 3. Working Memory Layer
- Structured YAML for current session state
- Auto-updated on every agent state change
- Fast access without reading full vault

### 4. Cross-Notebook Synthesis
- NotebookLM integration for external research
- Upload vault pages to notebooks for synthesis
- Query across internal + external knowledge

### 5. Memory Health Monitoring
- Auto-detect stale pages (>30 days without update)
- Auto-archive deprecated content
- Track knowledge growth metrics

## Implementation Plan

### Phase 1: Working Memory Layer
- Create sessions/active.yaml schema
- Update vault-keeper to maintain working memory
- Add working memory to startup checklist

### Phase 2: Semantic Search
- Set up Qdrant or SQLite + FTS5
- Embed vault pages on creation/update
- Add semantic search to vault-keeper queries

### Phase 3: Auto-Distillation
- Improve dream cycle entity extraction
- Add contradiction detection
- Auto-update cross-references

### Phase 4: Cross-Notebook Synthesis
- Fix NotebookLM authentication
- Create master notebook for vault
- Add auto-sync pipeline

## Success Metrics
- Query response time: <2s for semantic search
- Distillation coverage: >80% of sessions filed to vault
- Knowledge growth: >10 new pages/week
- Stale page ratio: <10% of total pages
