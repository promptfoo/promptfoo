import { PythonWorkerPool } from '../../src/python/workerPool';
import fs from 'fs';
import path from 'path';

// Windows CI has slower Python process startup - use longer timeout
const TEST_TIMEOUT = process.platform === 'win32' ? 20000 : 5000;

describe('PythonWorkerPool', () => {
  let pool: PythonWorkerPool;
  const testScriptPath = path.join(__dirname, 'fixtures', 'counter_provider.py');
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeAll(() => {
    // Create fixtures directory if it doesn't exist
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

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
    if (fs.existsSync(testScriptPath)) {
      fs.unlinkSync(testScriptPath);
    }
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  it(
    'should initialize pool with specified worker count',
    async () => {
      pool = new PythonWorkerPool(testScriptPath, 'call_api', 2);
      await pool.initialize();
      expect(pool.getWorkerCount()).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'should execute calls sequentially with 1 worker',
    async () => {
      pool = new PythonWorkerPool(testScriptPath, 'call_api', 1);
      await pool.initialize();

      const result1 = await pool.execute('call_api', ['First', {}, {}]);
      const result2 = await pool.execute('call_api', ['Second', {}, {}]);
      const result3 = await pool.execute('call_api', ['Third', {}, {}]);

      // Same worker, counter increments
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
      expect(result3.count).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle concurrent calls with multiple workers',
    async () => {
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
    },
    TEST_TIMEOUT,
  );

  it(
    'should queue requests when all workers busy',
    async () => {
      pool = new PythonWorkerPool(testScriptPath, 'call_api', 1);
      await pool.initialize();

      // Start 3 concurrent calls with 1 worker - should queue
      const promises = [
        pool.execute('call_api', ['Q1', {}, {}]),
        pool.execute('call_api', ['Q2', {}, {}]),
        pool.execute('call_api', ['Q3', {}, {}]),
      ];

      const results = await Promise.all(promises);

      // All should complete (queued and executed)
      expect(results.length).toBe(3);
      expect(results[0].count).toBe(1);
      expect(results[1].count).toBe(2);
      expect(results[2].count).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle different function names across pool',
    async () => {
      const multiApiPath = path.join(__dirname, 'fixtures', 'pool_multi_api.py');
      fs.writeFileSync(
        multiApiPath,
        `
def call_api(prompt, options, context):
    return {"output": f"text: {prompt}", "type": "text"}

def call_embedding_api(prompt, options, context):
    return {"output": [0.1, 0.2], "type": "embedding"}
`,
      );

      try {
        pool = new PythonWorkerPool(multiApiPath, 'call_api', 2);
        await pool.initialize();

        // Call different functions concurrently
        const results = await Promise.all([
          pool.execute('call_api', ['hello', {}, {}]),
          pool.execute('call_embedding_api', ['world', {}, {}]),
          pool.execute('call_api', ['again', {}, {}]),
        ]);

        expect(results[0].type).toBe('text');
        expect(results[1].type).toBe('embedding');
        expect(results[2].type).toBe('text');
      } finally {
        if (fs.existsSync(multiApiPath)) {
          fs.unlinkSync(multiApiPath);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'should process queued requests after worker becomes available',
    async () => {
      const queuePath = path.join(__dirname, 'fixtures', 'pool_queue.py');
      fs.writeFileSync(
        queuePath,
        `
call_count = 0

def call_api(prompt, options, context):
    global call_count
    call_count += 1
    return {"count": call_count, "output": prompt}
`,
      );

      try {
        pool = new PythonWorkerPool(queuePath, 'call_api', 1);
        await pool.initialize();

        // Fire off 5 requests - should queue and process sequentially
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(pool.execute('call_api', [`request-${i}`, {}, {}]));
        }

        const results = await Promise.all(promises);

        // All requests should complete
        expect(results.length).toBe(5);

        // Counter should increment sequentially (all in same worker)
        const counts = results.map((r) => r.count);
        expect(counts).toEqual([1, 2, 3, 4, 5]);
      } finally {
        if (fs.existsSync(queuePath)) {
          fs.unlinkSync(queuePath);
        }
      }
    },
    TEST_TIMEOUT,
  );
});
