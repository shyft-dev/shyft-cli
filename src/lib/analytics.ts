import { getApiClient } from './api-client.js';
import type { ContextManager } from './context.js';
import { getContextManager } from './context.js';

export interface PhaseState {
  sessionId: string;
  startedAt: number;
  productId: string;
  featureId?: string;
}

export interface StartPhaseResult {
  sessionId: string;
  eventId: string;
}

export interface EndPhaseResult {
  phase: string;
  sessionId: string;
  durationMs: number;
  productId: string;
  featureId?: string;
  eventId: string;
}

export interface EndPhaseOptions {
  sessionId?: string;
  productId?: string;
  featureId?: string;
  status?: string;
  reason?: string;
  durationMs?: number;
  costUsd?: number;
  tokensInput?: number;
  tokensOutput?: number;
  tokensCacheRead?: number;
  tokensCacheWrite?: number;
  modelUsage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OpenPhase {
  phase: string;
  sessionId: string;
  productId: string;
  featureId?: string;
  startedAt: string;
  elapsedMs: number;
}

export interface StatusResult {
  openPhases: OpenPhase[];
}

export interface StatusOptions {
  featureId?: string;
  productId?: string;
  sessionId?: string;
}

export interface PhaseApiClient {
  startPhase(params: {
    phase: string;
    productId: string;
    featureId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ sessionId: string; eventId: string }>;

  endPhase(params: {
    phase: string;
    sessionId: string;
    productId: string;
    featureId?: string;
    durationMs?: number;
    status?: string;
    reason?: string;
    costUsd?: number;
    tokensInput?: number;
    tokensOutput?: number;
    tokensCacheRead?: number;
    tokensCacheWrite?: number;
    modelUsage?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; eventId: string; durationMs: number }>;

  getStatus(params?: StatusOptions): Promise<StatusResult>;
}

export interface PhaseTracker {
  getActivePhases(): Record<string, PhaseState>;
  startPhase(phase: string, productId: string, featureId?: string, metadata?: Record<string, unknown>): Promise<StartPhaseResult>;
  endPhase(phase: string, options?: EndPhaseOptions): Promise<EndPhaseResult | null>;
  getStatus(options?: StatusOptions): Promise<StatusResult>;
}

export function createPhaseTracker(contextManager: ContextManager, apiClient: PhaseApiClient): PhaseTracker {
  function getActivePhases(): Record<string, PhaseState> {
    return contextManager.getActivePhases();
  }

  async function startPhase(phase: string, productId: string, featureId?: string, metadata?: Record<string, unknown>): Promise<StartPhaseResult> {
    const result = await apiClient.startPhase({
      phase,
      productId,
      featureId,
      metadata,
    });

    const phases = contextManager.getActivePhases();
    phases[phase] = {
      sessionId: result.sessionId,
      startedAt: Date.now(),
      productId,
      featureId,
    };
    contextManager.saveActivePhases(phases);

    return result;
  }

  async function endPhase(phase: string, options?: EndPhaseOptions): Promise<EndPhaseResult | null> {
    const phases = contextManager.getActivePhases();
    const state = phases[phase];

    const sessionId = options?.sessionId ?? state?.sessionId;
    const productId = options?.productId ?? state?.productId;
    const featureId = options?.featureId ?? state?.featureId;

    if (!sessionId || !productId) return null;

    const durationMs = options?.durationMs ?? (state ? Date.now() - state.startedAt : undefined);

    const result = await apiClient.endPhase({
      phase,
      sessionId,
      productId,
      featureId,
      durationMs,
      status: options?.status,
      reason: options?.reason,
      costUsd: options?.costUsd,
      tokensInput: options?.tokensInput,
      tokensOutput: options?.tokensOutput,
      tokensCacheRead: options?.tokensCacheRead,
      tokensCacheWrite: options?.tokensCacheWrite,
      modelUsage: options?.modelUsage,
      metadata: options?.metadata,
    });

    if (state) {
      delete phases[phase];
      contextManager.saveActivePhases(phases);
    }

    return {
      phase,
      sessionId,
      durationMs: result.durationMs,
      productId,
      featureId,
      eventId: result.eventId,
    };
  }

  async function getStatus(options?: StatusOptions): Promise<StatusResult> {
    return apiClient.getStatus(options);
  }

  return { getActivePhases, startPhase, endPhase, getStatus };
}

export function createPhaseApiClient(): PhaseApiClient {
  return {
    async startPhase(params) {
      const client = getApiClient();
      const { data } = await client.post('/analytics/phases/start', params);
      return data;
    },

    async endPhase(params) {
      const client = getApiClient();
      const { data } = await client.post('/analytics/phases/end', params);
      return data;
    },

    async getStatus(params) {
      const client = getApiClient();
      const { data } = await client.get('/analytics/phases/status', { params });
      return data;
    },
  };
}

let defaultTracker: PhaseTracker | undefined;

export function getPhaseTracker(): PhaseTracker {
  if (!defaultTracker) {
    defaultTracker = createPhaseTracker(getContextManager(), createPhaseApiClient());
  }
  return defaultTracker;
}

/** Reset the cached singleton (for testing). */
export function resetPhaseTracker(): void {
  defaultTracker = undefined;
}
