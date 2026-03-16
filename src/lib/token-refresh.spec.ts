import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConfigManager, resetConfigManager } from './config.js';
import { shouldRefreshToken } from './token-refresh.js';

describe('shouldRefreshToken', () => {
  let testDir: string;
  const originalEnv = process.env.SHYFT_CONFIG_DIR;

  beforeEach(() => {
    testDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    process.env.SHYFT_CONFIG_DIR = testDir;
    resetConfigManager();
  });

  afterEach(() => {
    resetConfigManager();
    rmSync(testDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.SHYFT_CONFIG_DIR;
    } else {
      process.env.SHYFT_CONFIG_DIR = originalEnv;
    }
  });

  test('returns false when no accessToken', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'cc_test' });
    expect(shouldRefreshToken()).toBe(false);
  });

  test('returns false when no expiresAt', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ accessToken: 'tok' });
    expect(shouldRefreshToken()).toBe(false);
  });

  test('returns false when token is still valid', () => {
    const mgr = createConfigManager(testDir);
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
    mgr.saveConfig({ accessToken: 'tok', expiresAt: future });
    expect(shouldRefreshToken()).toBe(false);
  });

  test('returns true when token expires within 5 minutes', () => {
    const mgr = createConfigManager(testDir);
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 min from now
    mgr.saveConfig({ accessToken: 'tok', expiresAt: soon });
    expect(shouldRefreshToken()).toBe(true);
  });

  test('returns true when token is expired', () => {
    const mgr = createConfigManager(testDir);
    const past = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    mgr.saveConfig({ accessToken: 'tok', expiresAt: past });
    expect(shouldRefreshToken()).toBe(true);
  });
});
