import { PythonWorker } from './worker';
import logger from '../logger';

interface QueuedRequest {
  functionName: string;
  args: any[];
  resolve: (result: any) => void;
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
      );
      initPromises.push(worker.initialize());
      this.workers.push(worker);
    }

    await Promise.all(initPromises);
    this.isInitialized = true;
    logger.debug(`Python worker pool initialized with ${this.workerCount} workers`);
  }

  async execute(functionName: string, args: any[]): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Worker pool not initialized');
    }

    // Try to get available worker
    const worker = this.getAvailableWorker();

    if (worker) {
      // Worker available, execute immediately
      return worker.call(functionName, args);
    } else {
      // All workers busy, queue the request
      return new Promise<any>((resolve, reject) => {
        this.queue.push({ functionName, args, resolve, reject });
        logger.debug(`Request queued (queue size: ${this.queue.length})`);
      });
    }
  }

  private getAvailableWorker(): PythonWorker | null {
    for (const worker of this.workers) {
      if (worker.isReady() && !worker.isBusy()) {
        // Wrap the call to process queue when done
        this.wrapWorkerCall(worker);
        return worker;
      }
    }
    return null;
  }

  private wrapWorkerCall(worker: PythonWorker): void {
    // Monkey-patch the worker's call method to process queue after completion
    const originalCall = worker.call.bind(worker);

    worker.call = async (functionName: string, args: any[]): Promise<any> => {
      try {
        return await originalCall(functionName, args);
      } finally {
        // After call completes, process queue
        this.processQueue();
      }
    };
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    const worker = this.getAvailableWorkerForQueue();
    if (!worker) {
      return; // No workers available
    }

    const request = this.queue.shift();
    if (!request) {
      return;
    }

    logger.debug(`Processing queued request (${this.queue.length} remaining)`);

    worker.call(request.functionName, request.args).then(request.resolve).catch(request.reject);
  }

  private getAvailableWorkerForQueue(): PythonWorker | null {
    // Don't re-wrap workers when processing queue
    for (const worker of this.workers) {
      if (worker.isReady() && !worker.isBusy()) {
        return worker;
      }
    }
    return null;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  async shutdown(): Promise<void> {
    logger.debug(`Shutting down Python worker pool (${this.workers.length} workers)`);

    // Shutdown all workers in parallel
    await Promise.all(this.workers.map((w) => w.shutdown()));

    this.workers = [];
    this.queue = [];
    this.isInitialized = false;

    logger.debug('Python worker pool shutdown complete');
  }
}
