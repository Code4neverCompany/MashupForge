---
task_id: SCHED-POST-ROBUST
from_agent: dev
status: BLOCKED
created: 2026-04-27
project: mashupforge
type: block_report
confidence: 0.95
---

# SCHED-POST-ROBUST — Block Report

**Status:** BLOCKED on missing infra + missing brief. Task cannot be executed as specified without architectural decisions that exceed a single-task scope.

## What the queue spec asked for

> "Create app/api/social/cron-fire/route.ts: Read data/queue.json (V091 atomic queue), Filter status=scheduled AND now >= date+time, Atomically claim via mutateQueue() pattern, executePost() each due post."

## What I found in the repo

| Spec premise | Actual state | Verified by |
|---|---|---|
| Brief at `docs/bmad/briefs/scheduled-post-robustness.md` | **Does not exist** | `ls docs/bmad/briefs/` — only pipeline-continuous-v2.md, qol-improvements.md, V08x briefs etc. |
| `data/queue.json` server-side queue | **Does not exist anywhere** in the repo | `find . -name queue.json` returns only node_modules build artifacts |
| "V091 atomic queue" with `mutateQueue()` | **Does not exist.** V091 in this repo is `PIPELINE-CONT-V2` (autonomous week-fill of pipeline ideas), not a post queue. | `git log --all` for V091; `grep -r mutateQueue` returns one comment in `lib/pipeline-daemon-utils.ts` referring to V091-QA-FOLLOWUP, no function |
| Server-side scheduled-posts persistence | **Does not exist.** `settings.scheduledPosts` lives exclusively in the user's browser via `idb-keyval` (IndexedDB), with localStorage as one-way crash-recovery only. | `hooks/useSettings.ts:4,77,142` |
| Server-side credentials | **Partial — env-fallback only.** `/api/social/post` reads `process.env.INSTAGRAM_ACCESS_TOKEN ?? credentials?.instagram?.accessToken` (and same pattern for Twitter/Pinterest). For a single-user deployment with env vars set, server can post; but it has zero knowledge of *which* posts to fire. | `app/api/social/post/route.ts:175,294-297,325` |

## Why a thin stub is the wrong move

It would be possible to write `app/api/social/cron-fire/route.ts` that reads from `data/queue.json` and a `.github/workflows/cron-fire-scheduled-posts.yml` that pings it every 5 minutes. The result would type-check, tests would pass, the cron would fire. But it would never publish a real post, because:

1. **No queue file is ever written.** Browser-side `useSettings` doesn't write `data/queue.json`. The cron would always read `[]` (or 404).
2. **Vercel filesystem is ephemeral.** Even if the browser POSTed scheduled posts to the server, writing them to `data/queue.json` would not survive across serverless invocations on Vercel. (Tauri desktop side has a real filesystem, but a desktop app doesn't host a public URL for GitHub Actions to hit.)
3. **No double-fire guard is possible** (criterion #3) without a single source of truth that both browser and cron read. Browser reads IDB; cron would read the (non-existent) server queue.

So criteria #1 ("cron fires every 5 min") and #2 ("`/api/social/cron-fire` correctly fires due posts") could pass formally while the underlying user story ("posts go out when browser is closed") remains 0% delivered. That's a fake green.

## What this task actually needs (architecture-level decisions)

These are out of scope for autonomous routine implementation per the autonomic-loop routing rubric ("Anything you're not sure about → default to complex"; "Cross-file refactors / new dependencies / config changes / anything touching auth, payments, secrets" all complex):

1. **Persistence layer.** Pick one: Vercel KV (Upstash Redis), Vercel Postgres, Supabase, Cloudflare D1, file-on-Cloudflare-R2, etc. Each has cost, latency, and lock-in trade-offs. Currently zero DB deps in `package.json`.
2. **Sync model.** When does the browser push scheduled posts to the server queue? Per-post-on-schedule (real-time, simple)? Periodic batch? On `beforeunload`?
3. **Credential storage at the server.** Today: per-user creds in browser IDB. For a server cron to post on behalf of a user, creds must live somewhere the server can read. Options: env vars (OK for a single-tenant self-hosted instance, broken for multi-tenant), encrypted-per-user record in the DB (needs key management), OAuth refresh tokens (needs refresh flow). This is a privacy + security design.
4. **Cron endpoint authentication.** A public `/api/social/cron-fire` is an obvious abuse target (anyone can fire scheduled posts at the wrong time, drain rate limits). Needs a shared secret in the GitHub Actions workflow + matching env var on the server.
5. **Deployment target for the cron.** GitHub Actions cron hits a URL — which one? Vercel (web build) or the user's local desktop Tauri instance (no public URL)? If Vercel, needs `APP_URL` configured and the production env to have all credential env vars set.
6. **De-dupe contract with the existing browser auto-poster.** `MainContent.tsx:1419-1462` runs the same loop client-side. If both fire, posts go out twice. Needs an atomic `scheduled→posting` claim that both code paths respect via the same backing store — which loops back to (1).

## Recommended path forward

Two reasonable scoping options Hermes can pick from:

**Option A — Single-tenant self-hosted MVP (smallest lift):**
- Vercel KV / Upstash Redis (one new dep).
- Browser POSTs `{ id, date, time, platforms, caption, mediaUrls, carouselGroupId }` to `/api/queue/schedule` whenever a post is scheduled. The route appends to a Redis list keyed by `queue:{userId}` (or just `queue` for single-user).
- Cron-fire route claims atomically via `LMOVE queue:scheduled queue:posting`, fires using `process.env.*` credentials, writes result to `queue:posted` / `queue:failed`.
- Browser auto-poster checks `localStorage.getItem('cron-owner') === '1'` style flag and disables itself when server cron is configured.
- Acceptance criterion #3 satisfied by the atomic LMOVE.
- Real implementation is still ~400-600 LOC across 4-5 files plus the workflow YAML + new dep.

**Option B — Defer the feature, ship a UX guardrail instead:**
- Surface in Post Ready: "Scheduled posts only fire while this app is open. Close = pause." with a settings toggle to show a desktop notification when the browser is about to close with pending posts due in <1h.
- 1-day lift, no infra changes. Real cron fix lands later under a proper architecture story.

## Decision needed (Hermes)

Which path? If A, I need:
- Confirmation that Vercel KV / Upstash is acceptable as a new dep
- Confirmation that this is single-tenant (env vars hold creds) vs multi-tenant (need OAuth + per-user encryption)
- A `CRON_SHARED_SECRET` for the workflow → server handshake

If B, I'll write the UX guardrail today; reschedule the cron work after architecture is set.

## What I did NOT do

- Did NOT create `app/api/social/cron-fire/route.ts` as a stub. Per identity file rule "default to complex", and per the verification-before-completion principle, an endpoint that "type-checks, tests pass, never delivers a real post" would be a worse outcome than reporting blocked.
- Did NOT touch `MainContent.tsx`, `useSettings.ts`, or `package.json`.
- Did NOT add any GitHub Actions workflow.

Working tree clean.

## Confidence: 0.95

High on the diagnosis (each premise of the spec is verifiably absent from the codebase). The only uncertainty is whether Hermes had context I'm missing about an external queue file or a planned migration that hasn't landed.
