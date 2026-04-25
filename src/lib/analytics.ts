import { getApiClient } from './api-client.js';
import type { ContextManager } from './context.js';
import { getContextManager } from './context.js';

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

export function createPhaseTracker(contextManager: ContextManager, sender: PhaseEventSender): PhaseTracker {
  function getActivePhases(): Record<string, PhaseState> {
    return contextManager.getActivePhases();
  }

  async function startPhase(phase: string, productId: string, featureId?: string, metadata?: Record<string, unknown>): Promise<void> {
    const phases = contextManager.getActivePhases();
    phases[phase] = { startedAt: Date.now(), productId, featureId };
    contextManager.saveActivePhases(phases);

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
    const phases = contextManager.getActivePhases();
    const state = phases[phase];
    if (!state) return null;

    const durationMs = Date.now() - state.startedAt;
    delete phases[phase];
    contextManager.saveActivePhases(phases);

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

export function createApiEventSender(): PhaseEventSender {
  return {
    async sendEvent(event: PhaseEvent): Promise<void> {
      const client = getApiClient();
      await client.post('/analytics/lifecycle/events', event);
    },
  };
}

let defaultTracker: PhaseTracker | undefined;

export function getPhaseTracker(): PhaseTracker {
  if (!defaultTracker) {
    defaultTracker = createPhaseTracker(getContextManager(), createApiEventSender());
  }
  return defaultTracker;
}

/** Reset the cached singleton (for testing). */
export function resetPhaseTracker(): void {
  defaultTracker = undefined;
}
