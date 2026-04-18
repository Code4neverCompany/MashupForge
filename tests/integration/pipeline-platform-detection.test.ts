// V050-006: end-to-end integration test for the V041-HOTFIX-IG fix.
// Bug 3 in v0.4.2 was that processIdea derived `inferredPlatforms` from
// settings.apiKeys only, ignoring desktop config.json creds. Desktop
// users with creds saved in the Desktop tab silently got "No platforms
// configured — skipped" forever.
//
// The existing tests/lib/pipeline-processor.test.ts has 2 unit tests
// covering the inference call site. This integration test goes one
// layer further: it asserts the *output ScheduledPost* — what actually
// lands in accumulatedPosts and gets persisted to settings — has the
// correct `platforms` array. That's the user-visible contract; if a
// future refactor moved the inferredPlatforms call but stopped wiring
// it into the post, the unit tests would still pass and this one
// would catch it.

import { describe, it, expect, vi } from 'vitest';
import { processIdea, type ProcessIdeaDeps } from '@/lib/pipeline-processor';
import type {
  Idea,
  GeneratedImage,
  UserSettings,
  ScheduledPost,
} from '@/types/mashup';
import type { CachedEngagement } from '@/lib/smartScheduler';

const mkIdea = (overrides: Partial<Idea> = {}): Idea => ({
  id: 'idea-001',
  concept: 'A',
  context: '',
  status: 'idea',
  createdAt: 0,
  ...overrides,
});

const mkImage = (overrides: Partial<GeneratedImage> = {}): GeneratedImage => ({
  id: 'img-001',
  prompt: 'p',
  url: 'https://e/x.png',
  status: 'ready',
  modelInfo: { provider: 'leonardo', modelId: 'phoenix', modelName: 'Phoenix' },
  ...overrides,
});

const mkEngagement = (): CachedEngagement => ({
  hours: [{ hour: 18, weight: 1 }],
  days: Array.from({ length: 7 }, (_, i) => ({ day: i, multiplier: 1 })),
  fetchedAt: 0,
  source: 'default',
});

const mkSettings = (overrides: Partial<UserSettings> = {}): UserSettings => ({
  enabledProviders: ['leonardo'],
  apiKeys: {},
  defaultLeonardoModel: 'phoenix',
  pipelineAutoCaption: true,
  pipelineAutoSchedule: true,
  pipelineAutoPost: false,
  pipelineCarouselMode: false,
  ...overrides,
});

const mkDeps = (overrides: Partial<ProcessIdeaDeps> = {}): ProcessIdeaDeps => ({
  fetchTrendingContext: vi.fn().mockResolvedValue(''),
  expandIdeaToPrompt: vi.fn().mockResolvedValue('expanded prompt'),
  triggerImageGeneration: vi.fn().mockResolvedValue(undefined),
  waitForImages: vi.fn().mockResolvedValue([mkImage()]),
  generatePostContent: vi.fn().mockImplementation(async (img: GeneratedImage) => ({
    ...img,
    postCaption: 'cap',
    postHashtags: [],
  })),
  saveImage: vi.fn(),
  updateIdeaStatus: vi.fn(),
  updateSettings: vi.fn(),
  findNextAvailableSlot: vi.fn().mockReturnValue({
    date: '2026-04-25',
    time: '18:00',
    reason: 'best slot',
  }),
  addLog: vi.fn(),
  setPipelineProgress: vi.fn(),
  writeCheckpoint: vi.fn(),
  isSkipRequested: vi.fn().mockReturnValue(false),
  getScheduledPosts: vi.fn().mockReturnValue([]),
  ...overrides,
});

describe('pipeline platform detection — end-to-end ScheduledPost shape', () => {
  it('writes platforms:["instagram"] when only desktopCreds advertise IG', async () => {
    const deps = mkDeps({
      desktopCreds: {
        hasInstagramToken: true,
        hasInstagramAccountId: true,
        hasLeonardoKey: true,
        hasZaiKey: false,
        hasTwitterCreds: false,
        hasPinterestCreds: false,
        hasDiscordCreds: false,
      },
    });
    const accumulated: ScheduledPost[] = [];

    await processIdea(
      mkIdea(),
      0,
      1,
      mkEngagement(),
      accumulated,
      mkSettings({ apiKeys: { leonardo: 'k' } }),
      deps,
    );

    expect(accumulated).toHaveLength(1);
    expect(accumulated[0]!.platforms).toEqual(['instagram']);
  });

  it('respects an explicit settings.pipelinePlatforms override over inference', async () => {
    const deps = mkDeps({
      desktopCreds: {
        hasInstagramToken: true,
        hasInstagramAccountId: true,
        hasLeonardoKey: true,
        hasZaiKey: false,
        hasTwitterCreds: false,
        hasPinterestCreds: false,
        hasDiscordCreds: false,
      },
    });
    const accumulated: ScheduledPost[] = [];

    await processIdea(
      mkIdea(),
      0,
      1,
      mkEngagement(),
      accumulated,
      mkSettings({
        apiKeys: { leonardo: 'k' },
        pipelinePlatforms: ['pinterest'],
      }),
      deps,
    );

    // Even though inference would have produced ['instagram'], the
    // explicit override wins.
    expect(accumulated[0]!.platforms).toEqual(['pinterest']);
  });

  it('skips and logs when neither settings.apiKeys nor desktopCreds carry any platform', async () => {
    const deps = mkDeps();
    const accumulated: ScheduledPost[] = [];

    await processIdea(
      mkIdea(),
      0,
      1,
      mkEngagement(),
      accumulated,
      mkSettings({ apiKeys: { leonardo: 'k' } }),
      deps,
    );

    expect(accumulated).toHaveLength(0);
    expect(deps.addLog).toHaveBeenCalledWith(
      'schedule',
      'idea-001',
      'error',
      expect.stringContaining('No platforms'),
    );
  });

  it('treats settings.apiKeys.instagram = { accessToken: "", igAccountId: "" } as not configured', async () => {
    // Pre-fix bug: the naive Object.entries filter accepted empty-string
    // fields as configured. The integration check: nothing lands in
    // accumulatedPosts in that scenario.
    const deps = mkDeps();
    const accumulated: ScheduledPost[] = [];

    await processIdea(
      mkIdea(),
      0,
      1,
      mkEngagement(),
      accumulated,
      mkSettings({
        apiKeys: { instagram: { accessToken: '', igAccountId: '' } },
      }),
      deps,
    );

    expect(accumulated).toHaveLength(0);
  });
});
