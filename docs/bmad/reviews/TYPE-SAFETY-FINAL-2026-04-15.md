---
name: Type Safety Final Pass — 2026-04-15
description: Complete elimination of any annotations across all API routes and hooks
type: review
---
# Type Safety Final Pass — 2026-04-15

**Date:** 2026-04-15
**Author:** developer
**Status:** DONE (1 item pending Hermes approval)

## Summary

Completed the `any` → `unknown` sweep across the full codebase. Started session
with ~20 `any` annotations; ended with exactly **1** (pending approval).

## What was fixed this session

| Commit | Change |
|--------|--------|
| `06df852` | BestTimesWidget, Sidebar, 4 API routes |
| `1b62c3f` | pi-client dispatchEvent, post route mediaIds |
| `66f6492` | window.aistudio typed without as-any |
| `382f0c9` | parseJsonOrThrow → Record<string,unknown> + apiErrMsg helper |
| `043894d` | aiClient SSE JSON.parse casts |
| `c8a120f` | Pinterest pinData cast |
| `41976f7` | Pinterest uguu upload responses |
| `c8b1b83` | Instagram best-times IgMediaPost interface |
| `6f3965a` | Leonardo createData + GraphQL error handling |
| `334bbe5` | Trending SearxResponse + RedditResponse interfaces |

## Bug fixes shipped alongside

| Commit | Fix |
|--------|-----|
| `fd274ea` | AUDIT-007a: stale model previews on options change |
| `ba2a547` | AUDIT-008: Toast timer ref staleness in cleanup |
| `04c4d2f` | AUDIT-009: missing useCallback deps in usePipeline |

## Dead code removed

| Commit | Removed |
|--------|---------|
| `faa4de2` | hooks/use-mobile.ts, lib/utils.ts (never imported) |
| `91067e3` | APIErrorFallback component (never imported) |
| `1d41571` | generateImages dead prop from UsePipelineDeps |

## Remaining `any` — 1 item

`lib/aiClient.ts:130` — `extractJsonFromLLM` return type.

**Status:** PROP-013 pending Hermes approval. Option B (overloaded signatures)
recommended — 8/12 callers would get correct types automatically. The 4 remaining
callers would need explicit casts when switching from `any` to inferred types.

**Risk:** Callers in MainContent.tsx, useImageGeneration.ts, usePipeline.ts access
properties directly off the result without narrowing. Post-approval cleanup will
require ~20 property-access casts across 3 files.

## Proposals pending

- **PROP-013**: extractJsonFromLLM overloads (Option B)
- **PROP-014**: usePipeline saveImage/generateComparison memoization
- **PROP-012**: prune 8 unused npm packages
