import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { countFutureScheduledPosts, IdeaTimeoutError } from '@/lib/pipeline-daemon-utils';
import { SkipIdeaSignal } from '@/lib/pipeline-processor';
import type { ScheduledPost } from '@/types/mashup';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePost(
  date: string,
  time: string,
  status?: ScheduledPost['status'],
): ScheduledPost {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    imageId: 'img-001',
    date,
    time,
    platforms: ['instagram'],
    caption: 'Test caption',
    status,
  };
}

// ─── countFutureScheduledPosts ────────────────────────────────────────────────
//
// Fake now = 2026-04-18T12:00:00Z
// Horizon (daysAhead=7) = 2026-04-25T12:00:00Z

describe('countFutureScheduledPosts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns 0 for an empty array', () => {
    expect(countFutureScheduledPosts([], 7)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(countFutureScheduledPosts(undefined, 7)).toBe(0);
  });

  it('counts a pending post (undefined status) within the horizon', () => {
    // 2026-04-20 is 2 days ahead — well inside 7-day window
    expect(countFutureScheduledPosts([makePost('2026-04-20', '18:00')], 7)).toBe(1);
  });

  it('counts a "scheduled" post within the horizon', () => {
    expect(countFutureScheduledPosts([makePost('2026-04-20', '18:00', 'scheduled')], 7)).toBe(1);
  });

  it('counts a "pending_approval" post within the horizon', () => {
    expect(
      countFutureScheduledPosts([makePost('2026-04-20', '18:00', 'pending_approval')], 7),
    ).toBe(1);
  });

  it('excludes "posted" posts', () => {
    expect(countFutureScheduledPosts([makePost('2026-04-20', '18:00', 'posted')], 7)).toBe(0);
  });

  it('excludes "failed" posts', () => {
    expect(countFutureScheduledPosts([makePost('2026-04-20', '18:00', 'failed')], 7)).toBe(0);
  });

  it('excludes past posts', () => {
    // 2026-04-17 is yesterday; even UTC-12 puts it before fake now
    expect(countFutureScheduledPosts([makePost('2026-04-17', '18:00')], 7)).toBe(0);
  });

  it('excludes posts beyond the horizon', () => {
    // 2026-04-26 is 8 days ahead — beyond 7-day window in all timezones
    expect(countFutureScheduledPosts([makePost('2026-04-26', '18:00')], 7)).toBe(0);
  });

  it('counts only active in-window posts from a mixed array', () => {
    const posts = [
      makePost('2026-04-19', '18:00'),               // 1 day ahead — counted
      makePost('2026-04-20', '18:00', 'scheduled'),  // 2 days ahead — counted
      makePost('2026-04-17', '18:00'),                // past — excluded
      makePost('2026-04-20', '18:00', 'posted'),     // posted — excluded
      makePost('2026-04-26', '18:00'),                // beyond horizon — excluded
    ];
    expect(countFutureScheduledPosts(posts, 7)).toBe(2);
  });
});

// ─── IdeaTimeoutError ─────────────────────────────────────────────────────────

describe('IdeaTimeoutError', () => {
  it('is instanceof Error', () => {
    expect(new IdeaTimeoutError()).toBeInstanceOf(Error);
  });

  it('has kind === "timeout"', () => {
    expect(new IdeaTimeoutError().kind).toBe('timeout');
  });

  it('has expected name and message', () => {
    const err = new IdeaTimeoutError();
    expect(err.name).toBe('IdeaTimeoutError');
    expect(err.message).toBe('__IDEA_TIMEOUT__');
  });
});

// ─── Per-idea timeout race (daemon pattern) ───────────────────────────────────

describe('per-idea timeout race — IdeaTimeoutError + AbortController pattern', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const PER_IDEA_TIMEOUT_MS = 10 * 60 * 1000; // same constant as daemon

  it('resolves with the fast task when processIdea finishes before the cap', async () => {
    let handle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject(new IdeaTimeoutError()), PER_IDEA_TIMEOUT_MS);
    });

    const result = await Promise.race([Promise.resolve('done'), timeoutPromise]);
    clearTimeout(handle!);
    expect(result).toBe('done');
  });

  it('rejects with IdeaTimeoutError when the task exceeds the hard cap', async () => {
    const hanging = new Promise<void>(() => {}); // never resolves
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new IdeaTimeoutError()), PER_IDEA_TIMEOUT_MS);
    });

    const race = Promise.race([hanging, timeoutPromise]);
    // Attach the expectation BEFORE advancing timers to avoid unhandled-rejection warning.
    const assertion = expect(race).rejects.toBeInstanceOf(IdeaTimeoutError);
    await vi.advanceTimersByTimeAsync(PER_IDEA_TIMEOUT_MS + 1);
    await assertion;
  });

  it('aborts the skip controller when the hard timeout fires', async () => {
    const skipAbort = new AbortController();
    const hanging = new Promise<void>(() => {});
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        skipAbort.abort(); // mirrors daemon: unblock processIdea's skip checks
        reject(new IdeaTimeoutError());
      }, PER_IDEA_TIMEOUT_MS);
    });

    const race = Promise.race([hanging, timeoutPromise]);
    const assertion = expect(race).rejects.toBeInstanceOf(IdeaTimeoutError);
    await vi.advanceTimersByTimeAsync(PER_IDEA_TIMEOUT_MS + 1);
    await assertion;
    expect(skipAbort.signal.aborted).toBe(true);
  });

  it('IdeaTimeoutError is distinguishable from SkipIdeaSignal', () => {
    const timeout = new IdeaTimeoutError();
    const skip = new SkipIdeaSignal();
    expect(timeout).not.toBeInstanceOf(SkipIdeaSignal);
    expect(skip).not.toBeInstanceOf(IdeaTimeoutError);
    expect(timeout.kind).toBe('timeout');
    expect(skip.kind).toBe('skip');
  });
});
