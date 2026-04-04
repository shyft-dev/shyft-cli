import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPhaseTracker } from './analytics.js';

describe('PhaseTracker state management', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `shyft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('getActivePhases returns empty object when no phases file', () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    expect(tracker.getActivePhases()).toEqual({});
  });

  test('startPhase records phase start time', async () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    await tracker.startPhase('ideate', 'prod_123');
    const phases = tracker.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.startedAt).toBeGreaterThan(0);
    expect(phases.ideate.productId).toBe('prod_123');
  });

  test('startPhase persists to .shyft/phases.json', async () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    await tracker.startPhase('build', 'prod_123');
    const raw = readFileSync(join(tempDir, '.shyft', 'phases.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.build.productId).toBe('prod_123');
  });

  test('endPhase removes phase from state and returns duration', async () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    await tracker.startPhase('plan', 'prod_123');
    const result = await tracker.endPhase('plan');
    expect(result).not.toBeNull();
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.phase).toBe('plan');
    expect(tracker.getActivePhases().plan).toBeUndefined();
  });

  test('endPhase returns null for unknown phase', async () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    const result = await tracker.endPhase('nonexistent');
    expect(result).toBeNull();
  });

  test('startPhase stores featureId when provided', async () => {
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    await tracker.startPhase('verify', 'prod_123', 'feat_456');
    const phases = tracker.getActivePhases();
    expect(phases.verify.featureId).toBe('feat_456');
  });

  test('getActivePhases reads persisted state across instances', async () => {
    const tracker1 = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    await tracker1.startPhase('ideate', 'prod_123');

    const tracker2 = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    const phases = tracker2.getActivePhases();
    expect(phases.ideate).toBeDefined();
    expect(phases.ideate.productId).toBe('prod_123');
  });

  test('getActivePhases returns empty on corrupt JSON', () => {
    const shyftDir = join(tempDir, '.shyft');
    mkdirSync(shyftDir, { recursive: true });
    writeFileSync(join(shyftDir, 'phases.json'), 'not json');
    const tracker = createPhaseTracker(tempDir, { sendEvent: async () => {} });
    expect(tracker.getActivePhases()).toEqual({});
  });
});
