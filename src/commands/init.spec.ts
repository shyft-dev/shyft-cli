import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildCreateProductPayload, ensureGitignore } from './init.js';
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

  test('omits description when only whitespace', () => {
    const payload = buildCreateProductPayload('Product', '  ');
    expect(payload).toEqual({ name: 'Product' });
    expect('description' in payload).toBe(false);
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

  test('re-init updates productId', () => {
    const mgr = createProjectConfigManager(tempDir);

    mgr.update({ productId: 'prod_old' });
    mgr.update({ productId: 'prod_new' });

    const config = mgr.load();
    expect(config.productId).toBe('prod_new');
  });

  test('fresh init saves productId', () => {
    const mgr = createProjectConfigManager(tempDir);

    mgr.update({ productId: 'prod_123' });

    const config = mgr.load();
    expect(config.productId).toBe('prod_123');
  });
});

describe('ensureGitignore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates .gitignore with context.json entry when none exists', () => {
    ensureGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toBe('.shyft/context.json\n');
  });

  test('appends context.json entry to existing .gitignore', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\n');
    ensureGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.shyft/context.json\n');
  });

  test('replaces blanket .shyft/ rule with context.json entry', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\n.shyft/\ndist/\n');
    ensureGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.shyft/context.json\ndist/\n');
  });

  test('does not duplicate entry if already present', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\n.shyft/context.json\n');
    ensureGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.shyft/context.json\n');
  });

  test('adds newline before entry if file does not end with one', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/');
    ensureGitignore(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toBe('node_modules/\n.shyft/context.json\n');
  });
});
