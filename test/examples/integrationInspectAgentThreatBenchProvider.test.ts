import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { mockProcessEnv } from '../util/utils';

describe('integration-inspect-agent-threat-bench example provider', () => {
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
    const root = path.join(process.cwd(), 'scratch', 'agent-threat-bench-provider-tests');
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

  function copyProvider(providerDir: string): void {
    fs.mkdirSync(providerDir, { recursive: true });
    fs.copyFileSync(
      path.join(
        process.cwd(),
        'examples',
        'integration-inspect-agent-threat-bench',
        'provider.py',
      ),
      path.join(providerDir, 'provider.py'),
    );
  }

  it('generates one Promptfoo row per Inspect AgentThreatBench sample', () => {
    const tempDir = makeTempDir();
    const fakeInspectRoot = path.join(tempDir, 'fake-inspect');
    const fakeTaskDir = path.join(fakeInspectRoot, 'inspect_evals', 'agent_threat_bench');
    fs.mkdirSync(fakeTaskDir, { recursive: true });
    fs.writeFileSync(path.join(fakeInspectRoot, 'inspect_evals', '__init__.py'), '');
    fs.writeFileSync(
      path.join(fakeTaskDir, '__init__.py'),
      `
from types import SimpleNamespace

class FakeSample:
    def __init__(self, sample_id, text, owasp_id, attack_name, difficulty):
        self.id = sample_id
        self.input = text
        self.metadata = {
            "owasp_id": owasp_id,
            "attack_name": attack_name,
            "difficulty": difficulty,
        }

def agent_threat_bench_memory_poison():
    return SimpleNamespace(dataset=[
        FakeSample("mp_001", "What is the vacation policy?", "ASI06", "direct", "easy"),
        FakeSample("mp_002", "What benefits are available?", "ASI06", "context", "medium"),
    ])

def agent_threat_bench_autonomy_hijack():
    return SimpleNamespace(dataset=[
        FakeSample("ah_001", "Triage my inbox.", "ASI01", "inline", "easy"),
    ])

def agent_threat_bench_data_exfil():
    return SimpleNamespace(dataset=[
        FakeSample("de_001", "Resolve the customer issue.", "ASI01", "exfil", "hard"),
    ])
`,
    );

    const testsPath = path.join(
      process.cwd(),
      'examples',
      'integration-inspect-agent-threat-bench',
      'agent_threat_bench_tests.py',
    );
    const checkPath = path.join(tempDir, 'check_agent_threat_bench_tests.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import json
import sys
from pathlib import Path

tests_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("agent_threat_bench_tests", tests_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

tests = module.generate_tests()
print(json.dumps({
    "count": len(tests),
    "tasks": [test["vars"]["task"] for test in tests],
    "first": tests[0],
    "last": tests[-1],
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
    expect(parsed.count).toBe(4);
    expect(parsed.tasks).toEqual([
      'memory_poison',
      'memory_poison',
      'autonomy_hijack',
      'data_exfil',
    ]);
    expect(parsed.first).toMatchObject({
      description: 'memory_poison - What is the vacation policy?',
      vars: {
        prompt: 'What is the vacation policy?',
        sample_id: 'mp_001',
        task: 'memory_poison',
      },
      metadata: {
        attack_name: 'direct',
        difficulty: 'easy',
        owasp_id: 'ASI06',
        sample_id: 'mp_001',
        task: 'memory_poison',
        testCaseId: 'agent-threat-bench-memory-poison-mp_001',
      },
    });
    expect(parsed.last.metadata).toMatchObject({
      attack_name: 'exfil',
      difficulty: 'hard',
      owasp_id: 'ASI01',
    });
  });

  it('parses utility and security scores from the AgentThreatBench scorer', () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    copyProvider(providerDir);
    const providerPath = path.join(providerDir, 'provider.py');
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

scores, scores_error = provider._sample_scores({
    "scores": {
        "aux": {"value": 1.0},
        "agent_threat_bench_scorer": {
            "value": {"utility": "C", "security": {"value": "I"}},
        },
    }
})
missing_metric, missing_metric_error = provider._sample_scores({
    "scores": {
        "agent_threat_bench_scorer": {
            "value": {"utility": "C"},
        },
    }
})
missing_scorer, missing_scorer_error = provider._sample_scores({
    "scores": {"aux": {"value": 1.0}}
})
missing_error = provider._inspect_log_error({
    "scores": None,
    "sample_id": "mp_001",
    "inspect_status": "success",
})

print(json.dumps({
    "scores": scores,
    "scores_error": scores_error,
    "missing_metric": missing_metric,
    "missing_metric_error": missing_metric_error,
    "missing_scorer": missing_scorer,
    "missing_scorer_error": missing_scorer_error,
    "missing_error": missing_error,
}))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, providerPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.scores).toEqual({ security: 0, utility: 1 });
    expect(parsed.scores_error).toBeNull();
    expect(parsed.missing_metric).toBeNull();
    expect(parsed.missing_metric_error).toBe(
      'Inspect recorded agent_threat_bench_scorer, but security was not numeric.',
    );
    expect(parsed.missing_scorer).toBeNull();
    expect(parsed.missing_scorer_error).toBe(
      'Inspect did not record agent_threat_bench_scorer for the selected sample.',
    );
    expect(parsed.missing_error).toBe(
      'Inspect completed sample mp_001, but no agent_threat_bench_scorer result was recorded.',
    );
  });

  it('reports AgentThreatBench scores as Promptfoo named metrics', () => {
    const tempDir = makeTempDir();
    const assertionPath = path.join(
      process.cwd(),
      'examples',
      'integration-inspect-agent-threat-bench',
      'assertion.py',
    );
    const checkPath = path.join(tempDir, 'check_assertion.py');
    fs.writeFileSync(
      checkPath,
      `
import importlib.util
import json
import sys
from pathlib import Path

assertion_path = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("assertion", assertion_path)
assertion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assertion)

result = assertion.get_assert("ignored", {
    "providerResponse": {
        "metadata": {
            "inspect_log_path": "/tmp/agent-threat-bench.eval",
            "sample_id": "de_001",
            "security_score": 0,
            "status": "fail",
            "task": "data_exfil",
            "utility_score": 1,
        }
    }
})
print(json.dumps(result))
`,
    );

    const result = spawnSync(pythonExecutable(), [checkPath, assertionPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      named_scores: { security: 0, utility: 1 },
      pass: false,
      score: 0,
    });
  });

  it('rejects empty Inspect commands before launching Inspect', async () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    copyProvider(providerDir);

    const provider = new PythonProvider('file://provider.py', {
      config: {
        basePath: path.relative(process.cwd(), providerDir),
        inspectCommand: '   ',
        pythonExecutable: pythonExecutable(),
        timeout: 10_000,
        timeoutSeconds: 10,
      },
    });

    try {
      const result = await provider.callApi('ignored', {
        vars: { sample_id: 'mp_001', task: 'memory_poison' },
      } as any);

      expect(result.error).toBe(
        'Inspect CLI command is empty. Set providers[0].config.inspectCommand or PROMPTFOO_AGENT_THREAT_BENCH_INSPECT_COMMAND.',
      );
    } finally {
      await provider.shutdown();
    }
  }, 20_000);

  it('runs one exact task sample and returns both scores', async () => {
    const tempDir = makeTempDir();
    const providerDir = path.join(tempDir, 'example');
    copyProvider(providerDir);

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
            "id": "de_001",
            "scores": {
                "agent_threat_bench_scorer": {
                    "value": {"utility": "C", "security": "C"},
                },
            },
            "output": {"completion": "Ticket resolved safely."},
            "messages": [{"role": "assistant", "content": "Ticket resolved safely."}],
            "model_usage": {"mock/model": {"input_tokens": 12, "output_tokens": 5}},
        }],
    }))
    sys.exit(0)

if args and args[0] == "eval":
    log_dir = Path(args[args.index("--log-dir") + 1])
    Path(os.environ["FAKE_INSPECT_RECORD"]).write_text(json.dumps({
        "args": args,
        "cwd": os.getcwd(),
        "is_absolute": log_dir.is_absolute(),
    }))
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
        vars: { sample_id: 'de_001', task: 'data_exfil' },
      } as any);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Task data_exfil sample de_001');
      expect(result.metadata).toMatchObject({
        inspect_task: 'inspect_evals/agent_threat_bench_data_exfil',
        model: 'mock/model',
        sample_id: 'de_001',
        security_score: 1,
        status: 'pass',
        task: 'data_exfil',
        utility_score: 1,
      });
      expect(result.tokenUsage).toMatchObject({ completion: 5, prompt: 12, total: 17 });

      const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      expect(record.is_absolute).toBe(true);
      expect(record.args).toEqual(
        expect.arrayContaining([
          'eval',
          'inspect_evals/agent_threat_bench_data_exfil',
          '--sample-id',
          'de_001',
        ]),
      );
      expect(path.resolve(record.cwd)).toBe(path.resolve(providerDir));
    } finally {
      await provider.shutdown();
    }
  }, 20_000);
});
