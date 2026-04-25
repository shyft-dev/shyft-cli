import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ProjectConfig {
  productId?: string;
}

export interface ProjectConfigManager {
  load(): ProjectConfig;
  save(config: ProjectConfig): void;
  update(partial: Partial<ProjectConfig>): ProjectConfig;
  setProductId(id: string): void;
  resolveProductId(explicit?: string): string;
  exists(): boolean;
}

const CONFIG_DIR = '.shyft';
const CONFIG_FILE = 'config.json';

export function createProjectConfigManager(baseDir: string): ProjectConfigManager {
  const dirPath = join(baseDir, CONFIG_DIR);
  const filePath = join(dirPath, CONFIG_FILE);

  function ensureDir(): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  function exists(): boolean {
    return existsSync(filePath);
  }

  function load(): ProjectConfig {
    if (!existsSync(filePath)) return {};
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function save(config: ProjectConfig): void {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  function update(partial: Partial<ProjectConfig>): ProjectConfig {
    const current = load();
    const updated = { ...current, ...partial };
    save(updated);
    return updated;
  }

  function setProductId(id: string): void {
    update({ productId: id });
  }

  function resolveProductId(explicit?: string): string {
    if (explicit) return explicit;
    const config = load();
    if (config.productId) return config.productId;
    throw new Error(
      'No product specified. Use --product <id> or run: shyft context set --product <id>'
    );
  }

  return { load, save, update, setProductId, resolveProductId, exists };
}

let defaultManager: ProjectConfigManager | undefined;

export function getProjectConfigManager(): ProjectConfigManager {
  if (!defaultManager) {
    defaultManager = createProjectConfigManager(process.cwd());
  }
  return defaultManager;
}

/** Reset the cached singleton (for testing). */
export function resetProjectConfigManager(): void {
  defaultManager = undefined;
}
