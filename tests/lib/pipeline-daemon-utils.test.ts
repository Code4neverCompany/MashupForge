// V040-008: per-platform approval gating tests.

import { describe, it, expect } from 'vitest';
import {
  isPlatformAutoApproved,
  resolvePipelinePostStatus,
} from '@/lib/pipeline-daemon-utils';

describe('isPlatformAutoApproved', () => {
  it('defaults Instagram to manual approval', () => {
    expect(isPlatformAutoApproved('instagram', undefined)).toBe(false);
    expect(isPlatformAutoApproved('instagram', {})).toBe(false);
  });

  it('defaults pinterest/twitter/discord to auto-approval', () => {
    expect(isPlatformAutoApproved('pinterest', undefined)).toBe(true);
    expect(isPlatformAutoApproved('twitter', undefined)).toBe(true);
    expect(isPlatformAutoApproved('discord', undefined)).toBe(true);
  });

  it('respects explicit user overrides', () => {
    expect(isPlatformAutoApproved('instagram', { instagram: true })).toBe(true);
    expect(isPlatformAutoApproved('twitter', { twitter: false })).toBe(false);
  });

  it('treats unknown platforms as manual approval', () => {
    expect(isPlatformAutoApproved('myspace', undefined)).toBe(false);
  });
});

describe('resolvePipelinePostStatus', () => {
  it('lands as scheduled when every platform is auto-approved', () => {
    expect(resolvePipelinePostStatus(['twitter', 'discord'], undefined)).toBe('scheduled');
  });

  it('lands as pending_approval when any platform requires manual review', () => {
    expect(resolvePipelinePostStatus(['twitter', 'instagram'], undefined)).toBe('pending_approval');
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
