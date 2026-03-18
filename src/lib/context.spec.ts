import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createContextManager } from './context.js';

describe('context manager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `shyft-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test('load returns empty object when no context file exists', () => {
    const ctx = createContextManager(testDir);
    expect(ctx.load()).toEqual({});
  });

  test('setProduct writes productId to context file', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_123');
    const loaded = ctx.load();
    expect(loaded.productId).toBe('prod_123');
  });

  test('setFeature writes featureId to context file', () => {
    const ctx = createContextManager(testDir);
    ctx.setFeature('feat_456');
    const loaded = ctx.load();
    expect(loaded.featureId).toBe('feat_456');
  });

  test('setProduct preserves existing featureId', () => {
    const ctx = createContextManager(testDir);
    ctx.setFeature('feat_456');
    ctx.setProduct('prod_123');
    const loaded = ctx.load();
    expect(loaded.productId).toBe('prod_123');
    expect(loaded.featureId).toBe('feat_456');
  });

  test('clearFeature removes only featureId', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_123');
    ctx.setFeature('feat_456');
    ctx.clearFeature();
    const loaded = ctx.load();
    expect(loaded.productId).toBe('prod_123');
    expect(loaded.featureId).toBeUndefined();
  });

  test('clearProduct removes both productId and featureId', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_123');
    ctx.setFeature('feat_456');
    ctx.clearProduct();
    const loaded = ctx.load();
    expect(loaded.productId).toBeUndefined();
    expect(loaded.featureId).toBeUndefined();
  });

  test('clearAll removes everything', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_123');
    ctx.setFeature('feat_456');
    ctx.clearAll();
    expect(ctx.load()).toEqual({});
  });

  test('resolveProductId returns explicit value over context', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_context');
    expect(ctx.resolveProductId('prod_explicit')).toBe('prod_explicit');
  });

  test('resolveProductId falls back to context', () => {
    const ctx = createContextManager(testDir);
    ctx.setProduct('prod_context');
    expect(ctx.resolveProductId()).toBe('prod_context');
  });

  test('resolveProductId throws when no value available', () => {
    const ctx = createContextManager(testDir);
    expect(() => ctx.resolveProductId()).toThrow('No product specified');
  });

  test('resolveFeatureId returns explicit value over context', () => {
    const ctx = createContextManager(testDir);
    ctx.setFeature('feat_context');
    expect(ctx.resolveFeatureId('feat_explicit')).toBe('feat_explicit');
  });

  test('resolveFeatureId falls back to context', () => {
    const ctx = createContextManager(testDir);
    ctx.setFeature('feat_context');
    expect(ctx.resolveFeatureId()).toBe('feat_context');
  });

  test('resolveFeatureId throws when no value available', () => {
    const ctx = createContextManager(testDir);
    expect(() => ctx.resolveFeatureId()).toThrow('No feature specified');
  });

  test('creates .shyft directory lazily on first write', () => {
    const freshDir = join(testDir, 'subdir');
    mkdirSync(freshDir, { recursive: true });
    const ctx = createContextManager(freshDir);
    ctx.setProduct('prod_123');
    expect(existsSync(join(freshDir, '.shyft', 'context.json'))).toBe(true);
  });

  test('load returns empty object on corrupt JSON', () => {
    const shyftDir = join(testDir, '.shyft');
    mkdirSync(shyftDir, { recursive: true });
    writeFileSync(join(shyftDir, 'context.json'), 'not json{{{');
    const ctx = createContextManager(testDir);
    expect(ctx.load()).toEqual({});
  });
});
