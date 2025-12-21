import logger from '../logger';
import type { GlobalSemaphore } from './semaphore';
import type { LaneLimits, ProviderLaneStats, Task, TaskRunResult } from './types';

interface QueueItem {
  task: Task;
  resolve: () => void;
  reject: (err: Error) => void;
}

interface LaneOptions {
  providerKey: string;
  semaphore: GlobalSemaphore;
  shouldStop: () => boolean;
}

export class ProviderLane {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent = Infinity;
  private maxConcurrentDynamic = Infinity;
  private rpm?: number;
  private tpm?: number;
  private minGapMs = 0;
  private nextReqAt = 0;
  private nextTokAt = 0;
  private blockedUntil = 0;
  private timer: NodeJS.Timeout | undefined;
  private nextWakeAt = 0;
  private pumping = false;
  private stopped = false;
  private successStreak = 0;
  private totalStarted = 0;
  private totalCompleted = 0;
  private totalEstimatedTokens = 0;
  private maxQueueDepth = 0;
  private rateLimitEvents = 0;
  private firstStartedAt = 0;
  private lastStartedAt = 0;

  private readonly providerKey: string;
  private readonly semaphore: GlobalSemaphore;
  private readonly shouldStop: () => boolean;

  constructor(options: LaneOptions) {
    this.providerKey = options.providerKey;
    this.semaphore = options.semaphore;
    this.shouldStop = options.shouldStop;
  }

  add(task: Task): Promise<void> {
    if (this.stopped || this.shouldStop()) {
      return Promise.reject(new Error('Orchestrator stopped'));
    }
    this.applyLimits(task.limits);
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      if (this.queue.length > this.maxQueueDepth) {
        this.maxQueueDepth = this.queue.length;
      }
      this.pump();
    });
  }

  stop(reason: Error): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.nextWakeAt = 0;
    }
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject(reason);
    }
  }

  private applyLimits(limits?: LaneLimits): void {
    if (!limits) {
      return;
    }
    if (typeof limits.maxConcurrent === 'number') {
      this.maxConcurrent = Math.min(this.maxConcurrent, limits.maxConcurrent);
      this.maxConcurrentDynamic = Math.min(this.maxConcurrentDynamic, limits.maxConcurrent);
    }
    if (typeof limits.rpm === 'number') {
      this.rpm = this.rpm ? Math.min(this.rpm, limits.rpm) : limits.rpm;
    }
    if (typeof limits.tpm === 'number') {
      this.tpm = this.tpm ? Math.min(this.tpm, limits.tpm) : limits.tpm;
    }
    if (typeof limits.minGapMs === 'number') {
      this.minGapMs = Math.max(this.minGapMs, limits.minGapMs);
    }
  }

  private pump(): void {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    void this.pumpLoop();
  }

  private async pumpLoop(): Promise<void> {
    try {
      while (true) {
        if (this.stopped || this.shouldStop()) {
          return;
        }
        if (this.queue.length === 0) {
          return;
        }
        if (this.activeCount >= this.maxConcurrentDynamic) {
          return;
        }

        const nextItem = this.queue[0];
        const startAt = this.getStartAt(nextItem.task);
        const now = Date.now();

        if (startAt > now) {
          this.scheduleTimer(startAt - now);
          return;
        }

        const task = nextItem.task;
        this.queue.shift();
        this.activeCount++;
        this.totalStarted += 1;
        if (task.estimatedTokens) {
          this.totalEstimatedTokens += task.estimatedTokens;
        }
        if (!this.firstStartedAt) {
          this.firstStartedAt = now;
        }
        this.lastStartedAt = now;
        this.updateRateState(task, now);
        void this.semaphore.acquire().then(() => {
          if (this.stopped || this.shouldStop()) {
            this.activeCount--;
            this.semaphore.release();
            nextItem.reject(new Error('Orchestrator stopped'));
            this.pump();
            return;
          }

          task
            .run()
            .then((result) => {
              this.handleTaskResult(result);
              nextItem.resolve();
              this.recordSuccess();
            })
            .catch((err) => {
              logger.error(
                `Orchestrator: Uncaught error in task ${task.id} (lane ${this.providerKey}): ${err}`,
              );
              nextItem.reject(err instanceof Error ? err : new Error(String(err)));
            })
            .finally(() => {
              this.semaphore.release();
              this.activeCount--;
              this.totalCompleted += 1;
              this.pump();
            });
        });

        // Keep looping to fill available lane capacity.
      }
    } finally {
      this.pumping = false;
    }
  }

  private getStartAt(task: Task): number {
    const now = Date.now();
    const startAt = Math.max(
      now,
      this.blockedUntil,
      this.nextReqAt,
      this.nextTokAt,
      task.notBefore ?? 0,
    );
    return startAt;
  }

  private updateRateState(task: Task, now: number): void {
    const rpmSpacingMs = this.rpm ? 60_000 / this.rpm : 0;
    const reqSpacingMs = Math.max(this.minGapMs, rpmSpacingMs);
    if (reqSpacingMs > 0) {
      this.nextReqAt = Math.max(this.nextReqAt, now) + reqSpacingMs;
    }

    if (this.tpm && task.estimatedTokens) {
      const tokenSpacingMs = (task.estimatedTokens * 60_000) / this.tpm;
      this.nextTokAt = Math.max(this.nextTokAt, now) + tokenSpacingMs;
    }
  }

  private scheduleTimer(waitMs: number): void {
    const wakeAt = Date.now() + waitMs;
    if (this.timer && this.nextWakeAt <= wakeAt) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.nextWakeAt = wakeAt;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.nextWakeAt = 0;
      this.pump();
    }, waitMs);
  }

  private recordRateLimit(retryAfterMs?: number): void {
    if (retryAfterMs) {
      this.blockedUntil = Math.max(this.blockedUntil, Date.now() + retryAfterMs);
    }
    this.maxConcurrentDynamic = Math.max(1, Math.floor(this.maxConcurrentDynamic / 2));
    this.successStreak = 0;
    this.rateLimitEvents += 1;
  }

  private recordSuccess(): void {
    this.successStreak += 1;
    if (this.successStreak < 10) {
      return;
    }
    this.successStreak = 0;
    if (Number.isFinite(this.maxConcurrent) && this.maxConcurrentDynamic < this.maxConcurrent) {
      this.maxConcurrentDynamic += 1;
    }
  }

  handleTaskResult(result: TaskRunResult | void): void {
    if (!result?.rateLimit) {
      return;
    }
    this.recordRateLimit(result.rateLimit.retryAfterMs);
  }

  getStats(): ProviderLaneStats {
    const elapsedMs =
      this.firstStartedAt && this.lastStartedAt
        ? Math.max(this.lastStartedAt - this.firstStartedAt, 1)
        : 0;
    const minutes = elapsedMs > 0 ? elapsedMs / 60_000 : 0;
    const effectiveRpm = minutes > 0 ? this.totalStarted / minutes : 0;
    const effectiveTpm = minutes > 0 ? this.totalEstimatedTokens / minutes : 0;

    return {
      providerKey: this.providerKey,
      queueDepth: this.queue.length,
      maxQueueDepth: this.maxQueueDepth,
      inFlight: this.activeCount,
      maxConcurrent: this.maxConcurrent,
      maxConcurrentDynamic: this.maxConcurrentDynamic,
      rpm: this.rpm,
      tpm: this.tpm,
      totalStarted: this.totalStarted,
      totalCompleted: this.totalCompleted,
      totalEstimatedTokens: this.totalEstimatedTokens,
      rateLimitEvents: this.rateLimitEvents,
      elapsedMs,
      effectiveRpm,
      effectiveTpm,
    };
  }
}
