import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ShyftContext {
  featureId?: string;
}

export interface ContextManager {
  load(): ShyftContext;
  setFeature(id: string): void;
  clearFeature(): void;
  clearAll(): void;
  resolveFeatureId(explicit?: string): string;
}

const CONTEXT_DIR = '.shyft';
const CONTEXT_FILE = 'context.json';

export function createContextManager(baseDir: string): ContextManager {
  const contextDir = join(baseDir, CONTEXT_DIR);
  const contextPath = join(contextDir, CONTEXT_FILE);

  function ensureDir(): void {
    if (!existsSync(contextDir)) {
      mkdirSync(contextDir, { recursive: true, mode: 0o700 });
    }
  }

  function load(): ShyftContext {
    if (!existsSync(contextPath)) return {};
    try {
      const content = readFileSync(contextPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  function save(context: ShyftContext): void {
    ensureDir();
    const clean: ShyftContext = {};
    if (context.featureId) clean.featureId = context.featureId;
    writeFileSync(contextPath, JSON.stringify(clean, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  function setFeature(id: string): void {
    const current = load();
    save({ ...current, featureId: id });
  }

  function clearFeature(): void {
    const current = load();
    delete current.featureId;
    save(current);
  }

  function clearAll(): void {
    save({});
  }

  function resolveFeatureId(explicit?: string): string {
    if (explicit) return explicit;
    const ctx = load();
    if (ctx.featureId) return ctx.featureId;
    throw new Error(
      'No feature specified. Use <id> argument or run: shyft context set --feature <id>',
    );
  }

  return { load, setFeature, clearFeature, clearAll, resolveFeatureId };
}

let defaultManager: ContextManager | undefined;

export function getContextManager(): ContextManager {
  if (!defaultManager) {
    defaultManager = createContextManager(process.cwd());
  }
  return defaultManager;
}

/** Reset the cached singleton (for testing). */
export function resetContextManager(): void {
  defaultManager = undefined;
}
