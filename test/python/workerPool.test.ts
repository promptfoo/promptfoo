import { PythonWorkerPool } from '../../src/python/workerPool';
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
