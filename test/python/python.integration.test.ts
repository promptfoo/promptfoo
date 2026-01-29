import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('Python Provider Integration Tests', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Cleanup temp files
    tempFiles.forEach((file) => {
      try {
        fs.unlinkSync(file);
      } catch (_e) {
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

    await provider.initialize();

    // Three calls should all reuse the same loaded module
    const result1 = await provider.callApi('test1');
    const result2 = await provider.callApi('test2');
    const result3 = await provider.callApi('test3');

    // Verify same load_time across all calls (same process, no re-import)
    expect(result1.output).toContain('Loaded at:');
    expect(result1.output).toBe(result2.output);
    expect(result2.output).toBe(result3.output);

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
    expect(result.output).toBe('Echo: Test with emoji: 😀 and CJK: 測試');
    expect((result as any).emoji).toBe('🚀');
    expect((result as any).cjk).toBe('你好世界');
    expect((result as any).accents).toContain('Café');

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
    start_time = time.time()
    time.sleep(0.1)  # 100ms
    end_time = time.time()
    return {
        "output": f"Worker count: {counter}",
        "start_time": start_time,
        "end_time": end_time
    }
`);

    const provider = new PythonProvider(`file://${scriptPath}`, {
      config: {
        basePath: process.cwd(),
        workers: 4, // 4 workers
      },
    });

    await provider.initialize();

    // 4 concurrent calls with 4 workers should run in parallel
    const results = await Promise.all([
      provider.callApi('1'),
      provider.callApi('2'),
      provider.callApi('3'),
      provider.callApi('4'),
    ]);

    // Extract timestamps from results
    const startTimes = results.map((r) => (r as any).start_time as number);
    const endTimes = results.map((r) => (r as any).end_time as number);

    // Verify parallelization by checking execution overlap:
    // If parallel: the last call to start begins before the first call ends
    // If sequential: each call starts after the previous ends (no overlap)
    const maxStartTime = Math.max(...startTimes);
    const minEndTime = Math.min(...endTimes);

    // For true parallel execution, there must be overlap
    expect(maxStartTime).toBeLessThan(minEndTime);

    // Each worker maintains its own counter
    results.forEach((r) => {
      expect(r.output).toMatch(/Worker count: \d+/);
    });

    await provider.shutdown();
  }, 10000);
});
