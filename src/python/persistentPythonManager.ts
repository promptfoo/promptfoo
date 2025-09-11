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

  private readonly scriptPath: string;
  private readonly config: Required<Pick<PersistentPythonConfig, 'pythonExecutable' | 'persistentIdleTimeout' | 'maxRestarts' | 'concurrency'>>;
  private buffer = '';

  constructor(scriptPath: string, config: PersistentPythonConfig = {}) {
    super();
    this.scriptPath = scriptPath;
    this.config = {
      pythonExecutable: config.pythonExecutable || 'python',
      persistentIdleTimeout: config.persistentIdleTimeout || 300000, // 5 minutes
      maxRestarts: config.maxRestarts || 3,
      concurrency: config.concurrency || 'serial',
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
        `Persistent Python provider initialized: ${safeJsonStringify(initResult.result)}`,
      );

      this.isInitialized = true;
      this._resetIdleTimer();
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async _startPythonProcess(): Promise<void> {
    const wrapperPath = path.join(__dirname, 'persistent_wrapper.py');

    logger.debug(
      `Starting persistent Python process: ${this.config.pythonExecutable} ${wrapperPath}`,
    );

    this.pythonProcess = spawn(this.config.pythonExecutable, [wrapperPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    if (!this.pythonProcess.stdout || !this.pythonProcess.stderr || !this.pythonProcess.stdin) {
      throw new Error('Failed to create Python process stdio streams');
    }

    // Setup stdout handler for NDJSON protocol
    this._setupStdoutHandler();

    // Setup stderr handler for debugging
    this.pythonProcess.stderr.on('data', (chunk: Buffer) => {
      const output = chunk.toString('utf-8').trim();
      if (output) {
        logger.debug(`Python stderr: ${output}`);
      }
    });

    // Handle process exit
    this.pythonProcess.on('exit', (code, signal) => {
      logger.warn(`Python process exited with code ${code}, signal ${signal}`);
      this._handleProcessExit(code, signal);
    });

    // Handle process errors
    this.pythonProcess.on('error', (error) => {
      logger.error(`Python process error: ${error.message}`);
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
    if (!this.pythonProcess?.stdout) {
      return;
    }

    this.pythonProcess.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');

      // Process complete lines
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            this._handleResponse(response);
          } catch (_e) {
            logger.error(`Failed to parse Python response: ${line}`);
          }
        }
      }
    });
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
      logger.debug(`Python process exited gracefully during shutdown: code=${code}, signal=${signal}`);
      
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
        `Attempting to restart Python process (attempt ${this.restartCount}/${this.config.maxRestarts}) after unexpected exit: code=${code}, signal=${signal}`,
      );

      setTimeout(() => {
        this.initialize().catch((error) => {
          logger.error(`Failed to restart Python process: ${error.message}`);
          this.emit('error', error);
        });
      }, 1000 * this.restartCount); // Exponential backoff
    } else {
      logger.error(`Python process restart limit exceeded (${this.config.maxRestarts}) after unexpected exits`);
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
    this.pythonProcess.stdin.write(jsonLine);
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

  async callMethod(
    methodName: string,
    args: any[],
    options: any = {},
    context: any = {},
  ): Promise<any> {
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

    return result.result;
  }

  private _resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.config.persistentIdleTimeout > 0) {
      this.idleTimer = setTimeout(() => {
        logger.debug('Python process idle timeout reached, shutting down');
        this.shutdown();
      }, this.config.persistentIdleTimeout);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this._sendRequest({ type: 'ping' }, 5000);
      return response.type === 'pong';
    } catch (_error) {
      return false;
    }
  }

  shutdown(): void {
    // Set shutdown flag to prevent restart attempts
    this.isShuttingDown = true;
    
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Reject all pending requests
    for (const [_id, request] of this.pendingRequests) {
      request.reject(new Error('Python manager shutting down'));
    }
    this.pendingRequests.clear();

    if (this.pythonProcess) {
      logger.debug('Sending SIGTERM to Python process for graceful shutdown');
      this.pythonProcess.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.pythonProcess && !this.pythonProcess.killed) {
          logger.warn('Force killing Python process after timeout');
          this.pythonProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    this.pythonProcess = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  get isHealthy(): boolean {
    return this.pythonProcess !== null && !this.pythonProcess.killed && this.isInitialized;
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
