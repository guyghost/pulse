/**
 * ConnectorRunner — remplace connectorActorMachine (XState) par des runes Svelte 5
 *
 * Cycle de vie : idle → detecting → fetching → done (ou erreur)
 * Avec boucle de retry (backoff exponentiel + jitter) depuis fetching
 */

import type { Mission } from '$lib/core/types/mission';
import type { AppError } from '$lib/core/errors/app-error';
import { createConnectorError, isRetryable } from '$lib/core/errors/app-error';
import type { Result } from '$lib/core/errors/result';

// ============================================================================
// Types
// ============================================================================

type DetectFn = (now: number) => Promise<Result<boolean, AppError>>;
type FetchFn = (now: number) => Promise<Result<Mission[], AppError>>;

export type ConnectorActorInput = {
  connectorId: string;
  connectorName: string;
  detectSession: DetectFn;
  fetchMissions: FetchFn;
  maxRetries?: number;
};

export type ConnectorRunnerOutput = {
  missions: Mission[];
  error: AppError | null;
  retryCount: number;
  completedAt: number | null;
  connectorId: string;
};

export type ConnectorRunnerState = 'idle' | 'detecting' | 'fetching' | 'retrying' | 'done';

export type ConnectorRunnerProgress = {
  state: ConnectorRunnerState;
  retryCount: number;
};

// ============================================================================
// Helpers
// ============================================================================

/** Calcule le délai de backoff exponentiel avec jitter (max 10s) */
export function computeBackoff(retryCount: number): number {
  const base = Math.min(1000 * Math.pow(2, retryCount), 10_000);
  const jitter = base * 0.3 * Math.random();
  return base + jitter;
}

// ============================================================================
// ConnectorRunner
// ============================================================================

export class ConnectorRunner {
  readonly connectorId: string;
  readonly connectorName: string;

  state = $state<ConnectorRunnerState>('idle');
  missions = $state<Mission[]>([]);
  error = $state<AppError | null>(null);
  retryCount = $state(0);
  completedAt = $state<number | null>(null);

  private readonly detectSession: DetectFn;
  private readonly fetchMissions: FetchFn;
  private readonly maxRetries: number;
  private readonly onProgress?: (progress: ConnectorRunnerProgress) => void;

  constructor(input: ConnectorActorInput & { onProgress?: (progress: ConnectorRunnerProgress) => void }) {
    this.connectorId = input.connectorId;
    this.connectorName = input.connectorName;
    this.detectSession = input.detectSession;
    this.fetchMissions = input.fetchMissions;
    this.maxRetries = input.maxRetries ?? 3;
    this.onProgress = input.onProgress;
  }

  private notifyProgress() {
    this.onProgress?.({ state: this.state, retryCount: this.retryCount });
  }

  async run(): Promise<ConnectorRunnerOutput> {
    // Phase : detecting
    this.state = 'detecting';
    this.notifyProgress();

    let detectResult: Result<boolean, AppError>;
    try {
      detectResult = await this.detectSession(Date.now());
    } catch (err) {
      this.error = createConnectorError(
        err instanceof Error ? err.message : 'Erreur inattendue lors de la détection',
        { connectorId: this.connectorId, phase: 'detect', recoverable: false },
        Date.now(),
      );
      this.completedAt = Date.now();
      this.state = 'done';
      this.notifyProgress();
      return this.toOutput();
    }

    if (!detectResult.ok) {
      this.error = detectResult.error;
      this.completedAt = Date.now();
      this.state = 'done';
      this.notifyProgress();
      return this.toOutput();
    }

    if (!detectResult.value) {
      this.error = createConnectorError(
        'Session non détectée',
        { connectorId: this.connectorId, phase: 'detect', recoverable: true },
        Date.now(),
      );
      this.completedAt = Date.now();
      this.state = 'done';
      this.notifyProgress();
      return this.toOutput();
    }

    // Phase : fetching (avec retry)
    while (true) {
      this.state = 'fetching';
      this.notifyProgress();

      let fetchResult: Result<Mission[], AppError>;
      try {
        fetchResult = await this.fetchMissions(Date.now());
      } catch (err) {
        this.error = createConnectorError(
          err instanceof Error ? err.message : 'Erreur inattendue lors du fetch',
          { connectorId: this.connectorId, phase: 'fetch', recoverable: false },
          Date.now(),
        );
        this.completedAt = Date.now();
        this.state = 'done';
        this.notifyProgress();
        return this.toOutput();
      }

      if (fetchResult.ok) {
        this.missions = fetchResult.value;
        this.error = null;
        this.completedAt = Date.now();
        this.state = 'done';
        this.notifyProgress();
        return this.toOutput();
      }

      // Erreur fetch : vérifier retry
      const fetchError = fetchResult.error;
      if (isRetryable(fetchError) && this.retryCount < this.maxRetries) {
        this.error = fetchError;
        this.retryCount += 1;
        this.state = 'retrying';
        this.notifyProgress();

        const delay = computeBackoff(this.retryCount);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        // retour au début de la boucle → fetching
        continue;
      }

      // Non retryable ou max retries atteint
      this.error = fetchError;
      this.completedAt = Date.now();
      this.state = 'done';
      this.notifyProgress();
      return this.toOutput();
    }
  }

  private toOutput(): ConnectorRunnerOutput {
    return {
      missions: this.missions,
      error: this.error,
      retryCount: this.retryCount,
      completedAt: this.completedAt,
      connectorId: this.connectorId,
    };
  }
}
