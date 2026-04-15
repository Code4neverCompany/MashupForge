import { describe, it, expect } from 'vitest';
import { isAllowedUrl } from '@/app/api/proxy-image/route';

describe('proxy-image isAllowedUrl', () => {
  it('allows cdn.leonardo.ai', () => {
    expect(isAllowedUrl('https://cdn.leonardo.ai/users/abc/generations/x.png')).toBe(true);
  });

  it('allows i.uguu.se', () => {
    expect(isAllowedUrl('https://i.uguu.se/AbCdEfG.png')).toBe(true);
  });

  it('allows storage.googleapis.com subdomains', () => {
    expect(isAllowedUrl('https://leonardo-bucket.storage.googleapis.com/file.png')).toBe(true);
  });

  it('rejects http (downgrade attack vector)', () => {
    expect(isAllowedUrl('http://cdn.leonardo.ai/x.png')).toBe(false);
  });

  it('rejects file:// protocol', () => {
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects gopher:// protocol', () => {
    expect(isAllowedUrl('gopher://internal.local/x')).toBe(false);
  });

  it('rejects arbitrary external hosts', () => {
    expect(isAllowedUrl('https://evil.example.com/x.png')).toBe(false);
  });

  it('rejects localhost', () => {
    expect(isAllowedUrl('https://localhost/admin')).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(isAllowedUrl('https://127.0.0.1/internal')).toBe(false);
  });

  it('rejects host suffix lookalike (e.g. cdn.leonardo.ai.evil.com)', () => {
    expect(isAllowedUrl('https://cdn.leonardo.ai.evil.com/x.png')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedUrl('')).toBe(false);
  });

  it('rejects malformed URL', () => {
    expect(isAllowedUrl('not a url at all')).toBe(false);
  });

  it('treats hostname case-insensitively', () => {
    expect(isAllowedUrl('https://CDN.LEONARDO.AI/x.png')).toBe(true);
  });

  it('rejects bare suffix without leading dot (storage.googleapis.com itself)', () => {
    // The suffix list is .storage.googleapis.com so a host of exactly
    // "storage.googleapis.com" should NOT match — it would need a
    // subdomain, which is the actual deployment shape.
    expect(isAllowedUrl('https://storage.googleapis.com/x.png')).toBe(false);
  });
});
