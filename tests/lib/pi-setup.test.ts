import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePiJsEntry } from '@/lib/pi-setup';

describe('resolvePiJsEntry', () => {
  let prefix: string;
  let pkgDir: string;
  let pkgJsonPath: string;
  let piCmdPath: string;

  beforeEach(() => {
    prefix = mkdtempSync(join(tmpdir(), 'mashupforge-pi-test-'));
    pkgDir = join(prefix, 'node_modules', '@mariozechner', 'pi-coding-agent');
    mkdirSync(pkgDir, { recursive: true });
    pkgJsonPath = join(pkgDir, 'package.json');
    piCmdPath = join(prefix, 'pi.cmd');
  });

  afterEach(() => {
    rmSync(prefix, { recursive: true, force: true });
  });

  function writeBin(bin: unknown, entryRelPath?: string) {
    writeFileSync(pkgJsonPath, JSON.stringify({ bin }));
    if (entryRelPath) {
      const fullEntry = join(pkgDir, entryRelPath);
      mkdirSync(join(fullEntry, '..'), { recursive: true });
      writeFileSync(fullEntry, '#!/usr/bin/env node\n');
    }
  }

  it('returns null when package.json is missing', () => {
    expect(resolvePiJsEntry(piCmdPath)).toBe(null);
  });

  it('resolves bin from a scalar string field', () => {
    writeBin('./bin/pi.js', './bin/pi.js');
    const result = resolvePiJsEntry(piCmdPath);
    expect(result).toBe(join(pkgDir, './bin/pi.js'));
  });

  it('resolves bin from an object field with a "pi" key', () => {
    writeBin({ pi: './dist/pi.js', other: './dist/other.js' }, './dist/pi.js');
    const result = resolvePiJsEntry(piCmdPath);
    expect(result).toBe(join(pkgDir, './dist/pi.js'));
  });

  it('falls back to the first object value when "pi" key is absent', () => {
    writeBin({ first: './dist/first.js', second: './dist/second.js' }, './dist/first.js');
    const result = resolvePiJsEntry(piCmdPath);
    expect(result).toBe(join(pkgDir, './dist/first.js'));
  });

  it('returns null when bin field is missing entirely', () => {
    writeFileSync(pkgJsonPath, JSON.stringify({ name: 'no-bin-here' }));
    expect(resolvePiJsEntry(piCmdPath)).toBe(null);
  });

  it('returns null when the resolved entry file does not actually exist on disk', () => {
    writeBin('./bin/pi.js'); // do NOT create the entry file
    expect(resolvePiJsEntry(piCmdPath)).toBe(null);
  });

  it('returns null when package.json is malformed JSON', () => {
    writeFileSync(pkgJsonPath, '{ not valid json');
    expect(resolvePiJsEntry(piCmdPath)).toBe(null);
  });
});
