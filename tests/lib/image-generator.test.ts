import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  generateImage,
  IMAGE_PROVIDERS,
  isImageProvider,
} from '@/lib/image-generator';
import { __setSpawnForTests, MmxQuotaError } from '@/lib/mmx-client';

// ----- mmx spawn DI seam ----------------------------------------------------

const spawnMock = vi.fn();

interface FakeChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill: (sig?: NodeJS.Signals) => void;
}

function makeChild(stdoutPayload: string, exitCode: number, stderrPayload = ''): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Readable.from([Buffer.from(stdoutPayload, 'utf8')]);
  child.stderr = Readable.from([Buffer.from(stderrPayload, 'utf8')]);
  child.kill = vi.fn();
  setImmediate(() => child.emit('close', exitCode));
  return child;
}

// ----- fetch (Leonardo branch) ----------------------------------------------

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  spawnMock.mockReset();
  __setSpawnForTests(spawnMock as never);
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  __setSpawnForTests(null);
  globalThis.fetch = realFetch;
});

describe('image-generator helpers', () => {
  it('IMAGE_PROVIDERS lists both providers', () => {
    expect([...IMAGE_PROVIDERS]).toEqual(['leonardo', 'mmx']);
  });

  it('isImageProvider narrows correctly', () => {
    expect(isImageProvider('leonardo')).toBe(true);
    expect(isImageProvider('mmx')).toBe(true);
    expect(isImageProvider('dalle')).toBe(false);
    expect(isImageProvider(undefined)).toBe(false);
  });
});

describe('generateImage — leonardo provider', () => {
  it('POSTs prompt + body to /api/leonardo and collects URLs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ urls: ['https://leo.cdn/a.png', 'https://leo.cdn/b.png'] }),
      text: async () => '',
    } as Response);

    const result = await generateImage({
      provider: 'leonardo',
      prompt: 'a cat',
      leonardo: { body: { modelId: 'lucid-realism' } },
    });

    expect(result.provider).toBe('leonardo');
    expect(result.urls).toEqual(['https://leo.cdn/a.png', 'https://leo.cdn/b.png']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/leonardo');
    expect((init as RequestInit).method).toBe('POST');
    const sent = JSON.parse((init as { body: string }).body);
    expect(sent).toEqual({ modelId: 'lucid-realism', prompt: 'a cat' });
  });

  it('tolerates the {images:[{url}]} response shape', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ images: [{ url: 'https://leo.cdn/x.png' }, { url: 'https://leo.cdn/y.png' }] }),
      text: async () => '',
    } as Response);

    const result = await generateImage({
      provider: 'leonardo',
      prompt: 'a sky',
      leonardo: { body: {} },
    });
    expect(result.urls).toEqual(['https://leo.cdn/x.png', 'https://leo.cdn/y.png']);
  });

  it('throws on non-OK response — no auto-fallback to mmx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
      text: async () => 'leonardo down',
    } as Response);

    await expect(
      generateImage({
        provider: 'leonardo',
        prompt: 'x',
        leonardo: { body: {} },
      }),
    ).rejects.toThrow(/Leonardo provider failed \(503\)/);
    // Confirm we did not silently call mmx.
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('forwards a custom baseUrl (server-side caller)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ urls: [] }),
      text: async () => '',
    } as Response);
    await generateImage({
      provider: 'leonardo',
      prompt: 'p',
      leonardo: { baseUrl: 'https://app.example.com', body: {} },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://app.example.com/api/leonardo');
  });
});

describe('generateImage — mmx provider', () => {
  it('routes to mmx-client and surfaces URLs', async () => {
    spawnMock.mockReturnValue(
      makeChild(JSON.stringify({ data: { image_urls: ['https://mmx/x.png'] } }), 0) as never,
    );
    const result = await generateImage({
      provider: 'mmx',
      prompt: 'a cat',
      mmx: { aspectRatio: '16:9' },
    });
    expect(result.provider).toBe('mmx');
    expect(result.urls).toEqual(['https://mmx/x.png']);
    // Confirm we did not silently call Leonardo.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates MmxQuotaError WITHOUT falling back to Leonardo', async () => {
    spawnMock.mockReturnValue(
      makeChild(
        JSON.stringify({
          error: {
            code: 4,
            message: 'This model is not available on your current Token Plan',
            hint: 'image-01 requires the Plus plan or above.',
          },
        }),
        0,
      ) as never,
    );
    await expect(
      generateImage({ provider: 'mmx', prompt: 'x' }),
    ).rejects.toBeInstanceOf(MmxQuotaError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
