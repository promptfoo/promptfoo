import logger from '../logger';
import { PythonWorker } from './worker';

interface QueuedRequest {
  functionName: string;
  args: unknown[];
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class PythonWorkerPool {
  private workers: PythonWorker[] = [];
  private queue: QueuedRequest[] = [];
  private isInitialized: boolean = false;

  constructor(
    private scriptPath: string,
    private functionName: string,
    private workerCount: number = 1,
    private pythonPath?: string,
    private timeout?: number,
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Validate worker count
    if (this.workerCount < 1) {
      throw new Error(`Invalid worker count: ${this.workerCount}. Must be at least 1.`);
    }

    // Warn on excessive workers
    if (this.workerCount > 8) {
      logger.warn(
        `Spawning ${this.workerCount} Python workers for ${this.scriptPath}. ` +
          `This may use significant memory if your script has heavy imports.`,
      );
    }

    logger.debug(
      `Initializing Python worker pool with ${this.workerCount} workers for ${this.scriptPath}`,
    );

    // Start all workers in parallel
    const initPromises = [];
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new PythonWorker(
        this.scriptPath,
        this.functionName,
        this.pythonPath,
        this.timeout,
        () => this.processQueue(), // Dispatch or fail queued requests when worker state changes
      );
      initPromises.push(worker.initialize());
      this.workers.push(worker);
    }

    const results = await Promise.allSettled(initPromises);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) {
      // Don't leave the workers that did start running with nothing to shut them down.
      await Promise.all(this.workers.map((worker) => worker.shutdown()));
      this.workers = [];
      throw failure.reason;
    }

    this.isInitialized = true;
    logger.debug(`Python worker pool initialized with ${this.workerCount} workers`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: FIXME
  async execute(functionName: string, args: unknown[]): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Worker pool not initialized');
    }

    // Try to get available worker
    const worker = this.getAvailableWorker();

    if (worker) {
      // Worker available, execute immediately and trigger queue processing when done
      return worker.call(functionName, args).finally(() => this.processQueue());
    }

    // Queuing when no worker can ever become available again would never settle.
    if (this.allWorkersDead()) {
      throw this.createAllWorkersDeadError();
    }

    // All workers busy or restarting, queue the request
    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({ functionName, args, resolve, reject });
      logger.debug(`Request queued (queue size: ${this.queue.length})`);
    });
  }

  private allWorkersDead(): boolean {
    return this.workers.length > 0 && this.workers.every((worker) => worker.isDead());
  }

  private createAllWorkersDeadError(): Error {
    return new Error(
      `All ${this.workers.length} Python worker(s) for ${this.scriptPath} crashed and could not be restarted. ` +
        'Check the logs for the Python worker stderr output.',
    );
  }

  private rejectQueue(error: Error): void {
    const queued = this.queue;
    this.queue = [];
    for (const request of queued) {
      try {
        request.reject(error);
      } catch {
        // Ignore errors from rejecting
      }
    }
  }

  private getAvailableWorker(): PythonWorker | null {
    for (const worker of this.workers) {
      if (worker.isReady() && !worker.isBusy()) {
        return worker;
      }
    }
    return null;
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.allWorkersDead()) {
      this.rejectQueue(this.createAllWorkersDeadError());
      return;
    }

    // Drain the entire queue - process all waiting requests with available workers
    while (this.queue.length > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) {
        return; // No workers available right now
      }

      const request = this.queue.shift();
      if (!request) {
        return;
      }

      logger.debug(`Processing queued request (${this.queue.length} remaining)`);

      // Execute and attach queue processing to continue draining when done
      worker
        .call(request.functionName, request.args)
        .then(request.resolve)
        .catch(request.reject)
        .finally(() => this.processQueue());
    }
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  async shutdown(): Promise<void> {
    logger.debug(`Shutting down Python worker pool (${this.workers.length} workers)`);

    // Reject new requests from now on, not only once every worker has stopped
    this.isInitialized = false;

    // Reject any queued requests
    this.rejectQueue(new Error('Worker pool shutting down'));

    // Detach the workers first so an initialize() during shutdown starts fresh ones
    const workers = this.workers;
    this.workers = [];
    this.queue = [];

    // Shutdown all workers in parallel
    await Promise.all(workers.map((w) => w.shutdown()));

    logger.debug('Python worker pool shutdown complete');
  }
}
