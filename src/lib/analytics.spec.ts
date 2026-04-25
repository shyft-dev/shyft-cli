import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPhaseTracker } from './analytics.js';
import { createContextManager } from './context.js';

describe('PhaseTracker state management', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('getActivePhases returns empty object when no context file', () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    expect(tracker.getActivePhases()).toEqual({});
  });

  test('startPhase records phase start time', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker.startPhase('ideate', 'prod_123');
    const phases = tracker.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.startedAt).toBeGreaterThan(0);
    expect(phases.ideate.productId).toBe('prod_123');
  });

  test('startPhase persists to context.json activePhases', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker.startPhase('build', 'prod_123');
    const raw = readFileSync(join(tempDir, '.shyft', 'context.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.activePhases.build.productId).toBe('prod_123');
  });

  test('endPhase removes phase from state and returns duration', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker.startPhase('plan', 'prod_123');
    const result = await tracker.endPhase('plan');
    expect(result).not.toBeNull();
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.phase).toBe('plan');
    expect(tracker.getActivePhases().plan).toBeUndefined();
  });

  test('endPhase returns null for unknown phase', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    const result = await tracker.endPhase('nonexistent');
    expect(result).toBeNull();
  });

  test('startPhase stores featureId when provided', async () => {
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker.startPhase('verify', 'prod_123', 'feat_456');
    const phases = tracker.getActivePhases();
    expect(phases.verify.featureId).toBe('feat_456');
  });

  test('getActivePhases reads persisted state across instances', async () => {
    const ctx = createContextManager(tempDir);
    const tracker1 = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker1.startPhase('ideate', 'prod_123');

    const ctx2 = createContextManager(tempDir);
    const tracker2 = createPhaseTracker(ctx2, { sendEvent: async () => {} });
    const phases = tracker2.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.productId).toBe('prod_123');
  });

  test('phase data coexists with featureId in context', async () => {
    const ctx = createContextManager(tempDir);
    ctx.setFeature('feat_789');
    const tracker = createPhaseTracker(ctx, { sendEvent: async () => {} });
    await tracker.startPhase('build', 'prod_123');

    const loaded = ctx.load();
    expect(loaded.featureId).toBe('feat_789');
    expect(loaded.activePhases!.build.productId).toBe('prod_123');
  });
});

describe('PhaseTracker event sending', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('startPhase sends phase_started event', async () => {
    const events: any[] = [];
    const sender = { sendEvent: async (e: any) => { events.push(e); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    await tracker.startPhase('ideate', 'prod_1', 'feat_1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      productId: 'prod_1',
      featureId: 'feat_1',
      eventType: 'phase_started',
      phase: 'ideate',
      source: 'cli',
    });
  });

  test('endPhase sends phase_completed event with durationMs', async () => {
    const events: any[] = [];
    const sender = { sendEvent: async (e: any) => { events.push(e); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    await tracker.startPhase('build', 'prod_1');
    events.length = 0; // clear the start event
    await tracker.endPhase('build');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      productId: 'prod_1',
      eventType: 'phase_completed',
      phase: 'build',
      source: 'cli',
    });
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('startPhase does not throw when sendEvent fails', async () => {
    const sender = { sendEvent: async () => { throw new Error('network fail'); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    // Should not throw
    await tracker.startPhase('plan', 'prod_1');
    const phases = tracker.getActivePhases();
    expect(phases.plan).toBeDefined();
  });

  test('endPhase does not throw when sendEvent fails', async () => {
    let callCount = 0;
    const sender = { sendEvent: async () => { callCount++; if (callCount > 1) throw new Error('fail'); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    await tracker.startPhase('verify', 'prod_1');
    const result = await tracker.endPhase('verify');
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('verify');
  });

  test('startPhase passes metadata through', async () => {
    const events: any[] = [];
    const sender = { sendEvent: async (e: any) => { events.push(e); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    await tracker.startPhase('ideate', 'prod_1', undefined, { iteration: 2 });
    expect(events[0].metadata).toEqual({ iteration: 2 });
  });

  test('endPhase passes metadata through', async () => {
    const events: any[] = [];
    const sender = { sendEvent: async (e: any) => { events.push(e); } };
    const ctx = createContextManager(tempDir);
    const tracker = createPhaseTracker(ctx, sender);
    await tracker.startPhase('build', 'prod_1');
    events.length = 0;
    await tracker.endPhase('build', { linesChanged: 42 });
    expect(events[0].metadata).toEqual({ linesChanged: 42 });
  });
});
