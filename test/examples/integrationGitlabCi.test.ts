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
  image: string;
  script: string[];
  variables: Record<string, string>;
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
      const child = spawn('sh', ['-ec', script], {
        cwd: tempDir,
        env: {
          ...process.env,
          ...job.variables,
          CI_API_V4_URL: 'http://127.0.0.1:1/api/v4',
          CI_DEPENDENCY_PROXY_PASSWORD: 'test-dependency-proxy-token',
          CI_DEPLOY_PASSWORD: 'test-long-lived-deploy-token',
          CI_JOB_NAME_SLUG: 'promptfoo-eval',
          CI_JOB_STATUS: 'success',
          CI_JOB_TOKEN: 'test-job-token',
          CI_MERGE_REQUEST_IID: '7',
          CI_PROJECT_ID: '42',
          CI_REGISTRY_PASSWORD: 'test-registry-token',
          CI_REPOSITORY_URL: 'https://gitlab-ci-token:test-job-token@gitlab.example/project',
          CI_SERVER_URL: 'http://127.0.0.1:1',
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          PROMPTFOO_GITLAB_TOKEN: 'test-project-token',
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
    expect(job.image).toBe(
      'node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd',
    );
    expect(job.allow_failure).toBe(false);
    expect(job.artifacts).toEqual({
      when: 'always',
      access: 'developer',
      expire_in: '1 week',
      paths: ['$PROMPTFOO_OUTPUT_DIR/results.json', '$PROMPTFOO_OUTPUT_DIR/results.junit.xml'],
      reports: { junit: '$PROMPTFOO_OUTPUT_DIR/results.junit.xml' },
    });
    expect(job.cache.key).toContain('$CI_JOB_NAME_SLUG');
    expect(job.cache.key).toContain('$CI_COMMIT_REF_SLUG');
  });

  it('keeps the documented remote template integrity hashes current', () => {
    const integrity = `sha256-${createHash('sha256').update(templateSource).digest('base64')}`;
    const exampleReadme = fs.readFileSync(path.join(exampleDir, 'README.md'), 'utf8');
    const integrationDocs = fs.readFileSync(
      path.join(rootDir, 'site/docs/integrations/gitlab-ci.md'),
      'utf8',
    );

    expect(exampleReadme).toContain(integrity);
    expect(integrationDocs).toContain(integrity);
  });

  it('installs a pinned version without passing GitLab tokens to npm', async () => {
    const result = await runScript(job.before_script[0]);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(tempDir, 'npm-token'), 'utf8').trim()).toBe('absent');
    expect(fs.readFileSync(path.join(tempDir, 'npm-args'), 'utf8')).toContain('promptfoo@0.121.19');
  });

  it.each([
    'latest',
    '^0.121.19',
    '0.121.19 --registry=https://example.invalid',
  ])('rejects the unpinned or unsafe npm version %s', async (version) => {
    const result = await runScript(job.before_script[0], { PROMPTFOO_VERSION: version });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact semantic version');
    expect(fs.existsSync(path.join(tempDir, 'npm-args'))).toBe(false);
  });

  it('explicitly disables sharing and removes GitLab tokens from the eval process', async () => {
    const result = await runScript(job.script[0]);
    const args = fs.readFileSync(path.join(tempDir, 'promptfoo-args'), 'utf8');

    expect(result.status).toBe(0);
    expect(args).toContain('--no-share');
    expect(args).not.toContain('\n--share\n');
    expect(fs.readFileSync(path.join(tempDir, 'promptfoo-token'), 'utf8').trim()).toBe('absent');
    expect(fs.existsSync(path.join(tempDir, '.promptfoo-results/results.junit.xml'))).toBe(true);
  });

  it('only enables sharing after explicit opt-in', async () => {
    const result = await runScript(job.script[0], { PROMPTFOO_SHARE: 'true' });
    const args = fs.readFileSync(path.join(tempDir, 'promptfoo-args'), 'utf8');

    expect(result.status).toBe(0);
    expect(args).toContain('\n--share\n');
    expect(args).not.toContain('--no-share');
  });

  it('rejects ambiguous sharing values before running the eval', async () => {
    const result = await runScript(job.script[0], { PROMPTFOO_SHARE: 'yes' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PROMPTFOO_SHARE must be true or false');
    expect(fs.existsSync(path.join(tempDir, 'promptfoo-args'))).toBe(false);
  });

  it('preserves failing eval exit codes while still posting a failure summary', async () => {
    const evaluation = await runScript(job.script[0], { PROMPTFOO_TEST_EXIT_CODE: '100' });
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
        const comment = await runScript(job.after_script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_JOB_STATUS: 'failed',
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
    await runScript(job.script[0], {
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
        const comment = await runScript(job.after_script[0], {
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

  it('does not update a marker planted by another merge request participant', async () => {
    await runScript(job.script[0]);

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
        const comment = await runScript(job.after_script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).toBe(0);
        expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST']);
      },
    );
  });

  it('ignores Node preload hooks while the merge request write token is available', async () => {
    await runScript(job.script[0]);
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
        const comment = await runScript(job.after_script[0], {
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
    await runScript(job.script[0]);

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
            const comment = await runScript(job.after_script[0], {
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
    await runScript(job.script[0], {
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
        const comment = await runScript(job.after_script[0], {
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
    await runScript(job.script[0]);

    await withGitLabServer(
      (_request, response) => {
        response.statusCode = 403;
        response.end('forbidden');
      },
      async (origin) => {
        const comment = await runScript(job.after_script[0], {
          CI_API_V4_URL: `${origin}/api/v4`,
          CI_SERVER_URL: origin,
        });

        expect(comment.status).not.toBe(0);
        expect(comment.stderr).toContain('HTTP 403');
        expect(comment.stdout).not.toContain('Posted');
      },
    );
  });

  it('refuses to send the merge request token to an unexpected GitLab API origin', async () => {
    await runScript(job.script[0]);
    const comment = await runScript(job.after_script[0], {
      CI_API_V4_URL: 'https://attacker.example/api/v4',
      CI_SERVER_URL: 'https://gitlab.example',
    });

    expect(comment.status).not.toBe(0);
    expect(comment.stderr).toContain('unexpected or insecure API origin');
  });

  it('skips merge request comments when no token was configured', async () => {
    const result = await runScript(job.after_script[0], { PROMPTFOO_GITLAB_TOKEN: '' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping optional Promptfoo merge request comment');
  });
});
