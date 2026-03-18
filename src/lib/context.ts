import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ShyftContext {
  productId?: string;
  featureId?: string;
}

export interface ContextManager {
  load(): ShyftContext;
  setProduct(id: string): void;
  setFeature(id: string): void;
  clearFeature(): void;
  clearProduct(): void;
  clearAll(): void;
  resolveProductId(explicit?: string): string;
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
    if (context.productId) clean.productId = context.productId;
    if (context.featureId) clean.featureId = context.featureId;
    writeFileSync(contextPath, JSON.stringify(clean, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  function setProduct(id: string): void {
    const current = load();
    save({ ...current, productId: id });
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

  function clearProduct(): void {
    const current = load();
    delete current.productId;
    delete current.featureId;
    save(current);
  }

  function clearAll(): void {
    save({});
  }

  function resolveProductId(explicit?: string): string {
    if (explicit) return explicit;
    const ctx = load();
    if (ctx.productId) return ctx.productId;
    throw new Error(
      'No product specified. Use --product <id> or run: shyft context set --product <id>',
    );
  }

  function resolveFeatureId(explicit?: string): string {
    if (explicit) return explicit;
    const ctx = load();
    if (ctx.featureId) return ctx.featureId;
    throw new Error(
      'No feature specified. Use <id> argument or run: shyft context set --feature <id>',
    );
  }

  return {
    load, setProduct, setFeature,
    clearFeature, clearProduct, clearAll,
    resolveProductId, resolveFeatureId,
  };
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
