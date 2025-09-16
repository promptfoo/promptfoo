import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';

import logger from '../logger';
import { safeJsonStringify } from '../util/json';

export interface PersistentPythonConfig {
  pythonExecutable?: string;
  // Legacy configs maintained for backwards compatibility but not exposed in docs
  persistentIdleTimeout?: number;
  maxRestarts?: number;
  concurrency?: 'serial' | 'async';
  // Health monitoring configuration
  healthCheck?: {
    enabled?: boolean;
    quickIntervalMs?: number; // Fast ping checks (default: 5000ms)
    detailedIntervalMs?: number; // Detailed health checks (default: 30000ms)
    maxFailures?: number; // Max consecutive failures before restart (default: 3)
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export class PersistentPythonManager extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private idleTimer: NodeJS.Timeout | null = null;
  private restartCount = 0;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private isShuttingDown = false;

  // Concurrency control
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingRequest = false;

  private readonly scriptPath: string;
  private readonly providerId: string;
  private readonly config: Required<
    Pick<
      PersistentPythonConfig,
      'pythonExecutable' | 'persistentIdleTimeout' | 'maxRestarts' | 'concurrency'
    >
  > & {
    healthCheck: Required<NonNullable<PersistentPythonConfig['healthCheck']>>;
  };
  private buffer = '';

  constructor(scriptPath: string, providerId: string, config: PersistentPythonConfig = {}) {
    super();
    this.scriptPath = scriptPath;
    this.providerId = providerId;
    this.config = {
      pythonExecutable: config.pythonExecutable || 'python',
      // Use longer timeout for testing environments or when specified
      persistentIdleTimeout:
        config.persistentIdleTimeout || (process.env.NODE_ENV === 'test' ? 600000 : 300000), // 10 min for tests, 5 min for production
      maxRestarts: config.maxRestarts || 3,
      concurrency: config.concurrency || 'serial',
      healthCheck: {
        enabled: config.healthCheck?.enabled !== false, // Default to enabled
        quickIntervalMs: config.healthCheck?.quickIntervalMs || 5000,
        detailedIntervalMs: config.healthCheck?.detailedIntervalMs || 30000,
        maxFailures: config.healthCheck?.maxFailures || 3,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      await this._startPythonProcess();

      // Initialize the Python script
      const initResult = await this._sendRequest({
        type: 'initialize',
        script_path: this.scriptPath,
      });

      if (initResult.result?.error) {
        throw new Error(`Failed to initialize Python script: ${initResult.result.error}`);
      }

      logger.debug(
        `Persistent Python provider initialized for ${this.providerId}: ${safeJsonStringify(initResult.result)}`,
      );

      this.isInitialized = true;
      this._resetIdleTimer();

      // Start health monitoring if enabled
      if (this.config.healthCheck.enabled) {
        this.startHealthMonitoring(
          this.config.healthCheck.quickIntervalMs,
          this.config.healthCheck.detailedIntervalMs,
        );
      }
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async _startPythonProcess(): Promise<void> {
    const wrapperPath = path.join(__dirname, 'persistent_wrapper.py');

    logger.debug(
      `Starting persistent Python process for ${this.providerId}: ${this.config.pythonExecutable} ${wrapperPath}`,
    );

    this.pythonProcess = spawn(this.config.pythonExecutable, [wrapperPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    if (!this.pythonProcess?.stdout || !this.pythonProcess?.stderr || !this.pythonProcess?.stdin) {
      throw new Error('Failed to create Python process stdio streams');
    }

    // Setup stdout handler for NDJSON protocol
    this._setupStdoutHandler();

    // Setup stderr handler for debugging
    this.pythonProcess.stderr?.on('data', (chunk: Buffer) => {
      const output = chunk.toString('utf-8').trim();
      if (output) {
        logger.debug(`Python stderr: ${output}`);
      }
    });

    // Handle process exit
    this.pythonProcess.on('exit', (code, signal) => {
      // Log level depends on whether this was intentional
      if (this.isShuttingDown) {
        logger.debug(
          `Python process for ${this.providerId} exited gracefully during shutdown: code=${code}, signal=${signal}`,
        );
      } else {
        logger.warn(
          `Python process for ${this.providerId} exited unexpectedly: code=${code}, signal=${signal}`,
        );
      }
      this._handleProcessExit(code, signal);
    });

    // Handle process errors
    this.pythonProcess.on('error', (error) => {
      logger.error(`Python process error for ${this.providerId}: ${error.message}`);
      this._handleProcessError(error);
    });

    // Wait for process to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python process startup timeout'));
      }, 10000);

      this.pythonProcess!.on('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.pythonProcess!.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private _setupStdoutHandler(): void {
    if (!this.pythonProcess?.stdout || this.isShuttingDown) {
      return;
    }

    this.pythonProcess.stdout.on('data', (chunk: Buffer) => {
      // Check if manager is still active before processing data
      if (this.isShuttingDown) {
        return;
      }

      this.buffer += chunk.toString('utf-8');

      // Process complete lines
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          this._processLine(line.trim());
        }
      }
    });
  }

  private _processLine(line: string): void {
    try {
      const response = JSON.parse(line);

      // Validate response structure
      if (!response || typeof response !== 'object') {
        logger.warn(`Invalid response structure from Python: ${line.substring(0, 100)}`);
        return;
      }

      // Check for protocol-level errors that indicate corruption
      if (response.type === 'protocol_error' || response.type === 'serialization_error') {
        logger.error(
          `Python protocol error: ${response.error}, received: ${response.received_line || 'unknown'}`,
        );
        // Don't restart process for protocol errors, but log them for monitoring
        return;
      }

      // Check for fatal errors that require process restart
      if (response.type === 'fatal_error') {
        logger.error(`Python fatal error: ${response.error}, traceback: ${response.traceback}`);
        this._handleProcessError(new Error(`Python fatal error: ${response.error}`));
        return;
      }

      this._handleResponse(response);
    } catch (parseError) {
      // Enhanced error handling for NDJSON corruption
      logger.error(`Failed to parse Python response: ${(parseError as Error).message}`);
      logger.debug(`Corrupted line (first 200 chars): ${line.substring(0, 200)}`);

      // Check if this looks like user debug output that leaked through
      if (this._isLikelyUserOutput(line)) {
        logger.warn(
          `Detected likely user debug output in NDJSON stream: ${line.substring(0, 100)}`,
        );
        // Continue processing - this is recoverable
        return;
      }

      // Check if buffer is getting too large (potential memory attack)
      if (this.buffer.length > 1000000) {
        // 1MB limit
        logger.error(`NDJSON buffer exceeded 1MB, clearing buffer to prevent memory issues`);
        this.buffer = '';
        // Consider this a serious issue but don't restart process immediately
        return;
      }

      // Multiple consecutive parse failures indicate serious corruption
      this._incrementCorruptionCounter();
    }
  }

  private _isLikelyUserOutput(line: string): boolean {
    // Heuristics to detect user debug output vs legitimate corruption
    const userOutputPatterns = [
      /^(DEBUG|INFO|WARN|ERROR|TRACE):/i,
      /^\d{4}-\d{2}-\d{2}/, // Date patterns
      /^Traceback \(most recent call last\):/,
      /^[A-Za-z]+Error:/, // Python exception names
      /^>>> /, // Python REPL prompt
      /^Loading /, // Common loading messages
      /^Imported /, // Import messages
    ];

    return userOutputPatterns.some((pattern) => pattern.test(line));
  }

  private corruptionCount = 0;
  private readonly MAX_CORRUPTION_COUNT = 5;

  private _incrementCorruptionCounter(): void {
    this.corruptionCount++;

    if (this.corruptionCount >= this.MAX_CORRUPTION_COUNT) {
      logger.error(
        `Multiple NDJSON corruption errors (${this.corruptionCount}), restarting Python process`,
      );
      this.corruptionCount = 0; // Reset counter
      this._handleProcessError(new Error('Persistent NDJSON corruption detected'));
    }
  }

  private _handleResponse(response: any): void {
    const requestId = response.id;
    const pendingRequest = this.pendingRequests.get(requestId);

    if (!pendingRequest) {
      logger.warn(`Received response for unknown request ID: ${requestId}`);
      return;
    }

    this.pendingRequests.delete(requestId);

    if (pendingRequest.timeout) {
      clearTimeout(pendingRequest.timeout);
    }

    if (response.type === 'error') {
      pendingRequest.reject(new Error(response.error));
    } else {
      pendingRequest.resolve(response);
    }

    // Reset idle timer after successful response
    this._resetIdleTimer();
  }

  private _handleProcessExit(code: number | null, signal: string | null): void {
    // Check if this is an intentional shutdown
    if (this.isShuttingDown) {
      logger.debug(
        `Python process for ${this.providerId} exited gracefully during shutdown: code=${code}, signal=${signal}`,
      );

      // Reject any remaining pending requests with appropriate message
      for (const [_id, request] of this.pendingRequests) {
        request.reject(new Error('Python manager shutting down'));
      }
      this.pendingRequests.clear();

      this.pythonProcess = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      return; // Don't attempt restart during shutdown
    }

    // Unintentional exit - reject pending requests
    for (const [_id, request] of this.pendingRequests) {
      request.reject(
        new Error(`Python process exited unexpectedly: code=${code}, signal=${signal}`),
      );
    }
    this.pendingRequests.clear();

    this.pythonProcess = null;
    this.isInitialized = false;
    this.initializationPromise = null;

    // Attempt restart if within limits
    if (this.restartCount < this.config.maxRestarts) {
      this.restartCount++;
      logger.info(
        `Attempting to restart Python process for ${this.providerId} (attempt ${this.restartCount}/${this.config.maxRestarts}) after unexpected exit: code=${code}, signal=${signal}`,
      );

      setTimeout(() => {
        // Check if we're still supposed to be running (not shut down)
        if (!this.isShuttingDown) {
          this.initialize().catch((error) => {
            logger.error(
              `Failed to restart Python process for ${this.providerId}: ${error.message}`,
            );
            // Only emit error if this manager is still active
            if (!this.isShuttingDown) {
              this.emit('error', error);
            }
          });
        }
      }, 1000 * this.restartCount); // Exponential backoff
    } else {
      logger.error(
        `Python process restart limit exceeded for ${this.providerId} (${this.config.maxRestarts}) after unexpected exits`,
      );
      this.emit('error', new Error('Python process restart limit exceeded'));
    }
  }

  private _handleProcessError(error: Error): void {
    logger.error(`Python process error: ${error.message}`);

    // Reject all pending requests
    for (const [_id, request] of this.pendingRequests) {
      request.reject(error);
    }
    this.pendingRequests.clear();

    this.emit('error', error);
  }

  private _sendMessage(message: any): void {
    if (!this.pythonProcess?.stdin) {
      throw new Error('Python process not available');
    }

    const jsonLine = safeJsonStringify(message) + '\n';
    this.pythonProcess?.stdin?.write(jsonLine);
  }

  private async _sendRequest(request: any, timeout: number = 30000): Promise<any> {
    if (!this.isInitialized && request.type !== 'initialize') {
      await this.initialize();
    }

    const id = ++this.requestId;
    const requestWithId = { ...request, id };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Python request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      try {
        this._sendMessage(requestWithId);
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  private async _processQueue(): Promise<void> {
    if (this.isProcessingRequest || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingRequest = true;

    try {
      while (this.requestQueue.length > 0) {
        const requestHandler = this.requestQueue.shift();
        if (requestHandler) {
          await requestHandler();
        }
      }
    } finally {
      this.isProcessingRequest = false;
    }
  }

  private async _enqueueRequest<T>(requestHandler: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedHandler = async () => {
        try {
          const result = await requestHandler();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      // For serial mode, add to queue; for async mode, execute immediately
      if (this.config.concurrency === 'serial') {
        this.requestQueue.push(wrappedHandler);
        this._processQueue();
      } else {
        // Async mode - execute immediately (original behavior)
        wrappedHandler();
      }
    });
  }

  async callMethod(
    methodName: string,
    args: any[],
    options: any = {},
    context: any = {},
  ): Promise<any> {
    return this._enqueueRequest(async () => {
      // Reset idle timer on each call
      this._resetIdleTimer();

      const result = await this._sendRequest({
        type: 'call',
        method: methodName,
        args,
        options,
        context,
      });

      // Reset idle timer after successful completion
      this._resetIdleTimer();

      // Reset health failure counter on successful request completion
      // This provides immediate feedback that the process is working
      if (this.consecutiveHealthFailures > 0) {
        logger.debug(
          `Python process recovered, resetting health failure counter from ${this.consecutiveHealthFailures} to 0`,
        );
        this.consecutiveHealthFailures = 0;
      }

      return result.result;
    });
  }

  private _resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.config.persistentIdleTimeout > 0) {
      this.idleTimer = setTimeout(() => {
        logger.debug(
          `Python process for ${this.providerId} idle timeout reached after ${this.config.persistentIdleTimeout}ms, shutting down gracefully`,
        );
        this.shutdown();
      }, this.config.persistentIdleTimeout);
    }
  }

  async ping(): Promise<boolean> {
    return this._enqueueRequest(async () => {
      try {
        const response = await this._sendRequest({ type: 'ping' }, 5000);
        return response.type === 'pong';
      } catch (_error) {
        return false;
      }
    });
  }

  /**
   * Comprehensive health check that tests multiple aspects of the Python process
   * @returns Health status with detailed information
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      processAlive: boolean;
      responsive: boolean;
      memoryUsage?: number;
      uptime?: number;
      queueLength: number;
      pendingRequests: number;
      restartCount: number;
    };
    issues: string[];
  }> {
    const issues: string[] = [];
    let processAlive = false;
    let responsive = false;
    let memoryUsage: number | undefined;
    let uptime: number | undefined;

    // Check if process is alive
    if (this.pythonProcess && !this.pythonProcess.killed) {
      processAlive = true;

      // Get process memory usage
      try {
        if (this.pythonProcess.pid) {
          const memInfo = process.memoryUsage();
          memoryUsage = memInfo.rss; // Resident Set Size
        }
      } catch (error) {
        issues.push(`Failed to get memory usage: ${(error as Error).message}`);
      }
    } else {
      issues.push('Python process is not running');
    }

    // Test responsiveness with ping
    if (processAlive) {
      try {
        responsive = await this.ping();
        if (!responsive) {
          issues.push('Python process is not responding to ping');
        }
      } catch (error) {
        issues.push(`Ping failed: ${(error as Error).message}`);
      }
    }

    // Check queue and request status
    const queueLength = this.requestQueue.length;
    const pendingRequests = this.pendingRequests.size;

    if (queueLength > 10) {
      issues.push(`High queue length: ${queueLength} requests queued`);
    }

    if (pendingRequests > 5) {
      issues.push(`High pending requests: ${pendingRequests} requests pending`);
    }

    if (this.restartCount > 0) {
      issues.push(`Process has restarted ${this.restartCount} times`);
    }

    const healthy = processAlive && responsive && issues.length === 0;

    return {
      healthy,
      details: {
        processAlive,
        responsive,
        memoryUsage,
        uptime,
        queueLength,
        pendingRequests,
        restartCount: this.restartCount,
      },
      issues,
    };
  }

  /**
   * Automated health monitoring with tiered approach for server-like monitoring
   */
  private quickHealthCheckInterval: NodeJS.Timeout | null = null;
  private detailedHealthCheckInterval: NodeJS.Timeout | null = null;
  private consecutiveHealthFailures = 0;

  startHealthMonitoring(quickIntervalMs: number = 5000, detailedIntervalMs: number = 30000): void {
    // Stop existing monitoring
    this.stopHealthMonitoring();

    // Quick responsiveness checks (every 5 seconds)
    this.quickHealthCheckInterval = setInterval(async () => {
      try {
        const isResponsive = await this.ping();

        if (isResponsive) {
          // Reset failure counter on successful ping
          if (this.consecutiveHealthFailures > 0) {
            logger.info(
              `Python process ping recovered after ${this.consecutiveHealthFailures} failures`,
            );
            this.consecutiveHealthFailures = 0;
          }
        } else {
          this.consecutiveHealthFailures++;
          logger.warn(
            `Python process ping failed (${this.consecutiveHealthFailures}/${this.config.healthCheck.maxFailures}): ${this.providerId}`,
          );

          if (this.consecutiveHealthFailures >= this.config.healthCheck.maxFailures) {
            logger.error(
              `Python process ping failed ${this.config.healthCheck.maxFailures} times consecutively, restarting process`,
            );
            this.consecutiveHealthFailures = 0;
            this._handleProcessError(new Error('Process ping failed repeatedly'));
          }
        }
      } catch (error) {
        logger.error(`Quick health check error: ${(error as Error).message}`);
      }
    }, quickIntervalMs);

    // Detailed health checks (every 30 seconds)
    this.detailedHealthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();

        if (!health.healthy && health.issues.length > 0) {
          // Log detailed issues but don't restart based on detailed checks alone
          // (restarts are triggered by ping failures for faster response)
          logger.warn(`Python process detailed health issues: ${health.issues.join(', ')}`);

          // Log performance metrics for monitoring
          logger.info(
            `Python process metrics: queue=${health.details.queueLength}, pending=${health.details.pendingRequests}, memory=${health.details.memoryUsage ? Math.round(health.details.memoryUsage / 1024 / 1024) + 'MB' : 'unknown'}, restarts=${health.details.restartCount}`,
          );
        } else {
          logger.debug(`Python process detailed health check passed: ${this.providerId}`);
        }
      } catch (error) {
        logger.error(`Detailed health check error: ${(error as Error).message}`);
      }
    }, detailedIntervalMs);
  }

  stopHealthMonitoring(): void {
    if (this.quickHealthCheckInterval) {
      clearInterval(this.quickHealthCheckInterval);
      this.quickHealthCheckInterval = null;
    }
    if (this.detailedHealthCheckInterval) {
      clearInterval(this.detailedHealthCheckInterval);
      this.detailedHealthCheckInterval = null;
    }
  }

  shutdown(): void {
    // Set shutdown flag to prevent restart attempts
    this.isShuttingDown = true;

    // Stop health monitoring
    this.stopHealthMonitoring();

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Clear request queue
    this.requestQueue = [];
    this.isProcessingRequest = false;

    // Reject all pending requests
    for (const [_id, request] of this.pendingRequests) {
      request.reject(new Error('Python manager shutting down'));
    }
    this.pendingRequests.clear();

    if (this.pythonProcess) {
      logger.debug(
        `Sending SIGTERM to Python process for ${this.providerId} for graceful shutdown`,
      );
      this.pythonProcess?.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.pythonProcess && !this.pythonProcess.killed) {
          logger.warn(`Force killing Python process for ${this.providerId} after timeout`);
          this.pythonProcess?.kill('SIGKILL');
        }
      }, 5000);
    }

    this.pythonProcess = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  get isHealthy(): boolean {
    return this.pythonProcess !== null && !this.pythonProcess?.killed && this.isInitialized;
  }

  get stats() {
    return {
      isHealthy: this.isHealthy,
      isInitialized: this.isInitialized,
      pendingRequests: this.pendingRequests.size,
      restartCount: this.restartCount,
      processId: this.pythonProcess?.pid,
    };
  }
}
