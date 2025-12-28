import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';

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
