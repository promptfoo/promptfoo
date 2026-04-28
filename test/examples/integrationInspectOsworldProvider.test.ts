import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { mockProcessEnv } from '../util/utils';

describe('integration-inspect-osworld example provider', () => {
  const tempDirs: string[] = [];
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  function makeTempDir(): string {
    const root = path.join(process.cwd(), 'scratch', 'osworld-provider-tests');
    fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'case-'));
    tempDirs.push(dir);
    return dir;
  }

  function pythonExecutable(): string {
    return process.env.PROMPTFOO_PYTHON || process.env.PYTHON || process.env.PYTHON3 || 'python3';
  }

  it('finds Inspect logs when promptfoo passes a relative basePath', async () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      path.join(providerDir, 'provider.py'),
    );

    const fakeInspectPath = path.join(tempDir, 'fake_inspect.py');
    const recordPath = path.join(tempDir, 'inspect_eval_record.json');
    fs.writeFileSync(
      fakeInspectPath,
      `
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]

if args[:2] == ["log", "dump"]:
    eval_log = Path(args[2])
    if not eval_log.exists():
        print(f"missing eval log: {eval_log}", file=sys.stderr)
        sys.exit(2)
    print(json.dumps({
        "status": "success",
        "samples": [{
            "id": "sample-123",
            "scores": {"osworld_scorer": {"value": "C"}},
            "output": {"completion": "DONE"},
            "messages": [{"role": "assistant", "content": "DONE"}],
            "model_usage": {"mock/model": {"input_tokens": 10, "output_tokens": 3}},
        }],
        "results": {"scores": [{"metrics": {"accuracy": {"value": 1.0}}}]},
    }))
    sys.exit(0)

if args and args[0] == "eval":
    log_dir = Path(args[args.index("--log-dir") + 1])
    Path(os.environ["FAKE_INSPECT_RECORD"]).write_text(json.dumps({
        "cwd": os.getcwd(),
        "log_dir": str(log_dir),
        "is_absolute": log_dir.is_absolute(),
    }))
    if not log_dir.is_absolute():
        print(f"log dir should be absolute, got: {log_dir}", file=sys.stderr)
        sys.exit(3)
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "fake.eval").write_text("fake eval")
    sys.exit(0)

print(f"unexpected args: {args}", file=sys.stderr)
sys.exit(4)
`,
    );

    restoreEnv = mockProcessEnv({ FAKE_INSPECT_RECORD: recordPath });

    const provider = new PythonProvider('file://provider.py', {
      config: {
        basePath: path.relative(process.cwd(), providerDir),
        defaultModel: 'mock/model',
        inspectCommand: [pythonExecutable(), fakeInspectPath],
        pythonExecutable: pythonExecutable(),
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { app: 'libreoffice_calc' },
      } as any);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('sample-123');
      expect(result.metadata).toMatchObject({
        app: 'libreoffice_calc',
        model: 'mock/model',
        sample_id: 'sample-123',
        score: 1,
        status: 'pass',
      });
      expect(result.tokenUsage).toMatchObject({ completion: 3, prompt: 10, total: 13 });

      const inspectLogPath = String(result.metadata?.inspect_log_path);
      expect(path.isAbsolute(inspectLogPath)).toBe(true);
      expect(path.normalize(inspectLogPath)).toContain(path.join('example', 'inspect_logs'));
      expect(path.normalize(inspectLogPath)).not.toContain(
        path.join('example', 'example', 'inspect_logs'),
      );

      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      expect(record.is_absolute).toBe(true);
      expect(path.resolve(record.cwd)).toBe(path.resolve(providerDir));
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('surfaces Inspect log runtime errors as provider errors', async () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      path.join(providerDir, 'provider.py'),
    );

    const fakeInspectPath = path.join(tempDir, 'fake_inspect.py');
    fs.writeFileSync(
      fakeInspectPath,
      `
import json
import sys
from pathlib import Path

args = sys.argv[1:]

if args[:2] == ["log", "dump"]:
    print(json.dumps({
        "status": "error",
        "samples": [{
            "id": "sample-error",
            "scores": {},
            "error": {"message": "computer tool rejected wait duration"},
            "messages": [],
            "model_usage": {"mock/model": {"input_tokens": 4, "output_tokens": 2}},
        }],
    }))
    sys.exit(0)

if args and args[0] == "eval":
    log_dir = Path(args[args.index("--log-dir") + 1])
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "fake.eval").write_text("fake eval")
    sys.exit(0)

sys.exit(4)
`,
    );

    const provider = new PythonProvider('file://provider.py', {
      config: {
        basePath: path.relative(process.cwd(), providerDir),
        defaultModel: 'mock/model',
        inspectCommand: [pythonExecutable(), fakeInspectPath],
        pythonExecutable: pythonExecutable(),
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { app: 'libreoffice_calc' },
      } as any);

      expect(result.error).toContain('computer tool rejected wait duration');
      expect(result.metadata).toMatchObject({
        inspect_error: 'computer tool rejected wait duration',
        inspect_status: 'error',
        sample_id: 'sample-error',
        status: 'error',
      });
      expect(result.tokenUsage).toMatchObject({ completion: 2, prompt: 4, total: 6 });
    } finally {
      await provider.shutdown();
    }
  }, 20_000);
});
