import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getDefaultConfigDir, CONFIG_FILE_NAME } from './constants.js';

export interface ShyftConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiKey?: string;
  userId?: string;
  email?: string;
  teamId?: string;
  teamName?: string;
  apiUrl?: string;
}

export interface ConfigManager {
  loadConfig(): ShyftConfig;
  saveConfig(config: ShyftConfig): void;
  updateConfig(partial: Partial<ShyftConfig>): ShyftConfig;
  clearConfig(): void;
  isAuthenticated(): boolean;
  getAuthHeader(): string | null;
}

export function createConfigManager(configDir?: string): ConfigManager {
  const dir = configDir ?? getDefaultConfigDir();
  const configPath = join(dir, CONFIG_FILE_NAME);

  function ensureDir(): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  function loadConfig(): ShyftConfig {
    if (!existsSync(configPath)) return {};
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  function saveConfig(config: ShyftConfig): void {
    ensureDir();
    writeFileSync(configPath, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  function updateConfig(partial: Partial<ShyftConfig>): ShyftConfig {
    const current = loadConfig();
    const updated = { ...current, ...partial };
    saveConfig(updated);
    return updated;
  }

  function clearConfig(): void {
    if (existsSync(configPath)) {
      unlinkSync(configPath);
    }
  }

  function isAuthenticated(): boolean {
    const config = loadConfig();
    return !!(config.accessToken || config.apiKey);
  }

  function getAuthHeader(): string | null {
    const config = loadConfig();
    const token = config.accessToken || config.apiKey;
    return token ? `Bearer ${token}` : null;
  }

  return { loadConfig, saveConfig, updateConfig, clearConfig, isAuthenticated, getAuthHeader };
}

let defaultManager: ConfigManager | undefined;

export function getConfigManager(): ConfigManager {
  if (!defaultManager) {
    defaultManager = createConfigManager();
  }
  return defaultManager;
}

/** Reset the cached singleton (for testing). */
export function resetConfigManager(): void {
  defaultManager = undefined;
}
