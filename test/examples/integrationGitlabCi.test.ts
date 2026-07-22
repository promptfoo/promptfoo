import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface GitLabJob {
  allow_failure: boolean;
  after_script: string[];
  artifacts: {
    access: string;
    expire_in: string;
    paths: string[];
    reports: { junit: string };
    when: string;
  };
  before_script: string[];
  cache: { key: string; paths: string[] };
  environment?: { action: string; name: string };
  image: { entrypoint: string[]; name: string };
  script: string[];
  variables: Record<string, string>;
  resource_group?: string;
  when?: string;
}

interface CapturedRequest {
  body: string;
  method: string | undefined;
  token: string | undefined;
  url: string | undefined;
}

const rootDir = path.join(__dirname, '../..');
const exampleDir = path.join(rootDir, 'examples/integration-gitlab-ci');
const templatePath = path.join(exampleDir, 'gitlab-ci.yml');
const templateSource = fs.readFileSync(templatePath, 'utf8');
const template = parse(templateSource) as Record<string, GitLabJob>;
const job = template['.promptfoo-eval'];
const commentJob = template['.promptfoo-comment'];

describe('GitLab CI integration example', () => {
  let tempDir: string;
  let binDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-gitlab-ci-'));
    binDir = path.join(tempDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(tempDir, 'promptfooconfig.yaml'), 'providers: [echo]\n');

    fs.writeFileSync(
      path.join(binDir, 'npm'),
      `#!/bin/sh
printf '%s\\n' "$@" > "$PROMPTFOO_TEST_CAPTURE_DIR/npm-args"
if [ -n "\${PROMPTFOO_GITLAB_TOKEN:-}" ] || [ -n "\${CI_DEPENDENCY_PROXY_PASSWORD:-}" ] || [ -n "\${CI_DEPLOY_PASSWORD:-}" ] || [ -n "\${CI_JOB_TOKEN:-}" ] || [ -n "\${CI_REGISTRY_PASSWORD:-}" ] || [ -n "\${CI_REPOSITORY_URL:-}" ]; then
  printf 'present\\n' > "$PROMPTFOO_TEST_CAPTURE_DIR/npm-token"
else
  printf 'absent\\n' > "$PROMPTFOO_TEST_CAPTURE_DIR/npm-token"
fi
`,
      { mode: 0o755 },
    );

    fs.writeFileSync(
      path.join(binDir, 'promptfoo'),
      `#!/bin/sh
if [ "\${1:-}" = '--version' ]; then
  if [ -n "\${OPENAI_API_KEY:-}" ] || [ -n "\${PROMPTFOO_GITLAB_TOKEN:-}" ]; then
    printf 'Provider or GitLab credentials reached version validation\\n' >&2
    exit 70
  fi
  printf '0.121.19\\n'
  exit 0
fi
printf '%s\\n' "$@" > "$PROMPTFOO_TEST_CAPTURE_DIR/promptfoo-args"
if [ -n "\${PROMPTFOO_GITLAB_TOKEN:-}" ] || [ -n "\${CI_DEPENDENCY_PROXY_PASSWORD:-}" ] || [ -n "\${CI_DEPLOY_PASSWORD:-}" ] || [ -n "\${CI_JOB_TOKEN:-}" ] || [ -n "\${CI_REGISTRY_PASSWORD:-}" ] || [ -n "\${CI_REPOSITORY_URL:-}" ]; then
  printf 'present\\n' > "$PROMPTFOO_TEST_CAPTURE_DIR/promptfoo-token"
else
  printf 'absent\\n' > "$PROMPTFOO_TEST_CAPTURE_DIR/promptfoo-token"
fi
node -e '
  const fs = require("node:fs");
  const directory = process.env.PROMPTFOO_OUTPUT_DIR;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    directory + "/results.json",
    JSON.stringify({
      results: { stats: { successes: 2, failures: 1, errors: 0 } },
      shareableUrl: process.env.PROMPTFOO_TEST_SHARE_URL || null,
    }),
  );
fs.writeFileSync(directory + "/results.junit.xml", "<testsuites />");
'
if [ "\${PROMPTFOO_TEST_FAIL_ASSERTION:-false}" = true ]; then
  exit "\${PROMPTFOO_FAILED_TEST_EXIT_CODE:-1}"
fi
exit "\${PROMPTFOO_TEST_EXIT_CODE:-0}"
`,
      { mode: 0o755 },
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  function runScript(
    script: string,
    overrides: NodeJS.ProcessEnv = {},
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const isCommentJob = script === commentJob.script[0];
      const child = spawn('sh', ['-ec', script], {
        cwd: tempDir,
        env: {
          ...process.env,
          ...job.variables,
          ...(isCommentJob ? commentJob.variables : {}),
          CI_API_V4_URL: 'http://127.0.0.1:1/api/v4',
          CI_DEPENDENCY_PROXY_PASSWORD: 'test-dependency-proxy-token',
          CI_DEPLOY_PASSWORD: 'test-long-lived-deploy-token',
          CI_JOB_NAME_SLUG: 'promptfoo-eval',
          CI_JOB_STATUS: 'success',
          CI_JOB_TOKEN: 'test-job-token',
          CI_MERGE_REQUEST_IID: '7',
          CI_PIPELINE_ID: '100',
          CI_PROJECT_ID: '42',
          CI_REGISTRY_PASSWORD: 'test-registry-token',
          CI_REPOSITORY_URL: 'https://gitlab-ci-token:test-job-token@gitlab.example/project',
          CI_SERVER_URL: 'http://127.0.0.1:1',
          OPENAI_API_KEY: 'test-provider-secret',
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          PROMPTFOO_GITLAB_TOKEN: isCommentJob ? 'test-project-token' : '',
          PROMPTFOO_TEST_CAPTURE_DIR: tempDir,
          ...overrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (status) => resolve({ status, stdout, stderr }));
    });
  }

  async function runEvaluation(overrides: NodeJS.ProcessEnv = {}) {
    const evaluation = await runScript(job.script[0], overrides);
    await runScript(job.after_script[0], {
      CI_JOB_STATUS: evaluation.status === 0 ? 'success' : 'failed',
      ...overrides,
    });
    return evaluation;
  }

  async function withGitLabServer(
    responder: (
      request: IncomingMessage,
      response: ServerResponse,
      captured: CapturedRequest[],
      body: string,
    ) => void,
    callback: (origin: string, captured: CapturedRequest[]) => Promise<void>,
  ): Promise<void> {
    const captured: CapturedRequest[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const token = request.headers['private-token'];
        captured.push({
          body,
          method: request.method,
          token: Array.isArray(token) ? token[0] : token,
          url: request.url,
        });
        responder(request, response, captured, body);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve the local GitLab API server address');
    }

    try {
      await callback(`http://127.0.0.1:${address.port}`, captured);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  it('defines blocking, private, expiring JUnit artifacts and an isolated branch cache', () => {
    expect(job.image).toEqual({
      name: 'ghcr.io/promptfoo/promptfoo:0.121.19@sha256:50d3a796710e4db7a5ede90bf27dc28146ef022a7ebb83914c5105608396fd96',
      entrypoint: [''],
    });
    expect(job.allow_failure).toBe(false);
    expect(job.artifacts).toEqual({
      when: 'always',
      access: 'developer',
      expire_in: '1 week',
      paths: [
        '$PROMPTFOO_OUTPUT_DIR/results.json',
        '$PROMPTFOO_OUTPUT_DIR/results.junit.xml',
        '$PROMPTFOO_OUTPUT_DIR/job-status.txt',
      ],
      reports: { junit: '$PROMPTFOO_OUTPUT_DIR/results.junit.xml' },
    });
    expect(job.cache.key).toContain('$CI_JOB_NAME_SLUG');
    expect(job.cache.key).toContain('$CI_PROJECT_ID');
    expect(job.cache.key).toContain('$CI_COMMIT_SHA');
    expect(job.cache.paths).toEqual(['$PROMPTFOO_CACHE_PATH/']);
    expect(commentJob.image).toEqual(job.image);
    expect(commentJob.environment).toEqual({ name: 'promptfoo-review', action: 'verify' });
    expect(commentJob.variables.GIT_STRATEGY).toBe('none');
    expect(commentJob.when).toBe('always');
    expect(commentJob.resource_group).toContain('$CI_MERGE_REQUEST_IID');
    expect(job.script[0]).toContain('exec env \\');
    expect(commentJob.script[0]).toContain('NODE_USE_ENV_PROXY=1');
  });

  it('keeps the documented remote template integrity hashes current', () => {
    const publishedSource = templateSource.replace(/\r\n/g, '\n');
    const integrity = `sha256-${createHash('sha256').update(publishedSource).digest('base64')}`;
    const exampleReadme = fs.readFileSync(path.join(exampleDir, 'README.md'), 'utf8');
    const integrationDocs = fs.readFileSync(
      path.join(rootDir, 'site/docs/integrations/gitlab-ci.md'),
      'utf8',
    );
    const overviewDocs = fs.readFileSync(
      path.join(rootDir, 'site/docs/integrations/ci-cd.md'),
      'utf8',
    );

    expect(exampleReadme).toContain(integrity);
    expect(integrationDocs).toContain(integrity);
    expect(overviewDocs).toContain(integrity);
  });

  it('uses the pinned prebuilt release without exposing provider secrets or installing dependencies', async () => {
    const result = await runScript(job.before_script[0]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'npm-args'))).toBe(false);
  });

  it.each([
    'latest',
    '^0.121.19',
    '01.121.19',
    '0.121.19 --registry=https://example.invalid',
  ])('rejects the unpinned or unsafe npm version %s', async (version) => {
    const result = await runScript(job.before_script[0], { PROMPTFOO_VERSION: version });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact semantic version');
    expect(fs.existsSync(path.join(tempDir, 'npm-args'))).toBe(false);
  });

  it('rejects a valid version that does not match the pinned container release', async () => {
    const result = await runScript(job.before_script[0], { PROMPTFOO_VERSION: '0.121.20' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('expected 0.121.20');
  });

  it('never treats an untrusted version as a Node preload option', async () => {
    const preloadPath = path.join(tempDir, 'version-preload.cjs');
    const markerPath = path.join(tempDir, 'version-preload-ran');
    fs.writeFileSync(
      preloadPath,
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'executed')`,
    );

    const result = await runScript(job.before_script[0], {
      PROMPTFOO_VERSION: `--require=${preloadPath}`,
    });

    expect(result.status).not.toBe(0);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('fails closed when a merge request write token is exposed to the eval job', async () => {
    const result = await runScript(job.before_script[0], {
      PROMPTFOO_GITLAB_TOKEN: 'incorrectly-unscoped-token',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('promptfoo-review environment');
  });

  it('explicitly disables sharing and removes GitLab tokens from the eval process', async () => {
    const result = await runEvaluation();
    const args = fs.readFileSync(path.join(tempDir, 'promptfoo-args'), 'utf8');

    expect(result.status).toBe(0);
    expect(args).toContain('--no-share');
    expect(args).not.toContain('\n--share\n');
    expect(fs.readFileSync(path.join(tempDir, 'promptfoo-token'), 'utf8').trim()).toBe('absent');
    expect(fs.existsSync(path.join(tempDir, '.promptfoo-results/results.junit.xml'))).toBe(true);
  });

  it('removes Node preload hooks before invoking executable eval code', async () => {
    const preloadPath = path.join(tempDir, 'eval-preload.cjs');
    const markerPath = path.join(tempDir, 'eval-preload-ran');
    fs.writeFileSync(
      preloadPath,
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, process.env.OPENAI_API_KEY || '')`,
    );

    const evaluation = await runEvaluation({ NODE_OPTIONS: `--require=${preloadPath}` });

    expect(evaluation.status).toBe(0);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('removes root and nested checkout metadata before executable providers can read it', async () => {
    const rootGit = path.join(tempDir, '.git');
    const nestedGit = path.join(tempDir, 'packages', 'nested', '.git');
    fs.mkdirSync(rootGit);
    fs.mkdirSync(path.dirname(nestedGit), { recursive: true });
    fs.writeFileSync(path.join(rootGit, 'config'), 'https://gitlab-ci-token:secret@example.test');
    fs.writeFileSync(nestedGit, 'gitdir: /tmp/token-bearing-submodule');

    const evaluation = await runEvaluation();

    expect(evaluation.status).toBe(0);
    expect(fs.existsSync(rootGit)).toBe(false);
    expect(fs.existsSync(nestedGit)).toBe(false);
  });

  it('forces a failing assertion to remain blocking despite a zero exit-code override', async () => {
    const evaluation = await runEvaluation({
      PROMPTFOO_FAILED_TEST_EXIT_CODE: '0',
      PROMPTFOO_TEST_FAIL_ASSERTION: 'true',
    });

    expect(evaluation.status).toBe(1);
    expect(fs.readFileSync(path.join(tempDir, '.promptfoo-results/job-status.txt'), 'utf8')).toBe(
      'failed\n',
    );
  });

  it('only enables sharing after explicit opt-in', async () => {
    const result = await runEvaluation({ PROMPTFOO_SHARE: 'true' });
    const args = fs.readFileSync(path.join(tempDir, 'promptfoo-args'), 'utf8');

    expect(result.status).toBe(0);
    expect(args).toContain('\n--share\n');
    expect(args).not.toContain('--no-share');
  });

  it('rejects ambiguous sharing values before running the eval', async () => {
    const result = await runEvaluation({ PROMPTFOO_SHARE: 'yes' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PROMPTFOO_SHARE must be true or false');
    expect(fs.existsSync(path.join(tempDir, 'promptfoo-args'))).toBe(false);
  });

  it.each([
    '-1',
    '101',
    'NaN',
    'Infinity',
    '0x10',
    '1e2',
    ' 10 ',
    '',
  ])('rejects unsafe pass-rate threshold %s', async (value) => {
    const result = await runEvaluation({ PROMPTFOO_PASS_RATE_THRESHOLD: value });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('finite decimal percentage from 0 through 100');
    expect(fs.existsSync(path.join(tempDir, 'promptfoo-args'))).toBe(false);
  });

  it('never treats an untrusted pass-rate threshold as a Node preload option', async () => {
    const preloadPath = path.join(tempDir, 'threshold-preload.cjs');
    const markerPath = path.join(tempDir, 'threshold-preload-ran');
    fs.writeFileSync(
      preloadPath,
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'executed')`,
    );

    const result = await runEvaluation({
      PROMPTFOO_PASS_RATE_THRESHOLD: `--require=${preloadPath}`,
    });

    expect(result.status).not.toBe(0);
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('preserves failing eval exit codes while still posting a failure summary', async () => {
    const evaluation = await runEvaluation({ PROMPTFOO_TEST_EXIT_CODE: '100' });
    expect(evaluation.status).toBe(100);

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST']);
        expect(requests[2].token).toBe('test-project-token');
        expect(JSON.parse(requests[2].body).body).toContain('Promptfoo eval: Failed');
        expect(JSON.parse(requests[2].body).body).toContain('2/3 tests passed');
      },
    );
  });

  it('updates an existing note and uses the real share URL instead of a hard-coded host', async () => {
    await runEvaluation({
      PROMPTFOO_SHARE: 'true',
      PROMPTFOO_TEST_SHARE_URL: 'https://custom.promptfoo.example/eval/eval-123',
    });

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? JSON.stringify([
                  {
                    author: { id: 123 },
                    body: '<!-- promptfoo-eval:promptfoo-eval --> old',
                    id: 9,
                  },
                ])
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          PROMPTFOO_SHARE: 'true',
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'PUT']);
        expect(requests[2].url).toContain('/notes/9');
        expect(JSON.parse(requests[2].body).body).toContain(
          'https://custom.promptfoo.example/eval/eval-123',
        );
      },
    );
  });

  it('escapes valid share URLs before embedding them in Markdown comments', async () => {
    await runEvaluation({
      PROMPTFOO_SHARE: 'true',
      PROMPTFOO_TEST_SHARE_URL:
        'https://share.example/)@reviewer[trusted-results](https://attacker.example)',
    });

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          PROMPTFOO_SHARE: 'true',
        });

        expect(comment.status).toBe(0);
        const body = JSON.parse(requests[2].body).body;
        expect(body).toContain('%29@reviewer%5Btrusted-results%5D%28');
        expect(body).not.toContain(')@reviewer[trusted-results](');
      },
    );
  });

  it('supports a custom artifact directory when comment settings match the eval job', async () => {
    const outputDirectory = '.promptfoo-results/custom';
    await runEvaluation({ PROMPTFOO_OUTPUT_DIR: outputDirectory });

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          PROMPTFOO_OUTPUT_DIR: outputDirectory,
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST']);
      },
    );
  });

  it('does not update a marker planted by another merge request participant', async () => {
    await runEvaluation();

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? JSON.stringify([
                  {
                    author: { id: 999 },
                    body: '<!-- promptfoo-eval:promptfoo-eval --> spoofed',
                    id: 9,
                  },
                ])
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST']);
      },
    );
  });

  it('encodes custom job names before embedding them in comment markers', async () => {
    await runEvaluation();

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          PROMPTFOO_EVAL_JOB_NAME: 'trusted -->\n@reviewer',
        });

        expect(comment.status).toBe(0);
        const body = JSON.parse(requests[2].body).body;
        expect(body).toContain('<!-- promptfoo-eval:trusted%20--%3E%0A%40reviewer -->');
        expect(body).not.toContain('-->\n@reviewer');
      },
    );
  });

  it('follows all merge request note pages before deciding whether to create a summary', async () => {
    await runEvaluation();

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/api/v4/user') {
          response.end(JSON.stringify({ id: 123 }));
          return;
        }

        if (
          request.method === 'GET' &&
          new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('page') === '1'
        ) {
          response.setHeader('x-next-page', '2');
          response.end('[]');
          return;
        }

        if (request.method === 'GET') {
          response.end(
            JSON.stringify([
              { author: { id: 123 }, body: '<!-- promptfoo-eval:promptfoo-eval --> old', id: 12 },
            ]),
          );
          return;
        }

        response.end('{}');
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'GET', 'PUT']);
        expect(requests[3].url).toContain('/notes/12');
      },
    );
  });

  it('does not let an older pipeline overwrite a newer merge request summary', async () => {
    await runEvaluation();

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : JSON.stringify([
                {
                  author: { id: 123 },
                  body: '<!-- promptfoo-eval:promptfoo-eval -->\n<!-- promptfoo-pipeline:101 -->',
                  id: 9,
                },
              ]),
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_PIPELINE_ID: '100',
          CI_SERVER_URL: origin,
        });

        expect(comment.status).toBe(0);
        expect(comment.stdout).toContain('Skipping stale');
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
      },
    );
  });

  it('ignores Node preload hooks while the merge request write token is available', async () => {
    await runEvaluation();
    const preloadPath = path.join(tempDir, 'preload.js');
    const leakedTokenPath = path.join(tempDir, 'leaked-token');
    fs.writeFileSync(
      preloadPath,
      `require('node:fs').writeFileSync(${JSON.stringify(leakedTokenPath)}, process.env.PROMPTFOO_GITLAB_TOKEN || '')`,
    );

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          NODE_OPTIONS: `--require ${preloadPath}`,
        });

        expect(comment.status).toBe(0);
        expect(fs.existsSync(leakedTokenPath)).toBe(false);
      },
    );
  });

  it('refuses redirects before a GitLab write token can reach another origin', async () => {
    await runEvaluation();

    await withGitLabServer(
      (_request, response) => {
        response.statusCode = 200;
        response.end('{}');
      },
      async (attackerOrigin, attackerRequests) => {
        await withGitLabServer(
          (_request, response) => {
            response.statusCode = 302;
            response.setHeader('Location', `${attackerOrigin}/stolen-token`);
            response.end();
          },
          async (gitlabOrigin) => {
            const comment = await runScript(commentJob.script[0], {
              CI_API_V4_URL: `${gitlabOrigin}/api/v4`,
              CI_SERVER_URL: gitlabOrigin,
            });

            expect(comment.status).not.toBe(0);
            expect(attackerRequests).toHaveLength(0);
          },
        );
      },
    );
  });

  it('omits malformed share URLs from merge request comments', async () => {
    await runEvaluation({
      PROMPTFOO_SHARE: 'true',
      PROMPTFOO_TEST_SHARE_URL: 'not-a-url',
    });

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : request.method === 'GET'
              ? '[]'
              : '{}',
        );
      },
      async (origin, requests) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
          PROMPTFOO_SHARE: 'true',
        });

        expect(comment.status).toBe(0);
        expect(comment.stderr).toContain('Skipping invalid Promptfoo share URL');
        expect(JSON.parse(requests[2].body).body).not.toContain('not-a-url');
      },
    );
  });

  it('reports GitLab API errors instead of claiming the merge request comment succeeded', async () => {
    await runEvaluation();

    await withGitLabServer(
      (_request, response) => {
        response.statusCode = 403;
        response.end('forbidden');
      },
      async (origin) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).not.toBe(0);
        expect(comment.stderr).toContain('HTTP 403');
        expect(comment.stdout).not.toContain('Posted');
      },
    );
  });

  it('reports invalid GitLab merge request note responses clearly', async () => {
    await runEvaluation();

    await withGitLabServer(
      (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          request.url === '/api/v4/user'
            ? JSON.stringify({ id: 123 })
            : JSON.stringify({ message: 'unexpected note payload' }),
        );
      },
      async (origin) => {
        const comment = await runScript(commentJob.script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).not.toBe(0);
        expect(comment.stderr).toContain('note lookup returned an invalid response');
        expect(comment.stderr).not.toContain('notes.find is not a function');
      },
    );
  });

  it('refuses to send the merge request token to an unexpected GitLab API origin', async () => {
    await runEvaluation();
    const comment = await runScript(commentJob.script[0], {
      CI_API_V4_URL: 'https://attacker.example/api/v4',
      CI_SERVER_URL: 'https://gitlab.example',
    });

    expect(comment.status).not.toBe(0);
    expect(comment.stderr).toContain('unexpected or insecure API origin');
  });

  it('skips merge request comments when no token was configured', async () => {
    const result = await runScript(commentJob.script[0], { PROMPTFOO_GITLAB_TOKEN: '' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping optional Promptfoo merge request comment');
  });

  it('rejects an empty output directory before looking up merge request results', async () => {
    const result = await runScript(commentJob.script[0], { PROMPTFOO_OUTPUT_DIR: '' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PROMPTFOO_OUTPUT_DIR must not be empty');
  });

  it('rejects invalid comment sharing settings before looking up merge request results', async () => {
    const result = await runScript(commentJob.script[0], { PROMPTFOO_SHARE: 'yes' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PROMPTFOO_SHARE must be true or false');
  });

  it('reports a missing eval status artifact before attempting to post a comment', async () => {
    await runEvaluation();
    fs.rmSync(path.join(tempDir, '.promptfoo-results/job-status.txt'));

    const result = await runScript(commentJob.script[0]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('eval job-status artifact is missing');
  });

  it('runs the example when either bundled GitLab template changes', () => {
    const pipeline = parse(fs.readFileSync(path.join(exampleDir, '.gitlab-ci.yml'), 'utf8')) as {
      'promptfoo-eval': { rules: Array<{ changes?: string[] }> };
    };

    expect(pipeline['promptfoo-eval'].rules[0].changes).toEqual(
      expect.arrayContaining(['.gitlab-ci.yml', 'gitlab-ci.yml']),
    );
  });

  it('documents optional comment dependencies and matching job-scoped settings', () => {
    for (const file of [
      path.join(exampleDir, 'README.md'),
      path.join(rootDir, 'site/docs/integrations/gitlab-ci.md'),
    ]) {
      const documentation = fs.readFileSync(file, 'utf8');
      expect(documentation).toContain('optional: true');
      expect(documentation).toContain('GitLab `needs` does not inherit job variables');
    }
  });
});
