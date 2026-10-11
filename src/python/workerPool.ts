import logger from '../logger';
import { validatePythonPath } from './pythonUtils';
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
  private shuttingDown: boolean = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private scriptPath: string,
    private functionName: string,
    private workerCount: number = 1,
    private pythonPath?: string,
    private timeout?: number,
  ) {}

  async initialize(): Promise<void> {
    if (this.shuttingDown) {
      throw new Error('Worker pool shutting down');
    }
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

    // Resolve once per pool, before starting workers, without sharing another
    // invocation's executable or environment. Crash restarts revalidate normally.
    const pythonPath = await validatePythonPath(
      this.pythonPath || 'python',
      typeof this.pythonPath === 'string',
    );
    if (this.shuttingDown) {
      throw new Error('Worker pool shutting down');
    }

    // Start all workers in parallel
    const initPromises = [];
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new PythonWorker(
        this.scriptPath,
        this.functionName,
        this.pythonPath,
        this.timeout,
        () => this.processQueue(), // Resume or reject queued work when availability changes
      );
      initPromises.push(worker.initialize(pythonPath));
      this.workers.push(worker);
    }

    try {
      await Promise.all(initPromises);
    } catch (error) {
      // Failed startup must release both ready and still-starting peers before retrying.
      await Promise.all(this.workers.splice(0).map((worker) => worker.shutdown()));
      throw error;
    }
    if (this.shuttingDown) {
      throw new Error('Worker pool shutting down');
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
    const worker = this.workers.find((worker) => worker.isReady() && !worker.isBusy()) ?? null;

    if (worker) {
      // Worker available, execute immediately and trigger queue processing when done
      return worker.call(functionName, args).finally(() => this.processQueue());
    } else {
      // Busy or restarting workers can serve this request once they become ready.
      return new Promise<unknown>((resolve, reject) => {
        this.queue.push({ functionName, args, resolve, reject });
        logger.debug(`Request queued (queue size: ${this.queue.length})`);
        this.processQueue();
      });
    }
  }

  private processQueue(): void {
    if (this.workers.length > 0 && this.workers.every((worker) => worker.hasFailed())) {
      for (const request of this.queue.splice(0)) {
        request.reject(
          new Error(
            `All ${this.workers.length} Python worker(s) for ${this.scriptPath} crashed and could not be restarted. Check the logs for the Python worker stderr output.`,
          ),
        );
      }
      return;
    }

    // Drain the entire queue - process all waiting requests with available workers
    while (this.queue.length > 0) {
      const worker = this.workers.find((worker) => worker.isReady() && !worker.isBusy()) ?? null;
      if (!worker) {
        return; // No workers available right now
      }

      const request = this.queue.shift()!;

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
    this.shutdownPromise ??= this.shutdownWorkers();
    return this.shutdownPromise;
  }

  private async shutdownWorkers(): Promise<void> {
    this.shuttingDown = true;
    this.isInitialized = false;
    logger.debug(`Shutting down Python worker pool (${this.workers.length} workers)`);

    // Reject any queued requests
    for (const req of this.queue.splice(0)) {
      req.reject(new Error('Worker pool shutting down'));
    }

    // Shutdown all workers in parallel
    await Promise.all(this.workers.map((w) => w.shutdown()));

    this.workers = [];

    logger.debug('Python worker pool shutdown complete');
  }
}
