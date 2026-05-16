import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { mockProcessEnv } from '../util/utils';

describe('integration-inspect-osworld example provider', () => {
  const tempDirs: string[] = [];
  let restoreEnv: (() => void) | undefined;
  let cachedPythonExecutable: string | undefined;

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
    if (cachedPythonExecutable) {
      return cachedPythonExecutable;
    }

    const pythonProbe = 'import sys; print(sys.executable)';
    const candidates = [
      ...(process.env.PROMPTFOO_PYTHON
        ? [{ command: process.env.PROMPTFOO_PYTHON, args: ['-c', pythonProbe] }]
        : []),
      ...(process.env.PYTHON ? [{ command: process.env.PYTHON, args: ['-c', pythonProbe] }] : []),
      ...(process.env.PYTHON3 ? [{ command: process.env.PYTHON3, args: ['-c', pythonProbe] }] : []),
      ...(process.platform === 'win32'
        ? [
            { command: 'py', args: ['-3', '-c', pythonProbe] },
            { command: 'python', args: ['-c', pythonProbe] },
          ]
        : [
            { command: 'python3', args: ['-c', pythonProbe] },
            { command: 'python', args: ['-c', pythonProbe] },
          ]),
    ];

    for (const candidate of candidates) {
      const result = spawnSync(candidate.command, candidate.args, { encoding: 'utf8' });
      const executable = result.status === 0 ? result.stdout.trim() : '';
      if (executable) {
        cachedPythonExecutable = executable;
        return executable;
      }
    }

    return process.platform === 'win32' ? 'python' : 'python3';
  }

  it('generates the Inspect osworld_small sample suite', () => {
    const tempDir = makeTempDir();
    const fakeInspectRoot = path.join(tempDir, 'fake-inspect');
    const fakeOsworldDir = path.join(fakeInspectRoot, 'inspect_evals', 'osworld');
    fs.mkdirSync(fakeOsworldDir, { recursive: true });
    fs.writeFileSync(path.join(fakeInspectRoot, 'inspect_evals', '__init__.py'), '');
    fs.writeFileSync(
      path.join(fakeOsworldDir, '__init__.py'),
      `
from types import SimpleNamespace

APP_DIRS = [
    "gimp",
    "gimp",
    "libreoffice_calc",
    "libreoffice_calc",
    "libreoffice_calc",
    "libreoffice_impress",
    "libreoffice_impress",
    "libreoffice_writer",
    "libreoffice_writer",
    "multi_apps",
    "multi_apps",
    "multi_apps",
    "multi_apps",
    "multi_apps",
    "multi_apps",
    "os",
    "os",
    "vlc",
    "vs_code",
    "vs_code",
    "vs_code",
]
FULL_APP_DIRS = APP_DIRS + ["chrome", "thunderbird"]

class FakeSample:
    def __init__(self, index, app_dir):
        sample_id = f"{index:08d}-0000-4000-8000-000000000000"
        self.id = sample_id
        self.input = f"Instruction {index} for {app_dir}"
        self.files = {
            "/tmp/osworld/desktop_env/example.json": (
                f"/cache/osworld/repo/evaluation_examples/examples/{app_dir}/{sample_id}.json"
            )
        }

def _samples():
    return [FakeSample(index, app_dir) for index, app_dir in enumerate(APP_DIRS, start=1)]

def osworld_small():
    return SimpleNamespace(dataset=_samples())

def osworld(include_connected=False):
    return SimpleNamespace(
        dataset=[FakeSample(index, app_dir) for index, app_dir in enumerate(FULL_APP_DIRS, start=1)]
    )
`,
    );

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
full_tests = module.generate_full_tests()
print(json.dumps({
    "count": len(tests),
    "full_count": len(full_tests),
    "apps": sorted({test["vars"]["app"] for test in tests}),
    "full_apps": sorted({test["vars"]["app"] for test in full_tests}),
    "vscode_count": sum(1 for test in tests if test["vars"]["app"] == "vscode"),
    "first": tests[0],
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, testsPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: [fakeInspectRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.count).toBe(21);
    expect(parsed.full_count).toBe(23);
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
    expect(parsed.full_apps).toEqual([
      'chrome',
      'gimp',
      'libreoffice_calc',
      'libreoffice_impress',
      'libreoffice_writer',
      'multi_apps',
      'os',
      'thunderbird',
      'vlc',
      'vscode',
    ]);
    expect(parsed.vscode_count).toBe(3);
    expect(parsed.first).toMatchObject({
      description: 'gimp - Instruction 1 for gimp',
      vars: {
        app: 'gimp',
        prompt: 'Instruction 1 for gimp',
        sample_id: '00000001-0000-4000-8000-000000000000',
      },
      metadata: {
        app: 'gimp',
        sample_id: '00000001-0000-4000-8000-000000000000',
        testCaseId: 'osworld-gimp-00000001',
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
from types import SimpleNamespace

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
uuid_values = iter([
    "aaaaaaaa000000000000000000000000",
    "bbbbbbbb000000000000000000000000",
])
provider.uuid.uuid4 = lambda: SimpleNamespace(hex=next(uuid_values))
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
    expect(parsed.first).toMatch(/^20260102T030405Z-libreoffice_calc-\d+-aaaaaaaa$/);
    expect(parsed.second).toMatch(/^20260102T030405Z-libreoffice_calc-\d+-bbbbbbbb$/);
    expect(parsed.count).toBe(2);
  });

  it('prefers osworld_scorer and treats missing scorer results as provider errors', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    const providerPath = path.join(providerDir, 'provider.py');
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      providerPath,
    );

    const checkPath = path.join(tempDir, 'check_scores.py');
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

preferred, preferred_error = provider._sample_score({
    "scores": {
        "aux_metric": {"value": 1.0},
        "osworld_scorer": {"value": 0.0},
    }
})
missing_scorer, missing_scorer_error = provider._sample_score({
    "scores": {
        "aux_metric": {"value": 1.0},
    }
})
aggregate_only = provider._parse_inspect_log({
    "status": "success",
    "samples": [{
        "id": "sample-123",
        "scores": {},
    }],
    "results": {
        "scores": [{
            "metrics": {"accuracy": {"value": 1.0}},
        }],
    },
})
missing_error = provider._inspect_log_error({
    "score": None,
    "sample_id": "sample-123",
    "inspect_status": "success",
})

print(json.dumps({
    "preferred": preferred,
    "preferred_error": preferred_error,
    "missing_scorer": missing_scorer,
    "missing_scorer_error": missing_scorer_error,
    "aggregate_only_score": aggregate_only["score"],
    "missing_error": missing_error,
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.preferred).toBe(0);
    expect(parsed.preferred_error).toBeNull();
    expect(parsed.missing_scorer).toBeNull();
    expect(parsed.missing_scorer_error).toBe(
      'Inspect did not record osworld_scorer for the selected sample.',
    );
    expect(parsed.aggregate_only_score).toBeNull();
    expect(parsed.missing_error).toBe(
      'Inspect completed sample sample-123, but no OSWorld scorer result was recorded.',
    );
  });

  it('summarizes unscored Inspect sample errors without returning raw tracebacks', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    const providerPath = path.join(providerDir, 'provider.py');
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      providerPath,
    );

    const checkPath = path.join(tempDir, 'check_error_summaries.py');
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

print(json.dumps({
    "computer_tool": provider._summarize_inspect_error(
        "Failure executing command: pyautogui.click(...)\\ntraceback"
    ),
    "missing_image": provider._summarize_inspect_error(
        "FileNotFoundError: /tmp/osworld/cache/image_original.png\\ntraceback"
    ),
    "missing_vm_ip": provider._summarize_inspect_error(
        "AttributeError: 'OSWorldDesktopEnv' object has no attribute 'vm_ip'\\ntraceback"
    ),
    "generic": provider._summarize_inspect_error(
        "very long secret-ish scorer traceback\\nsecond line"
    ),
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.computer_tool).toBe(
      'Inspect computer tool failed while executing a model-requested desktop command. See the Inspect log for the full traceback and command output.',
    );
    expect(parsed.missing_image).toBe(
      'OSWorld scorer could not read an expected image artifact. See the Inspect log for the full traceback.',
    );
    expect(parsed.missing_vm_ip).toBe(
      'OSWorld scorer could not read VLC desktop state. See the Inspect log for the full traceback.',
    );
    expect(parsed.generic).toBe(
      'Inspect reported an unscored sample error. See the Inspect log for details.',
    );
  });

  it('rejects empty Inspect commands before launching Inspect', async () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), 'examples', 'integration-inspect-osworld', 'provider.py'),
      path.join(providerDir, 'provider.py'),
    );

    const provider = new PythonProvider('file://provider.py', {
      config: {
        basePath: path.relative(process.cwd(), providerDir),
        defaultModel: 'mock/model',
        inspectCommand: '   ',
        pythonExecutable: pythonExecutable(),
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { sample_id: 'sample-123' },
      } as any);

      expect(result.error).toBe(
        'Inspect CLI command is empty. Set providers[0].config.inspectCommand or PROMPTFOO_OSWORLD_INSPECT_COMMAND.',
      );
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

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
        "args": args,
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
        vars: { app: 'libreoffice_calc', sample_id: 'sample-123' },
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
      expect(record.args).toContain('--sample-id');
      expect(record.args).toContain('sample-123');
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
        app: 'unknown',
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

  it('passes configured Inspect task parameters to full-suite runs', async () => {
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
            "id": "sample-123",
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
        task: 'inspect_evals/osworld',
        taskParameters: {
          include_connected: true,
          max_attempts: 2,
        },
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { sample_id: 'sample-123' },
      } as any);

      expect(result.error).toBeUndefined();
      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      expect(record.args).toEqual(
        expect.arrayContaining([
          'eval',
          'inspect_evals/osworld',
          '-T',
          'include_connected=true',
          '-T',
          'max_attempts=2',
        ]),
      );
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('returns a provider error when Inspect returns the wrong sample id', async () => {
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
        "samples": [{
            "id": "other-sample",
            "scores": {"osworld_scorer": {"value": "C"}},
            "messages": [],
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
        vars: { app: 'libreoffice_calc', sample_id: 'requested-sample' },
      } as any);

      expect(result.error).toBe(
        'Inspect returned sample other-sample, but Promptfoo requested requested-sample.',
      );
      expect(result.metadata).toMatchObject({
        requested_sample_id: 'requested-sample',
        sample_id: 'other-sample',
        status: 'error',
      });
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
        vars: { sample_id: 'missing-sample' },
      } as any);

      expect(result.error).toContain('selected zero samples');
      expect(result.metadata).toMatchObject({
        app: 'unknown',
        inspect_error:
          'Inspect completed, but selected zero samples or recorded no scorer result. Check vars.sample_id.',
        sample_id: 'unknown sample',
        status: 'error',
      });
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('does not persist captured Inspect failure output or command secrets', async () => {
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
import sys

print("sensitive stderr sekret", file=sys.stderr)
print("sensitive stdout sekret")
sys.exit(7)
`,
    );

    const provider = new PythonProvider('file://provider.py', {
      config: {
        basePath: path.relative(process.cwd(), providerDir),
        defaultModel: 'mock/model',
        inspectCommand: [pythonExecutable(), fakeInspectPath, '--api-key', 'sekret'],
        pythonExecutable: pythonExecutable(),
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { sample_id: 'sample-123' },
      } as any);

      expect(result.error).toBe('Inspect eval failed with exit code 7.');
      expect(result.error).not.toContain('sekret');
      expect(result.metadata).toMatchObject({ status: 'error' });
      expect(result.metadata).not.toHaveProperty('stdout_tail');
      expect(result.metadata).not.toHaveProperty('stderr_tail');
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
        vars: { app: 'libreoffice_calc', sample_id: 'sample-error' },
      } as any);

      expect(result.error).toContain(
        'Inspect reported an unscored sample error. See the Inspect log for details.',
      );
      expect(result.metadata).toMatchObject({
        inspect_error:
          'Inspect reported an unscored sample error. See the Inspect log for details.',
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
