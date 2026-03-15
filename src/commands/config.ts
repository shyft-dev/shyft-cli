import { Command } from 'commander';
import { getConfigManager, type ShyftConfig } from '../lib/config.js';
import { output, info, success, error, isJsonMode } from '../utils/output.js';
import { EXIT_CODES } from '../lib/constants.js';

const SENSITIVE_KEYS = new Set(['accessToken', 'refreshToken', 'apiKey']);
const SETTABLE_KEYS = new Set(['apiUrl']);

function redactConfig(config: ShyftConfig): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEYS.has(key)) {
      redacted[key] = '***';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export const configCommand = new Command('config')
  .description('View or modify CLI configuration')
  .action(() => {
    const mgr = getConfigManager();
    const config = mgr.loadConfig();
    const redacted = redactConfig(config);

    if (Object.keys(redacted).length === 0) {
      if (isJsonMode()) {
        output({});
      } else {
        info('No configuration set. Run `shyft login` to get started.');
      }
      return;
    }

    output(redacted);
  });

configCommand
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    const mgr = getConfigManager();
    const config = mgr.loadConfig();
    const value = (config as Record<string, unknown>)[key];

    if (value === undefined) {
      error(`Key "${key}" is not set.`);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }

    if (SENSITIVE_KEYS.has(key)) {
      if (isJsonMode()) {
        output({ [key]: '***' });
      } else {
        info('***');
      }
    } else {
      if (isJsonMode()) {
        output({ [key]: value });
      } else {
        info(String(value));
      }
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    if (!SETTABLE_KEYS.has(key)) {
      error(`Cannot set "${key}". Settable keys: ${[...SETTABLE_KEYS].join(', ')}`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }

    const mgr = getConfigManager();
    mgr.updateConfig({ [key]: value } as Partial<ShyftConfig>);
    success(`Set ${key} = ${value}`);

    if (isJsonMode()) {
      output({ [key]: value });
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults (preserves auth)')
  .action(() => {
    const mgr = getConfigManager();
    const config = mgr.loadConfig();

    const authFields: Partial<ShyftConfig> = {};
    if (config.accessToken) authFields.accessToken = config.accessToken;
    if (config.refreshToken) authFields.refreshToken = config.refreshToken;
    if (config.expiresAt) authFields.expiresAt = config.expiresAt;
    if (config.apiKey) authFields.apiKey = config.apiKey;
    if (config.userId) authFields.userId = config.userId;
    if (config.email) authFields.email = config.email;
    if (config.teamId) authFields.teamId = config.teamId;
    if (config.teamName) authFields.teamName = config.teamName;

    mgr.saveConfig(authFields);
    success('Configuration reset to defaults (auth preserved).');

    if (isJsonMode()) {
      output({ status: 'ok' });
    }
  });
