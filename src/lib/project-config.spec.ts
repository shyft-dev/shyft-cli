import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProjectConfigManager } from './project-config.js';

describe('ProjectConfigManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('load returns default config when no file exists', () => {
    const mgr = createProjectConfigManager(tempDir);
    const config = mgr.load();
    expect(config).toEqual({
      activePhases: ['ideate', 'plan', 'build', 'verify'],
      phaseCustomizations: {},
    });
  });

  test('setProductId writes productId to config file', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_123');
    const config = mgr.load();
    expect(config.productId).toBe('prod_123');
  });

  test('setProductId preserves other config fields', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.update({ activePhases: ['build', 'verify'] });
    mgr.setProductId('prod_123');
    const config = mgr.load();
    expect(config.activePhases).toEqual(['build', 'verify']);
    expect(config.productId).toBe('prod_123');
  });

  test('update merges partial config', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_123');
    mgr.update({ activePhases: ['build'] });
    const config = mgr.load();
    expect(config.productId).toBe('prod_123');
    expect(config.activePhases).toEqual(['build']);
  });

  test('resolveProductId returns explicit value over config', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_config');
    expect(mgr.resolveProductId('prod_explicit')).toBe('prod_explicit');
  });

  test('resolveProductId falls back to config', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_config');
    expect(mgr.resolveProductId()).toBe('prod_config');
  });

  test('resolveProductId throws when no value available', () => {
    const mgr = createProjectConfigManager(tempDir);
    expect(() => mgr.resolveProductId()).toThrow('No product specified');
  });

  test('creates .shyft directory lazily on first write', () => {
    const subDir = join(tempDir, 'nested');
    mkdirSync(subDir);
    const mgr = createProjectConfigManager(subDir);
    expect(existsSync(join(subDir, '.shyft'))).toBe(false);
    mgr.setProductId('prod_123');
    expect(existsSync(join(subDir, '.shyft'))).toBe(true);
  });

  test('load returns default config on corrupt JSON', () => {
    const shyftDir = join(tempDir, '.shyft');
    mkdirSync(shyftDir, { recursive: true });
    writeFileSync(join(shyftDir, 'config.json'), 'not json');
    const mgr = createProjectConfigManager(tempDir);
    const config = mgr.load();
    expect(config.activePhases).toEqual(['ideate', 'plan', 'build', 'verify']);
  });

  test('config file has secure permissions', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_123');
    const filePath = join(tempDir, '.shyft', 'config.json');
    const stats = statSync(filePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  test('exists returns false when no config file', () => {
    const mgr = createProjectConfigManager(tempDir);
    expect(mgr.exists()).toBe(false);
  });

  test('exists returns true after writing config', () => {
    const mgr = createProjectConfigManager(tempDir);
    mgr.setProductId('prod_123');
    expect(mgr.exists()).toBe(true);
  });
});
