import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface PhaseState {
  startedAt: number;
  productId: string;
  featureId?: string;
}

export interface PhaseResult {
  phase: string;
  durationMs: number;
  productId: string;
  featureId?: string;
}

export interface PhaseEventSender {
  sendEvent(event: PhaseEvent): Promise<void>;
}

export interface PhaseEvent {
  productId: string;
  featureId?: string;
  eventType: 'phase_started' | 'phase_completed';
  phase: string;
  source: 'cli';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface PhaseTracker {
  getActivePhases(): Record<string, PhaseState>;
  startPhase(phase: string, productId: string, featureId?: string, metadata?: Record<string, unknown>): Promise<void>;
  endPhase(phase: string, metadata?: Record<string, unknown>): Promise<PhaseResult | null>;
}

const SHYFT_DIR = '.shyft';
const PHASES_FILE = 'phases.json';

export function createPhaseTracker(baseDir: string, sender: PhaseEventSender): PhaseTracker {
  const dirPath = join(baseDir, SHYFT_DIR);
  const filePath = join(dirPath, PHASES_FILE);

  function ensureDir(): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  function loadPhases(): Record<string, PhaseState> {
    if (!existsSync(filePath)) return {};
    try {
      const raw = readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function savePhases(phases: Record<string, PhaseState>): void {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(phases, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  function getActivePhases(): Record<string, PhaseState> {
    return loadPhases();
  }

  async function startPhase(phase: string, productId: string, featureId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const phases = loadPhases();
    phases[phase] = { startedAt: Date.now(), productId, featureId };
    savePhases(phases);

    try {
      await sender.sendEvent({
        productId,
        featureId,
        eventType: 'phase_started',
        phase,
        source: 'cli',
        metadata,
      });
    } catch {
      // fire-and-forget
    }
  }

  async function endPhase(phase: string, metadata?: Record<string, unknown>): Promise<PhaseResult | null> {
    const phases = loadPhases();
    const state = phases[phase];
    if (!state) return null;

    const durationMs = Date.now() - state.startedAt;
    delete phases[phase];
    savePhases(phases);

    try {
      await sender.sendEvent({
        productId: state.productId,
        featureId: state.featureId,
        eventType: 'phase_completed',
        phase,
        source: 'cli',
        durationMs,
        metadata,
      });
    } catch {
      // fire-and-forget
    }

    return { phase, durationMs, productId: state.productId, featureId: state.featureId };
  }

  return { getActivePhases, startPhase, endPhase };
}
