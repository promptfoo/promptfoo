import { PythonShell } from 'python-shell';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';

export class PythonWorker {
  private process: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
  private crashCount: number = 0;
  private readonly maxCrashes: number = 3;
  private pendingRequest: {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  } | null = null;
  private requestTimeout: NodeJS.Timeout | null = null;

  constructor(
    private scriptPath: string,
    private functionName: string,
    private pythonPath?: string,
    private timeout: number = 120000, // 2 minutes default
  ) {}

  async initialize(): Promise<void> {
    return this.startWorker();
  }

  private async startWorker(): Promise<void> {
    const wrapperPath = path.join(__dirname, 'persistent_wrapper.py');

    this.process = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: this.pythonPath || 'python',
      args: [this.scriptPath, this.functionName],
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Listen for READY signal
    return new Promise((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        reject(new Error('Worker failed to become ready within timeout'));
      }, 30000);

      this.process!.on('message', (message: string) => {
        if (message.trim() === 'READY') {
          clearTimeout(readyTimeout);
          this.ready = true;
          logger.debug(`Python worker ready for ${this.scriptPath}`);
          resolve();
        } else if (message.startsWith('DONE')) {
          this.handleDone();
        }
      });

      this.process!.on('error', (err) => {
        clearTimeout(readyTimeout);
        reject(err);
      });

      this.process!.on('close', () => {
        this.handleCrash();
      });

      this.process!.stderr?.on('data', (data) => {
        logger.error(`Python worker stderr: ${data}`);
      });
    });
  }

  async call(functionName: string, args: any[]): Promise<any> {
    if (!this.ready) {
      throw new Error('Worker not ready');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;

    try {
      return await Promise.race([
        this.executeCall(functionName, args),
        this.createTimeout(),
      ]);
    } finally {
      this.busy = false;
      if (this.requestTimeout) {
        clearTimeout(this.requestTimeout);
        this.requestTimeout = null;
      }
    }
  }

  private async executeCall(functionName: string, args: any[]): Promise<any> {
    const requestFile = path.join(
      os.tmpdir(),
      `promptfoo-worker-req-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    const responseFile = path.join(
      os.tmpdir(),
      `promptfoo-worker-resp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );

    try {
      // Write request
      fs.writeFileSync(requestFile, safeJsonStringify(args) as string, 'utf-8');

      // Send CALL command
      const command = `CALL:${requestFile}:${responseFile}\n`;
      this.process!.send(command);

      // Wait for DONE
      const result = await new Promise<any>((resolve, reject) => {
        this.pendingRequest = { resolve, reject };
      });

      // Read response
      const responseData = fs.readFileSync(responseFile, 'utf-8');
      const response = JSON.parse(responseData);

      if (response.type === 'error') {
        throw new Error(`Python error: ${response.error}\n${response.traceback || ''}`);
      }

      return response.data;
    } finally {
      // Cleanup temp files
      [requestFile, responseFile].forEach((file) => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch (error) {
          logger.error(`Error removing ${file}: ${error}`);
        }
      });
    }
  }

  private createTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      this.requestTimeout = setTimeout(() => {
        reject(new Error(`Python worker timed out after ${this.timeout}ms`));
      }, this.timeout);
    });
  }

  private handleDone(): void {
    if (this.pendingRequest) {
      this.pendingRequest.resolve(undefined);
      this.pendingRequest = null;
    }
  }

  private handleCrash(): void {
    this.ready = false;
    this.crashCount++;

    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error('Worker crashed'));
      this.pendingRequest = null;
    }

    if (this.crashCount < this.maxCrashes) {
      logger.warn(`Python worker crashed (${this.crashCount}/${this.maxCrashes}), restarting...`);
      this.startWorker().catch((err) => {
        logger.error(`Failed to restart worker: ${err}`);
      });
    } else {
      logger.error(`Python worker crashed ${this.maxCrashes} times, marking as dead`);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async shutdown(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      this.process.send('SHUTDOWN\n');

      // Wait for exit (5s timeout)
      await Promise.race([
        new Promise<void>((resolve) => {
          this.process!.on('close', () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch (error) {
      logger.error(`Error during worker shutdown: ${error}`);
    } finally {
      if (this.process) {
        this.process.kill('SIGTERM');
        this.process = null;
      }
      this.ready = false;
    }
  }
}
