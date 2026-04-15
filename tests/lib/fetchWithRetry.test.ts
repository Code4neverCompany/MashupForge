import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '@/lib/fetchWithRetry';

function mockResponse(status: number): Response {
  return new Response('body', { status });
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns immediately on a 200 response without retrying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(200));
    const promise = fetchWithRetry('https://example.test/x');
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx responses without retrying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(400));
    const promise = fetchWithRetry('https://example.test/x');
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 then succeeds', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(200));
    const promise = fetchWithRetry('https://example.test/x');
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns the last response after exhausting attempts on persistent 500', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(503));
    const promise = fetchWithRetry('https://example.test/x', undefined, { attempts: 3 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('retries on network error then succeeds', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(mockResponse(200));
    const promise = fetchWithRetry('https://example.test/x');
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws the network error after exhausting attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const promise = fetchWithRetry('https://example.test/x', undefined, { attempts: 2 });
    const assertion = expect(promise).rejects.toThrow('connection refused');
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('respects custom attempts: 1 means no retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(500));
    const promise = fetchWithRetry('https://example.test/x', undefined, { attempts: 1 });
    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.status).toBe(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
