import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EvaluateResult } from '../../src/types/index';

const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'dist/src/entrypoint.js');

describe('Grader error CLI smoke tests', () => {
  it.each(['eval --retry-errors', 'retry <id>'])(
    '%s retries cached grader errors without rerunning valid judgments',
    async (retryCommand) => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-grader-errors-'));
      const requests: string[] = [];
      let recovered = false;
      const server = http.createServer(async (request, response) => {
        for await (const _chunk of request) {
          // Consume the request before replying so keep-alive connections remain usable.
        }
        const label = String(request.headers['x-smoke-case']);
        requests.push(label);
        response.setHeader('Content-Type', 'application/json');
        if (!recovered && label === 'provider-error') {
          response.writeHead(400);
          response.end(JSON.stringify({ error: { message: 'Judge unavailable' } }));
          return;
        }
        const content =
          label === 'fail'
            ? 'N'
            : !recovered && label === 'malformed'
              ? 'unparseable verdict'
              : !recovered && label === 'empty'
                ? ''
                : 'Y';
        response.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content } }],
            usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
          }),
        );
      });

      const runCli = (args: string[]) =>
        new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
          execFile(
            process.execPath,
            [cliPath, ...args],
            {
              cwd: repoRoot,
              encoding: 'utf8',
              env: {
                ...process.env,
                IS_TESTING: '',
                NO_COLOR: '1',
                PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state'),
                PROMPTFOO_CACHE_PATH: path.join(tempDir, 'cache'),
                PROMPTFOO_CACHE_ENABLED: 'true',
                PROMPTFOO_DISABLE_TELEMETRY: 'true',
                PROMPTFOO_DISABLE_UPDATE: 'true',
                PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
                PROMPTFOO_DISABLE_SHARING: 'true',
              },
            },
            (error, stdout, stderr) => {
              if (error && typeof error.code !== 'number') {
                reject(error);
                return;
              }
              resolve({
                stdout,
                stderr,
                exitCode: typeof error?.code === 'number' ? error.code : 0,
              });
            },
          );
        });

      try {
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as { port: number };
        const configPath = path.join(tempDir, 'promptfooconfig.json');
        const outputPath = path.join(tempDir, 'output.json');
        const labels = ['pass', 'fail', 'malformed', 'empty', 'provider-error'];
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            prompts: ['Answer {{case}}'],
            providers: ['echo'],
            tests: labels.map((label) => ({
              vars: { case: label },
              assert: [{ type: 'model-graded-closedqa', value: 'The answer is correct' }],
              options: {
                provider: {
                  id: 'openai:chat:smoke-judge',
                  config: {
                    apiBaseUrl: `http://127.0.0.1:${port}/v1`,
                    apiKey: 'smoke-test-key',
                    headers: { 'x-smoke-case': label },
                    maxRetries: 0,
                  },
                },
              },
            })),
          }),
        );

        // Keep caching enabled: an invalid HTTP 200 verdict must not poison an explicit retry.
        const initial = await runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-share',
          '--no-progress-bar',
        ]);
        expect(initial.exitCode, initial.stdout + initial.stderr).toBe(100);
        const original = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        expect(original.results.stats).toMatchObject({ successes: 1, failures: 1, errors: 3 });
        expect(initial.stdout).toMatch(/3 errors/);
        expect(initial.stdout).toMatch(/1 failed/);
        const rows = original.results.results as EvaluateResult[];
        expect(rows).toHaveLength(5);
        for (const row of rows) {
          const label = String(row.vars.case);
          expect(row.response?.output).toBe(`Answer ${label}`);
          expect(row.failureReason).toBe(label === 'pass' ? 0 : label === 'fail' ? 1 : 2);
          expect(row.success).toBe(label === 'pass');
          expect(row.score).toBe(label === 'pass' ? 1 : 0);
          expect(row.gradingResult?.metadata?.graderError).toBe(
            label === 'pass' || label === 'fail' ? undefined : true,
          );
          if (label === 'malformed' || label === 'empty') {
            expect(row.error).toBeTruthy();
            expect(row.gradingResult?.tokensUsed?.total).toBe(11);
          }
        }
        expect(requests.sort()).toEqual([...labels].sort());

        recovered = true;
        if (retryCommand === 'retry <id>') {
          const retried = await runCli(['retry', original.evalId, '--no-share']);
          expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
        }
        const result = await runCli([
          'eval',
          retryCommand === 'eval --retry-errors' ? '--retry-errors' : '--resume',
          '--no-share',
          '--no-progress-bar',
        ]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(100);
        const retried = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        expect(retried.evalId).toBe(original.evalId);
        expect(retried.results.stats).toMatchObject({ successes: 4, failures: 1, errors: 0 });
        expect(retried.results.results).toHaveLength(5);
        expect(result.stdout).toMatch(/1 failed/);
        expect(result.stdout).toMatch(/0 errors/);
        for (const label of labels) {
          expect(requests.filter((request) => request === label)).toHaveLength(
            label === 'pass' || label === 'fail' ? 1 : 2,
          );
          const row = (retried.results.results as EvaluateResult[]).find(
            (candidate) => candidate.vars.case === label,
          )!;
          expect(row.failureReason).toBe(label === 'fail' ? 1 : 0);
          expect(row.success).toBe(label !== 'fail');
          expect(row.score).toBe(label === 'fail' ? 0 : 1);
          expect(row.gradingResult?.metadata?.graderError).toBeUndefined();
          const originalRow = rows.find((candidate) => candidate.vars.case === label)!;
          if (label === 'pass' || label === 'fail') {
            expect(row.id).toBe(originalRow.id);
            expect(row.response).toEqual(originalRow.response);
          } else {
            expect(row.id).not.toBe(originalRow.id);
          }
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );
});
