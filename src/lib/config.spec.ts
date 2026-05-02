import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConfigManager } from './config.js';

describe('config manager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test('loadConfig returns empty object when no config file exists', () => {
    const mgr = createConfigManager(testDir);
    expect(mgr.loadConfig()).toEqual({});
  });

  test('saveConfig creates file and loadConfig reads it back', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'test-key', email: 'test@example.com' });
    const config = mgr.loadConfig();
    expect(config.apiKey).toBe('test-key');
    expect(config.email).toBe('test@example.com');
  });

  test('updateConfig merges partial updates', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'key1', email: 'a@b.com' });
    mgr.updateConfig({ email: 'new@b.com', teamId: 'team1' });
    const config = mgr.loadConfig();
    expect(config.apiKey).toBe('key1');
    expect(config.email).toBe('new@b.com');
    expect(config.teamId).toBe('team1');
  });

  test('clearConfig removes the config file', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'key' });
    mgr.clearConfig();
    expect(mgr.loadConfig()).toEqual({});
  });

  test('isAuthenticated returns true with accessToken', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ accessToken: 'tok' });
    expect(mgr.isAuthenticated()).toBe(true);
  });

  test('isAuthenticated returns true with apiKey', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'key' });
    expect(mgr.isAuthenticated()).toBe(true);
  });

  test('isAuthenticated returns false when empty', () => {
    const mgr = createConfigManager(testDir);
    expect(mgr.isAuthenticated()).toBe(false);
  });

  test('getAuthHeader prefers accessToken over apiKey', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ accessToken: 'tok', apiKey: 'key' });
    expect(mgr.getAuthHeader()).toBe('Bearer tok');
  });

  test('getAuthHeader falls back to apiKey', () => {
    const mgr = createConfigManager(testDir);
    mgr.saveConfig({ apiKey: 'key' });
    expect(mgr.getAuthHeader()).toBe('Bearer key');
  });

  test('getAuthHeader returns null when not authenticated', () => {
    const mgr = createConfigManager(testDir);
    expect(mgr.getAuthHeader()).toBeNull();
  });

  test('loadConfig returns empty object on corrupt JSON', () => {
    const mgr = createConfigManager(testDir);
    writeFileSync(join(testDir, 'config.json'), 'not json{{{');
    expect(mgr.loadConfig()).toEqual({});
  });
});
