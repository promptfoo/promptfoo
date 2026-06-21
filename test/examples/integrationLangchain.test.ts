import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EXAMPLE_PATH = path.join(
  process.cwd(),
  'examples',
  'integration-langchain',
  'langchain_example.py',
);

function findPythonPath(): string | undefined {
  const probe = 'import sys; print(sys.executable)';
  const candidates: Array<[string, string[]]> = [];

  if (process.env.PROMPTFOO_PYTHON) {
    candidates.push([process.env.PROMPTFOO_PYTHON, ['-c', probe]]);
  }
  if (process.platform === 'win32') {
    candidates.push(['py', ['-3', '-c', probe]]);
  }
  candidates.push(['python3', ['-c', probe]], ['python', ['-c', probe]]);

  for (const [command, args] of candidates) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  return undefined;
}

const PYTHON_PATH = findPythonPath();

// Skip these subprocess cases when no Python interpreter is available (CI always has one).
const itPy = PYTHON_PATH ? it : it.skip;

describe('integration-langchain example', () => {
  let stubRoot: string;

  beforeAll(() => {
    const scratchRoot = path.join(process.cwd(), 'scratch', 'langchain-example-tests');
    fs.mkdirSync(scratchRoot, { recursive: true });
    stubRoot = fs.mkdtempSync(path.join(scratchRoot, 'case-'));

    const langchainCore = path.join(stubRoot, 'langchain_core');
    fs.mkdirSync(langchainCore, { recursive: true });
    fs.writeFileSync(path.join(langchainCore, '__init__.py'), '');
    fs.writeFileSync(
      path.join(langchainCore, 'output_parsers.py'),
      'class StrOutputParser:\n    pass\n',
    );
    fs.writeFileSync(
      path.join(langchainCore, 'prompts.py'),
      `
import os

class _FakeChain:
    def __or__(self, _other):
        return self

    def invoke(self, _payload):
        if os.getenv("PROMPTFOO_LANGCHAIN_STUB_ERROR"):
            raise RuntimeError("stubbed invocation failure")
        return "stubbed answer"

class PromptTemplate:
    @staticmethod
    def from_template(_template):
        return _FakeChain()
`,
    );
    fs.writeFileSync(
      path.join(stubRoot, 'langchain_openai.py'),
      'class OpenAI:\n    def __init__(self, **_kwargs):\n        pass\n',
    );
  });

  afterAll(() => {
    fs.rmSync(stubRoot, { force: true, recursive: true });
  });

  function runExample(
    args: string[],
    envOverrides: NodeJS.ProcessEnv = {},
  ): { status: number | null; stdout: string; stderr: string } {
    if (!PYTHON_PATH) {
      throw new Error('Python is not available');
    }

    const childEnv = { ...process.env };
    delete childEnv.OPENAI_API_KEY;
    delete childEnv.PROMPTFOO_LANGCHAIN_STUB_ERROR;
    childEnv.PYTHONPATH = [stubRoot, childEnv.PYTHONPATH].filter(Boolean).join(path.delimiter);

    const result = spawnSync(PYTHON_PATH, [EXAMPLE_PATH, ...args], {
      encoding: 'utf8',
      env: { ...childEnv, ...envOverrides },
      timeout: 10_000,
    });

    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  itPy('prints usage and exits non-zero when the question is missing', () => {
    const result = runExample([]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('<question>');
  });

  itPy('reports a missing API key without importing LangChain', () => {
    const result = runExample(['What is 2 + 2?'], { PYTHONPATH: '' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('OPENAI_API_KEY environment variable is required.');
  });

  itPy('prints the LangChain result to stdout', () => {
    const result = runExample(['What is 2 + 2?'], { OPENAI_API_KEY: 'test-key' });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('stubbed answer');
    expect(result.stderr).toBe('');
  });

  itPy('reports invocation failures on stderr and exits non-zero', () => {
    const result = runExample(['What is 2 + 2?'], {
      OPENAI_API_KEY: 'test-key',
      PROMPTFOO_LANGCHAIN_STUB_ERROR: 'true',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('Error invoking math chain: stubbed invocation failure');
  });
});
