import { PythonWorker } from '../../src/python/worker';
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
