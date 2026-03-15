import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

describe('getDefaultConfigDir', () => {
  const originalEnv = process.env.SHYFT_CONFIG_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SHYFT_CONFIG_DIR;
    } else {
      process.env.SHYFT_CONFIG_DIR = originalEnv;
    }
  });

  test('returns SHYFT_CONFIG_DIR when set', async () => {
    process.env.SHYFT_CONFIG_DIR = '/tmp/custom-shyft';
    // Re-import to pick up env change
    const { getDefaultConfigDir } = await import('./constants.js');
    expect(getDefaultConfigDir()).toBe('/tmp/custom-shyft');
  });

  test('returns ~/.shyft when SHYFT_CONFIG_DIR is not set', async () => {
    delete process.env.SHYFT_CONFIG_DIR;
    const { getDefaultConfigDir } = await import('./constants.js');
    expect(getDefaultConfigDir()).toBe(join(homedir(), '.shyft'));
  });
});
