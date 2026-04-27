// SCHED-POST-ROBUST: tests for the browser-side reconciler. Pure
// function — no fetch, no React.

import { describe, it, expect } from 'vitest';
import { reconcileResults, type QueueResultLite } from '@/lib/server-queue-client';
import type { ScheduledPost } from '@/types/mashup';

function makePost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'p1',
    imageId: 'img1',
    date: '2026-05-01',
    time: '12:00',
    platforms: ['instagram'],
    caption: 'hello',
    status: 'scheduled',
    ...overrides,
  };
}

describe('reconcileResults', () => {
  it('no-ops when results array is empty', () => {
    const posts = [makePost()];
    const out = reconcileResults(posts, []);
    expect(out.next).toBe(posts); // identity, not a new array
    expect(out.appliedIds).toEqual([]);
  });

  it('upgrades scheduled → posted when server result says posted', () => {
    const posts = [makePost({ id: 'p1', status: 'scheduled' })];
    const result: QueueResultLite = { id: 'p1', status: 'posted', at: 1 };
    const out = reconcileResults(posts, [result]);
    expect(out.next[0].status).toBe('posted');
    expect(out.appliedIds).toContain('p1');
  });

  it('upgrades scheduled → failed when server result says failed', () => {
    const posts = [makePost({ id: 'p1', status: 'scheduled' })];
    const result: QueueResultLite = { id: 'p1', status: 'failed', at: 1, error: 'boom' };
    const out = reconcileResults(posts, [result]);
    expect(out.next[0].status).toBe('failed');
    expect(out.appliedIds).toContain('p1');
  });

  it('does not downgrade a locally-terminal status (e.g. user already marked failed)', () => {
    const posts = [makePost({ id: 'p1', status: 'failed' })];
    const result: QueueResultLite = { id: 'p1', status: 'posted', at: 1 };
    const out = reconcileResults(posts, [result]);
    expect(out.next[0].status).toBe('failed');
    expect(out.appliedIds).not.toContain('p1');
  });

  it('does not downgrade a locally-posted status', () => {
    const posts = [makePost({ id: 'p1', status: 'posted' })];
    const result: QueueResultLite = { id: 'p1', status: 'failed', at: 1, error: 'late' };
    const out = reconcileResults(posts, [result]);
    expect(out.next[0].status).toBe('posted');
  });

  it('acks orphan results (server has a result for an id not in local state)', () => {
    const posts = [makePost({ id: 'p1' })];
    const result: QueueResultLite = { id: 'orphan', status: 'posted', at: 1 };
    const out = reconcileResults(posts, [result]);
    // Local state untouched
    expect(out.next).toBe(posts);
    // But we still ack so the server drops the orphan from its hash
    expect(out.appliedIds).toContain('orphan');
  });

  it('reconciles a mix of matches and orphans', () => {
    const posts = [
      makePost({ id: 'p1', status: 'scheduled' }),
      makePost({ id: 'p2', status: 'scheduled' }),
    ];
    const results: QueueResultLite[] = [
      { id: 'p1', status: 'posted', at: 1 },
      { id: 'p2', status: 'failed', at: 1, error: 'x' },
      { id: 'orphan', status: 'posted', at: 1 },
    ];
    const out = reconcileResults(posts, results);
    expect(out.next[0].status).toBe('posted');
    expect(out.next[1].status).toBe('failed');
    expect(out.appliedIds.sort()).toEqual(['orphan', 'p1', 'p2']);
  });
});
