import { join } from 'path';
import { homedir } from 'os';

export const CONFIG_DIR_NAME = '.shyft';
export const CONFIG_FILE_NAME = 'config.json';
export const DEFAULT_API_URL = 'https://api.shyft.dev';

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  AUTH_REQUIRED: 2,
  AUTH_FAILED: 3,
  API_ERROR: 4,
  VALIDATION_ERROR: 5,
  TIMEOUT: 6,
} as const;

export function getDefaultConfigDir(): string {
  return process.env.SHYFT_CONFIG_DIR || join(homedir(), CONFIG_DIR_NAME);
}
