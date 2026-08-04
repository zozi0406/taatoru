const DEFAULT_STABILITY_MS = 2_000;
const DEFAULT_AUTOMATIC_COOLDOWN_MS = 60_000;
const DEFAULT_MANUAL_COOLDOWN_MS = 5_000;

export interface RetryCoordinatorState {
  readonly running: boolean;
  readonly retryBlockedUntil: number;
}

export interface RetryCoordinatorOptions {
  readonly attempt: () => Promise<void>;
  readonly eligible: () => Promise<boolean>;
  readonly now?: () => number;
  readonly stabilityMs?: number;
  readonly automaticCooldownMs?: number;
  readonly manualCooldownMs?: number;
  readonly onStateChange?: (state: RetryCoordinatorState) => void;
}

export class RetryCoordinator {
  private readonly now: () => number;
  private readonly stabilityMs: number;
  private readonly automaticCooldownMs: number;
  private readonly manualCooldownMs: number;
  private previousReachable: boolean | null = null;
  private automaticTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAutomaticAt: number | null = null;
  private lastAttemptAt: number | null = null;
  private retryBlockedUntil = 0;
  private launching = false;
  private running = false;
  private disposed = false;

  constructor(private readonly options: RetryCoordinatorOptions) {
    this.now = options.now ?? Date.now;
    this.stabilityMs = options.stabilityMs ?? DEFAULT_STABILITY_MS;
    this.automaticCooldownMs =
      options.automaticCooldownMs ?? DEFAULT_AUTOMATIC_COOLDOWN_MS;
    this.manualCooldownMs =
      options.manualCooldownMs ?? DEFAULT_MANUAL_COOLDOWN_MS;
  }

  updateConnectivity(reachable: boolean): void {
    if (this.disposed) return;
    const reconnected = this.previousReachable === false && reachable;
    this.previousReachable = reachable;
    if (!reachable) {
      this.cancelAutomaticTimer();
      return;
    }
    if (reconnected && !this.launching && !this.running) {
      this.scheduleAutomatic();
    }
  }

  retryNow(): Promise<boolean> {
    const now = this.now();
    if (
      this.disposed ||
      this.launching ||
      this.running ||
      now < this.retryBlockedUntil ||
      (this.lastAttemptAt !== null &&
        now - this.lastAttemptAt < this.manualCooldownMs)
    ) {
      return Promise.resolve(false);
    }
    return this.launch('manual');
  }

  blockUntil(timestamp: string | null): void {
    if (timestamp === null) {
      this.retryBlockedUntil = 0;
    } else {
      const parsed = Date.parse(timestamp);
      if (Number.isFinite(parsed)) {
        this.retryBlockedUntil = Math.max(this.retryBlockedUntil, parsed);
      }
    }
    this.emitState();
  }

  getState(): RetryCoordinatorState {
    return {
      running: this.running,
      retryBlockedUntil: this.retryBlockedUntil,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAutomaticTimer();
  }

  private scheduleAutomatic(): void {
    this.cancelAutomaticTimer();
    const now = this.now();
    const cooldownUntil =
      this.lastAutomaticAt === null
        ? 0
        : this.lastAutomaticAt + this.automaticCooldownMs;
    const delay = Math.max(
      this.stabilityMs,
      cooldownUntil - now,
      this.retryBlockedUntil - now,
    );
    this.automaticTimer = setTimeout(() => {
      this.automaticTimer = null;
      if (
        !this.disposed &&
        this.previousReachable === true &&
        !this.launching &&
        !this.running
      ) {
        void this.launch('automatic');
      }
    }, delay);
  }

  private async launch(kind: 'automatic' | 'manual'): Promise<boolean> {
    if (this.disposed || this.launching || this.running) return false;
    this.launching = true;
    try {
      if (!(await this.options.eligible()) || this.disposed) return false;
      const now = this.now();
      if (now < this.retryBlockedUntil) return false;
      if (
        kind === 'automatic' &&
        this.lastAutomaticAt !== null &&
        now - this.lastAutomaticAt < this.automaticCooldownMs
      ) {
        return false;
      }
      if (
        this.lastAttemptAt !== null &&
        now - this.lastAttemptAt < this.manualCooldownMs
      ) {
        return false;
      }

      if (kind === 'automatic') this.lastAutomaticAt = now;
      this.lastAttemptAt = now;
      this.running = true;
      this.emitState();
      try {
        await this.options.attempt();
      } finally {
        this.running = false;
        this.emitState();
      }
      return true;
    } finally {
      this.launching = false;
    }
  }

  private cancelAutomaticTimer(): void {
    if (this.automaticTimer !== null) {
      clearTimeout(this.automaticTimer);
      this.automaticTimer = null;
    }
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState());
  }
}
