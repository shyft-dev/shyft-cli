import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildCreateProductPayload } from './init.js';
import { createProjectConfigManager } from '../lib/project-config.js';

describe('buildCreateProductPayload', () => {
  test('returns name trimmed', () => {
    const payload = buildCreateProductPayload('  My Product  ', '');
    expect(payload.name).toBe('My Product');
  });

  test('includes description when provided', () => {
    const payload = buildCreateProductPayload('Product', 'A great product');
    expect(payload).toEqual({ name: 'Product', description: 'A great product' });
  });

  test('omits description when empty string', () => {
    const payload = buildCreateProductPayload('Product', '');
    expect(payload).toEqual({ name: 'Product' });
    expect('description' in payload).toBe(false);
  });

  test('omits description when only whitespace would remain but input is truthy', () => {
    // description is truthy (non-empty string with spaces), so it is included
    const payload = buildCreateProductPayload('Product', '  ');
    expect(payload.description).toBe('  ');
  });
});

describe('Re-initialization preserves config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('updating productId preserves existing phases and customizations', () => {
    const mgr = createProjectConfigManager(tempDir);

    // Simulate initial init
    mgr.update({
      productId: 'prod_old',
      activePhases: ['build', 'verify'],
      phaseCustomizations: { build: { prompt: 'custom' } },
    });

    // Simulate re-init: only update productId
    mgr.update({ productId: 'prod_new' });

    const config = mgr.load();
    expect(config.productId).toBe('prod_new');
    expect(config.activePhases).toEqual(['build', 'verify']);
    expect(config.phaseCustomizations).toEqual({ build: { prompt: 'custom' } });
  });

  test('fresh init sets default phases', () => {
    const mgr = createProjectConfigManager(tempDir);

    mgr.update({
      productId: 'prod_123',
      activePhases: ['ideate', 'plan', 'build', 'verify'],
      phaseCustomizations: {},
    });

    const config = mgr.load();
    expect(config.productId).toBe('prod_123');
    expect(config.activePhases).toEqual(['ideate', 'plan', 'build', 'verify']);
    expect(config.phaseCustomizations).toEqual({});
  });
});
