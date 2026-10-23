import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPython } from '../../src/python/pythonUtils';
import { PythonWorker } from '../../src/python/worker';

describe.each(['one-shot', 'persistent'] as const)('%s Python module loading', (mode) => {
  let directory: string;
  let scriptPath: string;
  let worker: PythonWorker | undefined;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-module-loading-'));
    scriptPath = path.join(directory, 'provider.py');
  });

  afterEach(async () => {
    await worker?.shutdown();
    worker = undefined;
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function callProvider(source: string) {
    await fs.writeFile(scriptPath, source);
    if (mode === 'one-shot') {
      return runPython(scriptPath, 'call_api', ['hello']);
    }
    worker = new PythonWorker(scriptPath, 'call_api');
    await worker.initialize();
    return worker.call('call_api', ['hello']);
  }

  it('loads dataclasses with postponed annotations', async () => {
    const result = await callProvider(`from __future__ import annotations
from dataclasses import dataclass
from typing import ClassVar


@dataclass
class Response:
    output: str
    prefix: ClassVar[str] = "Echo: "


def call_api(prompt):
    response = Response(Response.prefix + prompt)
    return {"output": response.output}
`);

    expect(result).toEqual({ output: 'Echo: hello' });
  });

  it('reuses the loaded module when it imports itself', async () => {
    const result = await callProvider(`import importlib

marker = object()


def call_api(prompt):
    imported = importlib.import_module(__name__)
    return {"output": prompt, "same_module": imported.marker is marker}
`);

    expect(result).toEqual({ output: 'hello', same_module: true });
  });

  it('round-trips objects defined in the module through pickle', async () => {
    const result = await callProvider(`import pickle


class Response:
    def __init__(self, output):
        self.output = output


def call_api(prompt):
    response = pickle.loads(pickle.dumps(Response(prompt)))
    return {"output": response.output, "same_class": type(response) is Response}
`);

    expect(result).toEqual({ output: 'hello', same_class: true });
  });

  it('does not replace modules already imported by the wrapper', async () => {
    scriptPath = path.join(directory, 'json.py');
    const result = await callProvider(`import json


def call_api(prompt):
    return {"output": json.dumps({"prompt": prompt})}
`);

    expect(result).toEqual({ output: '{"prompt": "hello"}' });
  });

  it('preserves module initialization errors', async () => {
    await expect(callProvider('raise ValueError("module initialization failed")\n')).rejects.toThrow(
      mode === 'one-shot'
        ? 'module initialization failed'
        : 'Python worker exited before becoming ready (exit code 1)',
    );
  });
});
