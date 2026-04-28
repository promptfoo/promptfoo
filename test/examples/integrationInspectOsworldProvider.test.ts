import { spawnSync } from 'child_process';
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

  it('generates the pinned osworld_small sample suite', () => {
    const tempDir = makeTempDir();
    const testsPath = path.join(
      process.cwd(),
      'examples',
      'integration-inspect-osworld',
      'osworld_tests.py',
    );
    const checkPath = path.join(tempDir, 'check_osworld_tests.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import json
import sys
from pathlib import Path

tests_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("osworld_tests", tests_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

tests = module.generate_tests()
calc_tests = module.generate_tests({"include_apps": ["libreoffice_calc"]})
print(json.dumps({
    "count": len(tests),
    "apps": sorted({test["vars"]["app"] for test in tests}),
    "calc_count": len(calc_tests),
    "first": tests[0],
    "has_rerun_sample": any(
        test["vars"]["sample_id"] == "eb303e01-261e-4972-8c07-c9b4e7a4922a"
        for test in tests
    ),
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, testsPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.count).toBe(21);
    expect(parsed.apps).toEqual([
      'gimp',
      'libreoffice_calc',
      'libreoffice_impress',
      'libreoffice_writer',
      'multi_apps',
      'os',
      'vlc',
      'vscode',
    ]);
    expect(parsed.calc_count).toBe(3);
    expect(parsed.has_rerun_sample).toBe(true);
    expect(parsed.first).toMatchObject({
      description: 'gimp - lower image brightness',
      vars: {
        app: 'gimp',
        sample_id: '7a4deb26-d57d-4ea9-9a73-630f66a7b568',
      },
      metadata: {
        app: 'gimp',
        sample_id: '7a4deb26-d57d-4ea9-9a73-630f66a7b568',
        testCaseId: 'osworld-gimp-7a4deb26',
      },
    });
  });

  it('creates unique log dirs for repeated same-app calls in one timestamp', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    const providerPath = path.join(providerDir, 'provider.py');
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      providerPath,
    );

    const checkPath = path.join(tempDir, 'check_log_dirs.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path

provider_path = Path(sys.argv[1])
log_root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("provider", provider_path)
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)

class FrozenDateTime:
    @staticmethod
    def now(tz=None):
        return datetime(2026, 1, 2, 3, 4, 5, tzinfo=tz)

provider.datetime = FrozenDateTime
first = provider._new_log_dir(log_root, "libreoffice_calc")
second = provider._new_log_dir(log_root, "libreoffice_calc")
print(json.dumps({
    "first": first.name,
    "second": second.name,
    "count": len([path for path in log_root.iterdir() if path.name.startswith("20260102T030405Z-")]),
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath, tempDir], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.first).not.toBe(parsed.second);
    expect(parsed.first).toMatch(/^20260102T030405Z-libreoffice_calc-\d+-[0-9a-f]{8}$/);
    expect(parsed.second).toMatch(/^20260102T030405Z-libreoffice_calc-\d+-[0-9a-f]{8}$/);
    expect(parsed.count).toBe(2);
  });

  it('rejects non-integer task indexes', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    const providerPath = path.join(providerDir, 'provider.py');
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      providerPath,
    );

    const checkPath = path.join(tempDir, 'check_task_index.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import json
import sys
from pathlib import Path

provider_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("provider", provider_path)
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)

bad_values = [1.5, True, False]
errors = []
for value in bad_values:
    try:
        provider._limit_for_task_index(value)
    except ValueError as exc:
        errors.append(str(exc))
    else:
        raise AssertionError(f"accepted invalid task_index: {value!r}")

print(json.dumps({
    "valid": provider._limit_for_task_index("2"),
    "errors": errors,
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.valid).toBe('3-3');
    expect(parsed.errors).toEqual([
      'task_index must be an integer starting at 0',
      'task_index must be an integer starting at 0',
      'task_index must be an integer starting at 0',
    ]);
  });

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

  it('selects exact OSWorld samples by sample_id without app filters', async () => {
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
    print(json.dumps({
        "status": "success",
        "samples": [{
            "id": "exact-sample-123",
            "scores": {"osworld_scorer": {"value": "C"}},
            "output": {"completion": "DONE"},
            "messages": [{"role": "assistant", "content": "DONE"}],
        }],
    }))
    sys.exit(0)

if args and args[0] == "eval":
    Path(os.environ["FAKE_INSPECT_RECORD"]).write_text(json.dumps({"args": args}))
    log_dir = Path(args[args.index("--log-dir") + 1])
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "fake.eval").write_text("fake eval")
    sys.exit(0)

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
        vars: { sample_id: 'exact-sample-123' },
      } as any);

      expect(result.error).toBeUndefined();
      expect(result.metadata).toMatchObject({
        app: 'sample_id',
        requested_sample_id: 'exact-sample-123',
        sample_id: 'exact-sample-123',
        score: 1,
        status: 'pass',
      });

      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      expect(record.args).toContain('--sample-id');
      expect(record.args).toContain('exact-sample-123');
      expect(record.args).not.toContain('--limit');
      expect(record.args).not.toContain('-T');
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('treats zero selected Inspect samples as provider errors', async () => {
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
        "status": "success",
        "samples": [],
        "results": {"scores": []},
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
        vars: { app: 'libreoffice_calc', task_index: 1 },
      } as any);

      expect(result.error).toContain('selected zero samples');
      expect(result.metadata).toMatchObject({
        app: 'libreoffice_calc',
        inspect_error:
          'Inspect completed, but selected zero samples or recorded no scorer result. Check vars.app, vars.task_index, or vars.sample_id.',
        sample_id: 'unknown sample',
        status: 'error',
      });
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('condenses long Inspect computer command failures', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    const providerPath = path.join(providerDir, 'provider.py');
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      providerPath,
    );

    const checkPath = path.join(tempDir, 'check_error_summary.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import sys
from pathlib import Path

provider_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("provider", provider_path)
provider = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provider)

print(provider._summarize_inspect_error("RuntimeError('Failure executing command: $['python3', 'tool.py', '--text=' + 'x' * 5000]')"))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'Inspect computer tool failed while executing a model-requested desktop command. See the Inspect log for the full traceback and command output.',
    );
  });

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
