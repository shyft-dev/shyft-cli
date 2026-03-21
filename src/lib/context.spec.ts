import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createContextManager } from './context.js';

describe('ContextManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('load returns empty object when no context file exists', () => {
    const mgr = createContextManager(tempDir);
    const ctx = mgr.load();
    expect(ctx).toEqual({});
  });

  test('setFeature writes featureId to context file', () => {
    const mgr = createContextManager(tempDir);
    mgr.setFeature('feat_123');
    const ctx = mgr.load();
    expect(ctx.featureId).toBe('feat_123');
  });

  test('clearFeature removes featureId', () => {
    const mgr = createContextManager(tempDir);
    mgr.setFeature('feat_123');
    mgr.clearFeature();
    const ctx = mgr.load();
    expect(ctx.featureId).toBeUndefined();
  });

  test('clearAll removes everything', () => {
    const mgr = createContextManager(tempDir);
    mgr.setFeature('feat_123');
    mgr.clearAll();
    const ctx = mgr.load();
    expect(ctx).toEqual({});
  });

  test('resolveFeatureId returns explicit value over context', () => {
    const mgr = createContextManager(tempDir);
    mgr.setFeature('feat_context');
    expect(mgr.resolveFeatureId('feat_explicit')).toBe('feat_explicit');
  });

  test('resolveFeatureId falls back to context', () => {
    const mgr = createContextManager(tempDir);
    mgr.setFeature('feat_context');
    expect(mgr.resolveFeatureId()).toBe('feat_context');
  });

  test('resolveFeatureId throws when no value available', () => {
    const mgr = createContextManager(tempDir);
    expect(() => mgr.resolveFeatureId()).toThrow('No feature specified');
  });

  test('creates .shyft directory lazily on first write', () => {
    const subDir = join(tempDir, 'nested');
    mkdirSync(subDir);
    const mgr = createContextManager(subDir);
    expect(existsSync(join(subDir, '.shyft'))).toBe(false);
    mgr.setFeature('feat_123');
    expect(existsSync(join(subDir, '.shyft'))).toBe(true);
  });

  test('load returns empty object on corrupt JSON', () => {
    const shyftDir = join(tempDir, '.shyft');
    mkdirSync(shyftDir, { recursive: true });
    writeFileSync(join(shyftDir, 'context.json'), 'not json');
    const mgr = createContextManager(tempDir);
    expect(mgr.load()).toEqual({});
  });
});
