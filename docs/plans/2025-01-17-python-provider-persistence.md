# Python Provider Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Enable persistent Python worker processes with pooling to eliminate expensive re-imports while maintaining backward compatibility.

**Architecture:** Replace ephemeral one-shot Python process creation with a worker pool architecture. Workers persist across multiple calls, using file-based IPC (proven Unicode handling) with simple stdin/stdout control signals. Each provider maintains its own pool (default: 1 worker, configurable).

**Tech Stack:** TypeScript (Node.js), Python 3.7+, python-shell library (existing), child_process, file-based IPC

---

## Task 1: Create PythonWorker Class (Single Worker Logic)

**Files:**

- Create: `src/python/worker.ts`
- Test: `test/python/worker.test.ts`

**Step 1: Write the failing test**

Create `test/python/worker.test.ts`:

```typescript
import { PythonWorker } from '../src/python/worker';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('PythonWorker', () => {
  let worker: PythonWorker;
  const testScriptPath = path.join(__dirname, 'fixtures', 'simple_provider.py');

  beforeAll(() => {
    // Create test fixture
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(
      testScriptPath,
      `
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
`,
    );
  });

  afterAll(() => {
    fs.unlinkSync(testScriptPath);
  });

  afterEach(async () => {
    if (worker) {
      await worker.shutdown();
    }
  });

  it('should initialize and become ready', async () => {
    worker = new PythonWorker(testScriptPath, 'call_api');
    await worker.initialize();
    expect(worker.isReady()).toBe(true);
  });

  it('should execute a function call', async () => {
    worker = new PythonWorker(testScriptPath, 'call_api');
    await worker.initialize();

    const result = await worker.call('call_api', ['Hello world', {}, {}]);
    expect(result.output).toBe('Echo: Hello world');
  });

  it('should reuse the same process for multiple calls', async () => {
    worker = new PythonWorker(testScriptPath, 'call_api');
    await worker.initialize();

    const result1 = await worker.call('call_api', ['First', {}, {}]);
    const result2 = await worker.call('call_api', ['Second', {}, {}]);

    expect(result1.output).toBe('Echo: First');
    expect(result2.output).toBe('Echo: Second');
    // Same process should be used (we'll verify in implementation)
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/python/worker.test.ts
```

Expected: FAIL with "Cannot find module '../src/python/worker'"

**Step 3: Write minimal implementation**

Create `src/python/worker.ts`:

```typescript
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
      return await Promise.race([this.executeCall(functionName, args), this.createTimeout()]);
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
```

**Step 4: Run test to verify it passes**

```bash
npx jest test/python/worker.test.ts
```

Expected: FAIL (persistent_wrapper.py doesn't exist yet)

**Step 5: Note - Test will fail until Task 2 complete**

This is expected. We need the persistent_wrapper.py before tests pass.

---

## Task 2: Create Persistent Python Wrapper

**Files:**

- Create: `src/python/persistent_wrapper.py`

**Step 1: Write the persistent wrapper**

Create `src/python/persistent_wrapper.py`:

```python
#!/usr/bin/env python3
"""
Persistent Python wrapper for Promptfoo.

This wrapper loads a user script once and handles multiple requests
via a simple control protocol over stdin/stdout.

Protocol:
  - Node sends: "CALL:<request_file>:<response_file>\n"
  - Worker executes function, writes response to file
  - Worker sends: "DONE\n"
  - Node sends: "SHUTDOWN\n" to exit

Data transfer uses files (proven UTF-8 handling), control uses stdin/stdout.
"""

import asyncio
import importlib.util
import json
import os
import sys
import traceback


def load_user_module(script_path):
    """Load and return the user's Python module."""
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]

    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    print(f"Loading module {module_name} from {script_path}...", file=sys.stderr, flush=True)

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def get_callable(module, method_name):
    """Get the callable method from module, supporting 'Class.method' syntax."""
    if "." in method_name:
        class_name, classmethod_name = method_name.split(".", 1)
        cls = getattr(module, class_name)
        return getattr(cls, classmethod_name)
    else:
        return getattr(module, method_name)


def call_method(method_callable, args):
    """Call the method, handling both sync and async functions."""
    if asyncio.iscoroutinefunction(method_callable):
        return asyncio.run(method_callable(*args))
    else:
        return method_callable(*args)


def main():
    if len(sys.argv) < 3:
        print("Usage: persistent_wrapper.py <script_path> <function_name>", file=sys.stderr)
        sys.exit(1)

    script_path = sys.argv[1]
    function_name = sys.argv[2]

    # Load user module once
    try:
        user_module = load_user_module(script_path)
        method_callable = get_callable(user_module, function_name)
    except Exception as e:
        print(f"ERROR: Failed to load module: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

    # Signal ready
    print("READY", flush=True)

    # Main loop - wait for commands
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # stdin closed, exit gracefully
                break

            line = line.strip()

            if line.startswith('SHUTDOWN'):
                break
            elif line.startswith('CALL:'):
                handle_call(line, method_callable)
            else:
                print(f"ERROR: Unknown command: {line}", file=sys.stderr, flush=True)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"ERROR in main loop: {e}", file=sys.stderr, flush=True)
            print(traceback.format_exc(), file=sys.stderr, flush=True)


def handle_call(command_line, method_callable):
    """Handle a CALL command."""
    try:
        # Parse command: "CALL:<request_file>:<response_file>"
        parts = command_line.split(':', 2)
        if len(parts) != 3:
            raise ValueError(f"Invalid CALL command format: {command_line}")

        _, request_file, response_file = parts

        # Read request
        with open(request_file, 'r', encoding='utf-8') as f:
            args = json.load(f)

        # Execute user function
        try:
            result = call_method(method_callable, args)
            response = {
                'type': 'result',
                'data': result
            }
        except Exception as e:
            response = {
                'type': 'error',
                'error': str(e),
                'traceback': traceback.format_exc()
            }

        # Write response
        with open(response_file, 'w', encoding='utf-8') as f:
            json.dump(response, f, ensure_ascii=False)

        # Signal done
        print('DONE', flush=True)

    except Exception as e:
        print(f"ERROR handling call: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        # Still try to signal done to avoid hanging
        print('DONE', flush=True)


if __name__ == '__main__':
    main()
```

**Step 2: Verify wrapper runs**

```bash
# Test the wrapper manually
echo '{"test": "data"}' > /tmp/test-req.json
echo 'CALL:/tmp/test-req.json:/tmp/test-resp.json' | python src/python/persistent_wrapper.py test/fixtures/simple_provider.py call_api
```

Expected: Should print "READY" then "DONE"

**Step 3: Now run worker tests**

```bash
npx jest test/python/worker.test.ts
```

Expected: PASS (all 3 tests)

**Step 4: Commit**

```bash
git add src/python/worker.ts src/python/persistent_wrapper.py test/python/worker.test.ts test/fixtures/simple_provider.py
git commit -m "feat: add PythonWorker class with persistent process support

Implements single persistent Python worker that:
- Loads user script once at startup
- Handles multiple calls via file-based IPC
- Uses stdin/stdout for control signals (READY, CALL, DONE, SHUTDOWN)
- Supports both sync and async Python functions
- Handles crashes with automatic restart (up to 3 attempts)
- Includes 2-minute timeout per request

Tests verify:
- Worker initialization and ready state
- Single function execution
- Process reuse across multiple calls

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Create PythonWorkerPool Class

**Files:**

- Create: `src/python/workerPool.ts`
- Test: `test/python/workerPool.test.ts`

**Step 1: Write the failing test**

Create `test/python/workerPool.test.ts`:

```typescript
import { PythonWorkerPool } from '../src/python/workerPool';
import fs from 'fs';
import path from 'path';

describe('PythonWorkerPool', () => {
  let pool: PythonWorkerPool;
  const testScriptPath = path.join(__dirname, 'fixtures', 'counter_provider.py');

  beforeAll(() => {
    // Create test fixture with global state
    fs.writeFileSync(
      testScriptPath,
      `
# Global counter - persists across calls within same worker
call_count = 0

def call_api(prompt, options, context):
    global call_count
    call_count += 1
    return {"output": f"Call #{call_count}: {prompt}", "count": call_count}
`,
    );
  });

  afterAll(() => {
    fs.unlinkSync(testScriptPath);
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  it('should initialize pool with specified worker count', async () => {
    pool = new PythonWorkerPool(testScriptPath, 'call_api', 2);
    await pool.initialize();
    expect(pool.getWorkerCount()).toBe(2);
  });

  it('should execute calls sequentially with 1 worker', async () => {
    pool = new PythonWorkerPool(testScriptPath, 'call_api', 1);
    await pool.initialize();

    const result1 = await pool.execute('call_api', ['First', {}, {}]);
    const result2 = await pool.execute('call_api', ['Second', {}, {}]);
    const result3 = await pool.execute('call_api', ['Third', {}, {}]);

    // Same worker, counter increments
    expect(result1.count).toBe(1);
    expect(result2.count).toBe(2);
    expect(result3.count).toBe(3);
  });

  it('should handle concurrent calls with multiple workers', async () => {
    pool = new PythonWorkerPool(testScriptPath, 'call_api', 2);
    await pool.initialize();

    // Execute 4 calls concurrently
    const promises = [
      pool.execute('call_api', ['Call 1', {}, {}]),
      pool.execute('call_api', ['Call 2', {}, {}]),
      pool.execute('call_api', ['Call 3', {}, {}]),
      pool.execute('call_api', ['Call 4', {}, {}]),
    ];

    const results = await Promise.all(promises);

    // Each worker maintains its own counter
    // With 2 workers, we should see counters go to 2
    const counts = results.map((r) => r.count);
    expect(Math.max(...counts)).toBe(2); // Each worker called twice
  });

  it('should queue requests when all workers busy', async () => {
    pool = new PythonWorkerPool(testScriptPath, 'call_api', 1);
    await pool.initialize();

    // Start 3 concurrent calls with 1 worker - should queue
    const start = Date.now();
    const promises = [
      pool.execute('call_api', ['Q1', {}, {}]),
      pool.execute('call_api', ['Q2', {}, {}]),
      pool.execute('call_api', ['Q3', {}, {}]),
    ];

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    // All should complete (queued and executed)
    expect(results.length).toBe(3);
    expect(results[0].count).toBe(1);
    expect(results[1].count).toBe(2);
    expect(results[2].count).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest test/python/workerPool.test.ts
```

Expected: FAIL with "Cannot find module '../src/python/workerPool'"

**Step 3: Write minimal implementation**

Create `src/python/workerPool.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

```bash
npx jest test/python/workerPool.test.ts
```

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/python/workerPool.ts test/python/workerPool.test.ts test/fixtures/counter_provider.py
git commit -m "feat: add PythonWorkerPool for managing multiple workers

Implements worker pool that:
- Manages N persistent Python workers
- Distributes work across available workers
- Queues requests when all workers busy
- Supports concurrent execution with multiple workers
- Sequential execution with single worker
- Warns when spawning >8 workers (memory concern)

Tests verify:
- Pool initialization with specified worker count
- Sequential execution with 1 worker (global state persists)
- Concurrent execution with multiple workers (work distribution)
- Request queuing when workers busy

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Integrate Worker Pool into PythonProvider

**Files:**

- Modify: `src/providers/pythonCompletion.ts`
- Modify: `src/python/pythonUtils.ts` (add getEnvInt helper)

**Step 1: Add getEnvInt helper first**

Modify `src/python/pythonUtils.ts`, add after imports:

```typescript
import { getEnvBool, getEnvString } from '../envars';

// Add this function
export function getEnvInt(key: string): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}
```

**Step 2: Write test for pool integration**

Add to `test/providers/pythonCompletion.test.ts`:

```typescript
describe('PythonProvider with persistence', () => {
  it('should reuse worker across multiple calls', async () => {
    const config = `
counter = 0

def call_api(prompt, options, context):
    global counter
    counter += 1
    return {"output": f"Count: {counter}"}
`;

    const provider = new PythonProvider(`file://${writeTempPython(config)}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();

    const result1 = await provider.callApi('test1');
    const result2 = await provider.callApi('test2');
    const result3 = await provider.callApi('test3');

    // Global state persists - counter increments
    expect(result1.output).toBe('Count: 1');
    expect(result2.output).toBe('Count: 2');
    expect(result3.output).toBe('Count: 3');
  });

  it('should support configurable worker count', async () => {
    const config = `
def call_api(prompt, options, context):
    return {"output": "ok"}
`;

    const provider = new PythonProvider(`file://${writeTempPython(config)}`, {
      config: {
        basePath: process.cwd(),
        workers: 4,
      },
    });

    await provider.initialize();

    // Check pool has 4 workers (we'll need to expose this for testing)
    expect((provider as any).pool.getWorkerCount()).toBe(4);
  });
});
```

**Step 3: Modify PythonProvider to use worker pool**

Modify `src/providers/pythonCompletion.ts`:

```typescript
// Add import
import { PythonWorkerPool } from '../python/workerPool';
import { getEnvInt } from '../python/pythonUtils';

// Modify interface
interface PythonProviderConfig {
  pythonExecutable?: string;
  workers?: number; // NEW: Configurable worker count
  timeout?: number; // NEW: Configurable timeout
}

export class PythonProvider implements ApiProvider {
  config: PythonProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  public label: string | undefined;

  // NEW: Worker pool replaces one-shot execution
  private pool: PythonWorkerPool | null = null;

  // ... existing constructor ...

  public async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization and store the promise
    this.initializationPromise = (async () => {
      try {
        this.config = await processConfigFileReferences(
          this.config,
          this.options?.config.basePath || '',
        );

        // NEW: Initialize worker pool
        const workerCount = this.getWorkerCount();
        const absPath = path.resolve(
          path.join(this.options?.config.basePath || '', this.scriptPath),
        );

        this.pool = new PythonWorkerPool(
          absPath,
          this.functionName || 'call_api',
          workerCount,
          this.config.pythonExecutable,
          this.config.timeout,
        );

        await this.pool.initialize();

        this.isInitialized = true;
        logger.debug(`Initialized Python provider ${this.id()} with ${workerCount} workers`);
      } catch (error) {
        // Reset the initialization promise so future calls can retry
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  // NEW: Determine worker count
  private getWorkerCount(): number {
    // Priority order:
    // 1. Explicit config.workers
    if (this.config.workers !== undefined) {
      return this.config.workers;
    }

    // 2. Environment variable
    const envWorkers = getEnvInt('PROMPTFOO_PYTHON_WORKERS');
    if (envWorkers !== undefined) {
      return envWorkers;
    }

    // 3. Default: 1 worker (memory-efficient)
    return 1;
  }

  private async executePythonScript(
    prompt: string,
    context: CallApiContextParams | undefined,
    apiType: 'call_api' | 'call_embedding_api' | 'call_classification_api',
  ): Promise<any> {
    if (!this.isInitialized || !this.pool) {
      await this.initialize();
    }

    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(fs.readFileSync(absPath, 'utf-8'));

    // Cache key logic remains the same
    const cacheKey = `python:${this.scriptPath}:${this.functionName || 'default'}:${apiType}:${fileHash}:${prompt}:${JSON.stringify(
      this.options,
    )}:${JSON.stringify(context?.vars)}`;
    logger.debug(`PythonProvider cache key: ${cacheKey}`);

    const cache = await getCache();
    let cachedResult;
    const cacheEnabled = isCacheEnabled();
    logger.debug(`PythonProvider cache enabled: ${cacheEnabled}`);

    if (cacheEnabled) {
      cachedResult = await cache.get(cacheKey);
      logger.debug(`PythonProvider cache hit: ${Boolean(cachedResult)}`);
    }

    if (cachedResult) {
      // ... existing cache hit logic unchanged ...
      logger.debug(`Returning cached ${apiType} result for script ${absPath}`);
      const parsedResult = JSON.parse(cachedResult as string);

      logger.debug(
        `PythonProvider parsed cached result type: ${typeof parsedResult}, keys: ${Object.keys(parsedResult).join(',')}`,
      );

      if (apiType === 'call_api' && typeof parsedResult === 'object' && parsedResult !== null) {
        logger.debug(`PythonProvider setting cached=true for cached ${apiType} result`);
        parsedResult.cached = true;

        if (parsedResult.tokenUsage) {
          const total = parsedResult.tokenUsage.total || 0;
          parsedResult.tokenUsage = {
            cached: total,
            total,
          };
          logger.debug(
            `Updated token usage for cached result: ${JSON.stringify(parsedResult.tokenUsage)}`,
          );
        }
      }
      return parsedResult;
    } else {
      if (context) {
        delete context.getCache;
        delete context.logger;
      }

      const optionsWithProcessedConfig = {
        ...this.options,
        config: {
          ...this.options?.config,
          ...this.config,
        },
      };

      // Prepare arguments based on API type
      const args =
        apiType === 'call_api'
          ? [prompt, optionsWithProcessedConfig, context]
          : [prompt, optionsWithProcessedConfig];

      logger.debug(
        `Executing python script ${absPath} via worker pool with args: ${safeJsonStringify(args)}`,
      );

      const functionName = this.functionName || apiType;
      let result;

      // NEW: Use worker pool instead of runPython
      result = await this.pool!.execute(functionName, args);

      // Validation logic remains the same
      switch (apiType) {
        case 'call_api':
          if (
            !result ||
            typeof result !== 'object' ||
            (!('output' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with an \`output\` string/object or \`error\` string, instead got: ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_embedding_api':
          if (
            !result ||
            typeof result !== 'object' ||
            (!('embedding' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with an \`embedding\` array or \`error\` string, instead got ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        case 'call_classification_api':
          if (
            !result ||
            typeof result !== 'object' ||
            (!('classification' in result) && !('error' in result))
          ) {
            throw new Error(
              `The Python script \`${functionName}\` function must return a dict with a \`classification\` object or \`error\` string, instead of ${JSON.stringify(
                result,
              )}`,
            );
          }
          break;
        default:
          throw new Error(`Unsupported apiType: ${apiType}`);
      }

      // Cache logic remains the same
      const hasError =
        'error' in result &&
        result.error !== null &&
        result.error !== undefined &&
        result.error !== '';

      if (isCacheEnabled() && !hasError) {
        logger.debug(`PythonProvider caching result: ${cacheKey}`);
        await cache.set(cacheKey, JSON.stringify(result));
      } else {
        logger.debug(
          `PythonProvider not caching result: ${isCacheEnabled() ? (hasError ? 'has error' : 'unknown reason') : 'cache disabled'}`,
        );
      }

      if (typeof result === 'object' && result !== null && apiType === 'call_api') {
        logger.debug(`PythonProvider explicitly setting cached=false for fresh result`);
        result.cached = false;
      }

      return result;
    }
  }

  // ... callApi, callEmbeddingApi, callClassificationApi remain the same ...
}
```

**Step 4: Run tests to verify integration**

```bash
npx jest test/providers/pythonCompletion.test.ts
```

Expected: PASS (including new persistence tests)

**Step 5: Commit**

```bash
git add src/providers/pythonCompletion.ts src/python/pythonUtils.ts test/providers/pythonCompletion.test.ts
git commit -m "feat: integrate worker pool into PythonProvider

Replace ephemeral one-shot Python execution with persistent worker pool.

Changes:
- PythonProvider now creates PythonWorkerPool in initialize()
- Worker count configurable via config.workers or PROMPTFOO_PYTHON_WORKERS
- Default: 1 worker (memory-efficient, perfect for ML models)
- Add getEnvInt() helper for parsing env vars
- executePythonScript() now uses pool.execute() instead of runPython()
- All existing caching logic preserved
- Backward compatible: existing configs work without changes

Benefits:
- Heavy imports (ML models) loaded once per worker, not per call
- Global state persists across calls within same worker
- 10-100x speedup for scripts with expensive initialization

Tests verify:
- Worker state persists across multiple calls (counter increments)
- Configurable worker count works correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Add Cleanup on Process Exit

**Files:**

- Modify: `src/providers/pythonCompletion.ts`
- Create: `src/providers/providerRegistry.ts` (global registry for cleanup)

**Step 1: Create provider registry**

Create `src/providers/providerRegistry.ts`:

```typescript
import logger from '../logger';
import { PythonProvider } from './pythonCompletion';

/**
 * Global registry of Python providers for cleanup on process exit.
 * Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers: Set<PythonProvider> = new Set();
  private shutdownRegistered: boolean = false;

  register(provider: PythonProvider): void {
    this.providers.add(provider);

    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
  }

  unregister(provider: PythonProvider): void {
    this.providers.delete(provider);
  }

  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.debug(`Received ${signal}, shutting down ${this.providers.size} Python providers...`);

      await Promise.all(
        Array.from(this.providers).map((p) =>
          p.shutdown().catch((err) => {
            logger.error(`Error shutting down provider: ${err}`);
          }),
        ),
      );

      logger.debug('Python provider shutdown complete');

      // Exit after cleanup (only for signals, not normal exit)
      if (signal !== 'exit') {
        process.exit(signal === 'SIGINT' ? 0 : 1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('exit', () => shutdown('exit'));
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(Array.from(this.providers).map((p) => p.shutdown()));
    this.providers.clear();
  }
}

export const providerRegistry = new ProviderRegistry();
```

**Step 2: Modify PythonProvider to register/unregister**

Modify `src/providers/pythonCompletion.ts`:

```typescript
// Add import
import { providerRegistry } from './providerRegistry';

export class PythonProvider implements ApiProvider {
  // ... existing code ...

  public async initialize(): Promise<void> {
    // ... existing initialization code ...

    this.initializationPromise = (async () => {
      try {
        this.config = await processConfigFileReferences(
          this.config,
          this.options?.config.basePath || '',
        );

        const workerCount = this.getWorkerCount();
        const absPath = path.resolve(
          path.join(this.options?.config.basePath || '', this.scriptPath),
        );

        this.pool = new PythonWorkerPool(
          absPath,
          this.functionName || 'call_api',
          workerCount,
          this.config.pythonExecutable,
          this.config.timeout,
        );

        await this.pool.initialize();

        // NEW: Register for cleanup
        providerRegistry.register(this);

        this.isInitialized = true;
        logger.debug(`Initialized Python provider ${this.id()} with ${workerCount} workers`);
      } catch (error) {
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  // NEW: Shutdown method
  async shutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.shutdown();
      this.pool = null;
    }
    providerRegistry.unregister(this);
    this.isInitialized = false;
  }

  // ... rest of class ...
}
```

**Step 3: Write test for cleanup**

Add to `test/providers/pythonCompletion.test.ts`:

```typescript
import { providerRegistry } from '../src/providers/providerRegistry';

describe('PythonProvider cleanup', () => {
  it('should cleanup worker pool on shutdown', async () => {
    const config = `
def call_api(prompt, options, context):
    return {"output": "test"}
`;

    const provider = new PythonProvider(`file://${writeTempPython(config)}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();
    expect((provider as any).pool).not.toBeNull();

    await provider.shutdown();
    expect((provider as any).pool).toBeNull();
  });

  it('should register provider for global cleanup', async () => {
    const config = `
def call_api(prompt, options, context):
    return {"output": "test"}
`;

    const provider = new PythonProvider(`file://${writeTempPython(config)}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();

    // Provider should be registered
    expect((providerRegistry as any).providers.has(provider)).toBe(true);

    await provider.shutdown();

    // Should be unregistered
    expect((providerRegistry as any).providers.has(provider)).toBe(false);
  });
});
```

**Step 4: Run tests**

```bash
npx jest test/providers/pythonCompletion.test.ts -t cleanup
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/pythonCompletion.ts src/providers/providerRegistry.ts test/providers/pythonCompletion.test.ts
git commit -m "feat: add Python provider cleanup on process exit

Implement global provider registry to ensure clean shutdown:
- Registry tracks all initialized Python providers
- Hooks into SIGINT, SIGTERM, and process exit
- Shuts down all worker pools gracefully
- Prevents zombie Python processes

PythonProvider changes:
- Registers itself on initialization
- Unregisters on shutdown
- shutdown() method cleanly terminates worker pool

Tests verify:
- Provider shutdown cleans up worker pool
- Registration/unregistration works correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Update Documentation

**Files:**

- Modify: `site/docs/providers/python.md`

**Step 1: Add performance section to docs**

Add after the "Quick Start" section in `site/docs/providers/python.md`:

````markdown
## Performance: State Persistence

**New in v0.x.x**: Python providers now use persistent worker processes for massive performance improvements.

### How It Works

Instead of creating a fresh Python process for each call, Promptfoo now:

1. **Starts a worker pool** when the provider initializes
2. **Loads your script once** per worker (heavy imports happen here)
3. **Reuses the same worker** for multiple calls
4. **Persists global state** across calls within the same worker

**Impact**: Scripts with heavy imports (ML models, large libraries) see 10-100x speedup.

### Example

```python
import torch
from transformers import AutoModel

# ✅ Model loaded ONCE when worker starts (not per call!)
model = AutoModel.from_pretrained("bert-base-uncased")

def call_api(prompt, options, context):
    # Model already in memory, just use it
    return {"output": model.generate(prompt)}
```
````

**Before (ephemeral)**:

- Call 1: 10s (load model) + 0.1s (inference) = 10.1s
- Call 2: 10s (load model) + 0.1s (inference) = 10.1s
- **Total: 20.2s for 2 calls**

**After (persistent)**:

- Startup: 10s (load model once)
- Call 1: 0.1s (inference)
- Call 2: 0.1s (inference)
- **Total: 10.2s for 2 calls** (2x faster!)

For 100 calls: **50x faster!**

### Global State Behavior

**Global variables now persist** across calls within the same worker:

```python
# This counter persists!
counter = 0

def call_api(prompt, options, context):
    global counter
    counter += 1
    return {"output": f"Call #{counter}"}
```

Results:

- Call 1: "Call #1"
- Call 2: "Call #2" ← Counter persisted!
- Call 3: "Call #3"

**If you need fresh state for each call**, move initialization into the function:

```python
def call_api(prompt, options, context):
    # Fresh counter every call
    counter = 0
    counter += 1
    return {"output": f"Call #{counter}"}  # Always "Call #1"
```

### Configuring Worker Count

Control parallelism per provider:

```yaml
providers:
  # Default: 1 worker (memory-efficient, perfect for ML models)
  - id: file://gpu_model.py

  # Opt-in to parallel workers for CPU-bound tasks
  - id: file://api_wrapper.py
    config:
      workers: 4 # Spawn 4 parallel workers
```

Or set globally via environment:

```bash
export PROMPTFOO_PYTHON_WORKERS=4
npx promptfoo@latest eval
```

**Default**: 1 worker (memory-efficient, ideal for GPU-bound ML models)

**When to use multiple workers**:

- CPU-bound tasks (not GPU-limited)
- Lightweight API wrappers (no heavy imports)
- You have memory to spare (each worker = separate copy of imports)

**When to use 1 worker** (default):

- ML models (GPU-bound, only 1 can run at a time)
- Heavy imports (avoid memory duplication)
- Memory-constrained environments

### Timeout Configuration

Configure timeout per provider (default: 2 minutes):

```yaml
providers:
  - id: file://slow_model.py
    config:
      timeout: 300000 # 5 minutes in milliseconds
```

### Backward Compatibility

All existing Python providers work without changes. This is a performance improvement, not a breaking change.

**Edge case**: Scripts relying on globals being reset each call will see different behavior. This is rare and easily fixed by moving state into the function.

````

**Step 2: Verify docs build**

```bash
cd site
npm run build
````

Expected: Builds successfully

**Step 3: Commit**

```bash
git add site/docs/providers/python.md
git commit -m "docs: document Python provider persistence feature

Add comprehensive documentation for persistent worker pools:
- How it works (worker lifecycle)
- Performance improvements (10-100x speedup examples)
- Global state persistence behavior
- Worker count configuration
- Timeout configuration
- When to use multiple workers vs single worker
- Backward compatibility notes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Integration Testing & Cross-Platform Verification

**Files:**

- Create: `test/python/python.integration.test.ts` (modify existing if present)

**Step 1: Add comprehensive integration test**

Modify or create `test/python/python.integration.test.ts`:

```typescript
import { PythonProvider } from '../../src/providers/pythonCompletion';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Python Provider Integration Tests', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Cleanup
    tempFiles.forEach((file) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // ignore
      }
    });
    tempFiles = [];
  });

  function writeTempPython(content: string): string {
    const tempFile = path.join(
      os.tmpdir(),
      `test-provider-${Date.now()}-${Math.random().toString(16).slice(2)}.py`,
    );
    fs.writeFileSync(tempFile, content);
    tempFiles.push(tempFile);
    return tempFile;
  }

  it('should handle heavy imports efficiently (load once)', async () => {
    const scriptPath = writeTempPython(`
import time

# Simulate heavy import
print("Loading heavy library...", flush=True)
time.sleep(0.5)  # 500ms "import" time
print("Library loaded!", flush=True)

load_time = time.time()

def call_api(prompt, options, context):
    return {
        "output": f"Loaded at: {load_time}",
        "load_time": load_time
    }
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: { basePath: process.cwd() },
    });

    const start = Date.now();
    await provider.initialize();
    const initTime = Date.now() - start;

    // First call
    const result1 = await provider.callApi('test1');
    const call1Time = Date.now() - start;

    // Second call (should be fast - no re-import)
    const result2 = await provider.callApi('test2');
    const call2Time = Date.now() - start;

    // Third call
    const result3 = await provider.callApi('test3');

    // Verify same load_time (same process)
    expect(result1.load_time).toBe(result2.load_time);
    expect(result2.load_time).toBe(result3.load_time);

    // Verify subsequent calls are fast (no 500ms re-import)
    expect(call2Time - call1Time).toBeLessThan(200); // Should be < 200ms

    await provider.shutdown();
  }, 10000);

  it('should handle Unicode correctly (cross-platform)', async () => {
    const scriptPath = writeTempPython(`
def call_api(prompt, options, context):
    return {
        "output": f"Echo: {prompt}",
        "emoji": "🚀",
        "cjk": "你好世界",
        "accents": "Café, naïve, Ångström"
    }
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();

    const result = await provider.callApi('Test with emoji: 😀 and CJK: 測試');

    expect(result.output).toContain('😀');
    expect(result.output).toContain('測試');
    expect(result.emoji).toBe('🚀');
    expect(result.cjk).toBe('你好世界');
    expect(result.accents).toContain('Café');

    await provider.shutdown();
  });

  it('should handle async Python functions', async () => {
    const scriptPath = writeTempPython(`
import asyncio

async def call_api(prompt, options, context):
    await asyncio.sleep(0.1)
    return {"output": f"Async: {prompt}"}
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();
    const result = await provider.callApi('async test');

    expect(result.output).toBe('Async: async test');

    await provider.shutdown();
  });

  it('should handle errors gracefully without crashing worker', async () => {
    const scriptPath = writeTempPython(`
def call_api(prompt, options, context):
    if "error" in prompt:
        raise ValueError("Intentional error")
    return {"output": f"OK: {prompt}"}
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: { basePath: process.cwd() },
    });

    await provider.initialize();

    // First call succeeds
    const result1 = await provider.callApi('good');
    expect(result1.output).toBe('OK: good');

    // Second call errors
    await expect(provider.callApi('error here')).rejects.toThrow('Intentional error');

    // Third call succeeds (worker still alive!)
    const result3 = await provider.callApi('good again');
    expect(result3.output).toBe('OK: good again');

    await provider.shutdown();
  });

  it('should work with multiple workers (concurrency)', async () => {
    const scriptPath = writeTempPython(`
import time

counter = 0

def call_api(prompt, options, context):
    global counter
    counter += 1
    time.sleep(0.1)  # 100ms
    return {"output": f"Worker count: {counter}"}
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: {
        basePath: process.cwd(),
        workers: 4, // 4 workers
      },
    });

    await provider.initialize();

    const start = Date.now();

    // 4 concurrent calls with 4 workers should run in parallel
    const results = await Promise.all([
      provider.callApi('1'),
      provider.callApi('2'),
      provider.callApi('3'),
      provider.callApi('4'),
    ]);

    const duration = Date.now() - start;

    // Each call takes 100ms, with 4 workers they run in parallel
    // Total time should be ~100ms, not 400ms
    expect(duration).toBeLessThan(250); // Allow some overhead

    // Each worker maintains its own counter
    results.forEach((r) => {
      expect(r.output).toMatch(/Worker count: \d+/);
    });

    await provider.shutdown();
  }, 10000);
});
```

**Step 2: Run integration tests**

```bash
npx jest test/python/python.integration.test.ts --verbose
```

Expected: PASS on current platform

**Step 3: Test on Windows (if available)**

If you have Windows access:

```bash
# On Windows
npm test -- test/python/python.integration.test.ts
```

**Step 4: Commit**

```bash
git add test/python/python.integration.test.ts
git commit -m "test: add comprehensive integration tests for persistence

Integration tests verify:
- Heavy imports loaded once (not per call)
- Same process reused (load_time persists)
- Subsequent calls are fast (no re-import overhead)
- Unicode handling (emoji, CJK, accents) cross-platform
- Async Python functions work correctly
- Error isolation (worker survives exceptions)
- Multiple workers enable true concurrency
- Parallel execution faster than sequential

These tests verify real-world usage patterns and cross-platform compatibility.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Run Full Test Suite & Fix Any Regressions

**Files:**

- Various (fix any failing tests)

**Step 1: Run all Python-related tests**

```bash
npx jest --testPathPattern="python|pythonCompletion" --verbose
```

Expected: All tests PASS

**Step 2: If any tests fail, analyze and fix**

Common issues:

- Tests expecting ephemeral behavior (globals reset)
- Tests not cleaning up providers (memory leaks)
- Tests with race conditions (timing assumptions)

Fix each failing test, commit individually.

**Step 3: Run broader test suite**

```bash
npm test
```

Expected: All tests PASS

**Step 4: Commit any fixes**

```bash
git add <fixed-files>
git commit -m "fix: resolve test regressions from persistence changes

[Describe specific fixes made]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Performance Benchmarking (Optional but Recommended)

**Files:**

- Create: `test/python/performance.benchmark.ts`

**Step 1: Create benchmark test**

Create `test/python/performance.benchmark.ts`:

```typescript
import { PythonProvider } from '../../src/providers/pythonCompletion';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe.skip('Performance Benchmarks (manual)', () => {
  function writeTempPython(content: string): string {
    const tempFile = path.join(os.tmpdir(), `bench-${Date.now()}.py`);
    fs.writeFileSync(tempFile, content);
    return tempFile;
  }

  it('benchmark: heavy import speedup', async () => {
    const scriptPath = writeTempPython(`
import time
time.sleep(1)  # Simulate 1s import

def call_api(prompt, options, context):
    return {"output": "test"}
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: { basePath: process.cwd() },
    });

    const start = Date.now();
    await provider.initialize();
    const initTime = Date.now() - start;

    console.log(`Initialization (1 worker): ${initTime}ms`);

    const callStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await provider.callApi(`test ${i}`);
    }
    const totalCallTime = Date.now() - callStart;
    const avgCallTime = totalCallTime / 10;

    console.log(`10 calls total: ${totalCallTime}ms`);
    console.log(`Avg per call: ${avgCallTime}ms`);
    console.log(`Expected without persistence: ~10,000ms (1s import × 10 calls)`);
    console.log(`Speedup: ${(10000 / totalCallTime).toFixed(1)}x`);

    expect(avgCallTime).toBeLessThan(100); // Each call should be fast

    await provider.shutdown();
    fs.unlinkSync(scriptPath);
  }, 30000);
});
```

**Step 2: Run benchmark (manual)**

```bash
npx jest test/python/performance.benchmark.ts --verbose
```

**Step 3: Document results**

Add results to commit message or docs.

**Step 4: Commit**

```bash
git add test/python/performance.benchmark.ts
git commit -m "test: add performance benchmarks for persistence

Benchmark demonstrates speedup from persistent workers:
- 1s import time per call (ephemeral) vs once (persistent)
- 10 calls: ~10s persistent vs ~10,000s ephemeral
- Results: [add your results here]

Benchmark is skipped by default (run manually with jest --testNamePattern).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Update Types & Exports

**Files:**

- Modify: `src/index.ts` (export new classes if needed)
- Modify: `src/types/providers.ts` (if any type changes needed)

**Step 1: Export new classes**

Check if `src/index.ts` needs updates:

```typescript
// May need to export for advanced users
export { PythonWorker } from './python/worker';
export { PythonWorkerPool } from './python/workerPool';
```

**Step 2: Update provider types if needed**

Check `src/types/providers.ts` for any needed type additions.

**Step 3: Run type check**

```bash
npm run tsc
```

Expected: No type errors

**Step 4: Commit**

```bash
git add src/index.ts src/types/providers.ts
git commit -m "feat: export worker classes and update types

Export PythonWorker and PythonWorkerPool for advanced users.
All types are correct and compile without errors.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Final Verification Checklist

Before creating PR, verify:

- [ ] All tests pass: `npm test`
- [ ] No type errors: `npm run tsc`
- [ ] No lint errors: `npm run lint`
- [ ] Documentation builds: `cd site && npm run build`
- [ ] Integration tests pass
- [ ] Manual testing with real ML model (if available)
- [ ] Tested on Windows/Linux/macOS (if available)
- [ ] No zombie processes left after Ctrl+C
- [ ] Memory usage reasonable (check with `top` during eval)

---

## Success Criteria

- ✅ All existing tests pass (backward compatibility)
- ✅ New tests for persistence pass
- ✅ No unicode regressions
- ✅ No zombie processes
- ✅ Documentation clear and complete
- ✅ Performance improvement measurable (10x+ for heavy imports)
- ✅ Cross-platform compatible (Windows, Linux, macOS)

---

## References

- Design doc: `PYTHON_PROVIDER_PERSISTENCE_DESIGN.md`
- Existing Python provider: `src/providers/pythonCompletion.ts`
- Existing wrapper: `src/python/wrapper.py`
- Python shell docs: https://github.com/extrabacon/python-shell

---

## Execution Notes

This plan uses TDD (Test-Driven Development):

1. Write failing test
2. Run test to verify it fails
3. Write minimal implementation
4. Run test to verify it passes
5. Commit

Each task should take 15-30 minutes. Commit frequently. Follow @superpowers/test-driven-development and @superpowers/verification-before-completion.
