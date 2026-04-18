// V040-008 + V040-HOTFIX-001: per-platform approval gating tests.

import { describe, it, expect } from 'vitest';
import {
  isPlatformAutoApproved,
  resolvePipelinePostStatus,
  applyV040AutoApproveMigration,
} from '@/lib/pipeline-daemon-utils';

describe('isPlatformAutoApproved', () => {
  it('defaults every known platform to auto-approval (V040-HOTFIX-001)', () => {
    expect(isPlatformAutoApproved('instagram', undefined)).toBe(true);
    expect(isPlatformAutoApproved('pinterest', undefined)).toBe(true);
    expect(isPlatformAutoApproved('twitter', undefined)).toBe(true);
    expect(isPlatformAutoApproved('discord', undefined)).toBe(true);
  });

  it('treats an empty config object the same as missing config', () => {
    expect(isPlatformAutoApproved('instagram', {})).toBe(true);
    expect(isPlatformAutoApproved('twitter', {})).toBe(true);
  });

  it('respects explicit user overrides', () => {
    expect(isPlatformAutoApproved('instagram', { instagram: false })).toBe(false);
    expect(isPlatformAutoApproved('twitter', { twitter: false })).toBe(false);
    expect(isPlatformAutoApproved('pinterest', { pinterest: true })).toBe(true);
  });

  it('treats unknown platforms as manual approval (defensive)', () => {
    expect(isPlatformAutoApproved('myspace', undefined)).toBe(false);
  });
});

describe('resolvePipelinePostStatus', () => {
  it('lands as scheduled when every platform is auto-approved', () => {
    expect(resolvePipelinePostStatus(['twitter', 'discord'], undefined)).toBe('scheduled');
  });

  it('lands as scheduled for Instagram by default after the hotfix', () => {
    expect(resolvePipelinePostStatus(['instagram'], undefined)).toBe('scheduled');
    expect(resolvePipelinePostStatus(['twitter', 'instagram'], undefined)).toBe('scheduled');
  });

  it('lands as pending_approval when ANY platform is explicitly disabled', () => {
    expect(
      resolvePipelinePostStatus(['twitter', 'instagram'], { instagram: false }),
    ).toBe('pending_approval');
  });

  it('respects explicit overrides — Instagram on, others off', () => {
    expect(
      resolvePipelinePostStatus(['instagram'], {
        instagram: true,
        twitter: false,
      }),
    ).toBe('scheduled');
  });

  it('flips to manual when user disables a previously-auto platform', () => {
    expect(
      resolvePipelinePostStatus(['twitter'], { twitter: false }),
    ).toBe('pending_approval');
  });

  it('treats an empty platforms array as pending_approval', () => {
    expect(resolvePipelinePostStatus([], undefined)).toBe('pending_approval');
  });
});

describe('applyV040AutoApproveMigration (V040-HOTFIX-001)', () => {
  it('writes an explicit auto-everywhere map when the field is absent', () => {
    const out = applyV040AutoApproveMigration({ otherField: 'x' } as { otherField: string; pipelineAutoApprove?: Record<string, boolean> });
    expect(out.pipelineAutoApprove).toEqual({
      instagram: true,
      pinterest: true,
      twitter: true,
      discord: true,
    });
  });

  it('is a no-op when the user has already configured the field', () => {
    const input = { pipelineAutoApprove: { instagram: false } };
    const out = applyV040AutoApproveMigration(input);
    expect(out).toBe(input);
    expect(out.pipelineAutoApprove).toEqual({ instagram: false });
  });

  it('is a no-op when the field is already an empty object (treated as user-configured)', () => {
    const input = { pipelineAutoApprove: {} };
    const out = applyV040AutoApproveMigration(input);
    expect(out).toBe(input);
  });

  it('preserves all other fields on the migrated payload', () => {
    const input = { someOtherField: 42, watermark: { enabled: true } };
    const out = applyV040AutoApproveMigration(input as { someOtherField: number; watermark: { enabled: boolean }; pipelineAutoApprove?: Record<string, boolean> });
    expect(out.someOtherField).toBe(42);
    expect(out.watermark).toEqual({ enabled: true });
  });
});
