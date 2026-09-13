import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import * as yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const skillsRoot = path.join(repoRoot, 'plugins/promptfoo/skills');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-skill-examples-'));

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

function reference(skill: string, file: string) {
  return fs.readFileSync(path.join(skillsRoot, skill, 'references', file), 'utf8');
}

function httpJsonTransforms(markdown: string) {
  type ExampleProvider = string | { id: string; config?: { transformResponse?: string } };
  const transforms: string[] = [];
  for (const match of markdown.matchAll(/```yaml[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g)) {
    if (!/^(providers|targets):/m.test(match[1])) {
      continue;
    }
    const config = yaml.load(match[1]) as {
      providers?: ExampleProvider[];
      targets?: ExampleProvider[];
    };
    for (const provider of [...(config.providers ?? []), ...(config.targets ?? [])]) {
      if (typeof provider === 'string' || provider.id !== 'https') {
        continue;
      }
      const transform = provider.config?.transformResponse;
      if (transform && !transform.startsWith('text')) {
        transforms.push(transform);
      }
    }
  }
  return transforms;
}

function runCli(args: string[]) {
  return promisify(execFile)(
    process.execPath,
    [path.join(repoRoot, 'dist/src/entrypoint.js'), ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state'),
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_UPDATE: 'true',
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_FAILED_TEST_EXIT_CODE: '0',
      },
    },
  );
}

describe('published agent skill examples', () => {
  it('rejects incorrect candidate output even when the rubric contains the expected words', async () => {
    const modulePath = path.join(
      repoRoot,
      'test/fixtures/agent-skills/evals-json-rubric/grader.mjs',
    );
    const { default: Grader } = await import(pathToFileURL(modulePath).href);
    const grader = new Grader();
    for (const [candidate, expected] of [
      [{ invoice_id: 'inv-123', status: 'approved', risk: 'low' }, true],
      [{ invoice_id: 'inv-999', status: 'denied', risk: 'high' }, false],
      [{ message: 'No answer' }, false],
      [null, false],
      [[], false],
      [42, false],
      ['plain text', false],
    ] as const) {
      const response = await grader.callApi(
        JSON.stringify({
          candidate: JSON.stringify(candidate),
          rubric: 'The answer must contain inv-123, approved, and low risk.',
        }),
      );
      expect(JSON.parse(response.output).pass).toBe(expected);
    }
    const malformed = await grader.callApi(JSON.stringify({ candidate: '{invalid JSON' }));
    expect(JSON.parse(malformed.output)).toMatchObject({ pass: false, score: 0 });
  });

  it('runs the documented calibration suite with one pass and two failures', async () => {
    const markdown = reference('promptfoo-evals', 'eval-patterns.md');
    const config = markdown
      .split('## Calibrate Assertions')[1]
      .match(/```yaml\r?\n([\s\S]*?)\r?\n```/)?.[1];
    expect(config).toBeDefined();
    const configPath = path.join(tempDir, 'calibration.yaml');
    const outputPath = path.join(tempDir, 'calibration.json');
    fs.writeFileSync(configPath, config!);
    await runCli([
      'eval',
      '-c',
      configPath,
      '-o',
      outputPath,
      '--no-cache',
      '--no-share',
      '--no-progress-bar',
    ]);
    const results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(results.results.stats).toMatchObject({ successes: 1, failures: 2, errors: 0 });
    expect(results.shareableUrl).toBeNull();
  });

  it('runs the rubric fixture through the actual candidate-output contract', async () => {
    const config = path.join(
      repoRoot,
      'test/fixtures/agent-skills/evals-json-rubric/promptfooconfig.yaml',
    );
    const artifact = path.join(tempDir, 'rubric.json');
    await runCli([
      'eval',
      '-c',
      config,
      '-o',
      artifact,
      '--no-cache',
      '--no-share',
      '--no-progress-bar',
    ]);
    const results = JSON.parse(fs.readFileSync(artifact, 'utf8'));
    expect(results.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
  });

  it('validates every public config and supplies distinct expected statuses', async () => {
    const markdown = fs.readFileSync(
      path.join(repoRoot, 'site/docs/integrations/agent-skill.md'),
      'utf8',
    );
    const exampleDir = path.join(tempDir, 'public-example');
    const written = new Set<string>();
    for (const match of markdown.matchAll(
      /```(?:yaml|json) title="([^"]+)"\r?\n([\s\S]*?)\r?\n```/g,
    )) {
      expect(written.has(match[1]), `duplicate example filename: ${match[1]}`).toBe(false);
      written.add(match[1]);
      const filePath = path.join(exampleDir, match[1]);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, match[2]);
    }
    expect(written.has('prompts/chat.json')).toBe(true);
    const configs = [...written].filter((file) => path.basename(file) === 'promptfooconfig.yaml');
    expect(configs).toHaveLength(2);
    for (const config of configs) {
      await runCli(['validate', 'config', '-c', path.join(exampleDir, config)]);
    }
    const tests = yaml.load(
      fs.readFileSync(path.join(exampleDir, 'tests/happy-path.yaml'), 'utf8'),
    ) as {
      vars: { expected_status: string; order_record: string };
    }[];
    expect(new Set(tests.map((test) => test.vars.expected_status)).size).toBe(3);
    for (const test of tests) {
      const record = JSON.parse(test.vars.order_record);
      expect(record?.status ?? 'not_found').toBe(test.vars.expected_status);
    }
  });

  it.each(['eval', 'redteam'] as const)(
    'rejects missing and wrong-type answers with every documented HTTP JSON transform in %s',
    async (mode) => {
      const documents = [
        reference('promptfoo-provider-setup', 'provider-patterns.md'),
        reference('promptfoo-redteam-setup', 'redteam-setup-patterns.md'),
        fs.readFileSync(path.join(repoRoot, 'site/docs/integrations/agent-skill.md'), 'utf8'),
        fs.readFileSync(
          path.join(repoRoot, '.claude/skills/promptfoo-evals/references/cheatsheet.md'),
          'utf8',
        ),
      ];
      const transforms = documents.flatMap((markdown) => {
        const extracted = httpJsonTransforms(markdown);
        expect(extracted.length).toBeGreaterThan(0);
        return extracted;
      });
      const server = http.createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
        }
        const message = JSON.parse(body).message;
        const value = message === 'good' ? 'PONG' : 42;
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify(
            message === 'missing'
              ? {}
              : { output: value, answer: value, choices: [{ message: { content: value } }] },
          ),
        );
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address() as { port: number };
        const config = {
          prompts: ['{{message}}'],
          [mode === 'redteam' ? 'targets' : 'providers']: transforms.map(
            (transformResponse, index) => ({
              id: 'https',
              label: `documented-response-${index}`,
              config: {
                url: `http://127.0.0.1:${address.port}`,
                method: 'POST',
                stateful: false,
                maxRetries: 0,
                body: { message: '{{message}}' },
                transformResponse,
              },
            }),
          ),
          ...(mode === 'redteam'
            ? { redteam: { purpose: 'Return PONG for valid requests.', plugins: ['policy'] } }
            : {}),
          tests: ['good', 'missing', 'wrong-type'].map((message) => ({
            vars: { message },
            assert: [{ type: 'equals', value: 'PONG' }],
          })),
        };
        const configPath = path.join(tempDir, `http-answer-${mode}.yaml`);
        const outputPath = path.join(tempDir, `http-answer-${mode}.json`);
        fs.writeFileSync(configPath, yaml.dump(config));
        await runCli([
          ...(mode === 'redteam' ? ['redteam', 'eval'] : ['eval']),
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
          '--no-share',
          '--no-progress-bar',
        ]);
        const results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        expect(results.results.stats).toMatchObject({
          successes: transforms.length,
          failures: 0,
          errors: transforms.length * 2,
        });
        for (const row of results.results.results) {
          if (row.error) {
            expect(row.error).toContain('Expected string');
          }
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it('runs a generated OpenAPI smoke assertion against a transformed text response', async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ answer: 'ready' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const specPath = path.join(tempDir, 'response-type.yaml');
      fs.writeFileSync(
        specPath,
        `openapi: 3.1.0
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        '200':
          description: Health response
          content:
            application/json:
              schema:
                type: object
                properties:
                  answer:
                    type: string
`,
      );
      const generated = yaml.load(
        execFileSync(
          process.execPath,
          [
            path.join(
              skillsRoot,
              'promptfoo-provider-setup/scripts/openapi-operation-to-config.mjs',
            ),
            '--spec',
            specPath,
            '--operation-id',
            'getHealth',
            '--base-url-env',
            'HEALTH_URL',
          ],
          { encoding: 'utf8' },
        ),
      ) as { providers: { config: { url: string } }[] };
      generated.providers[0].config.url = `http://127.0.0.1:${address.port}/health`;
      const configPath = path.join(tempDir, 'response-text.yaml');
      const outputPath = path.join(tempDir, 'response-text.json');
      fs.writeFileSync(configPath, yaml.dump(generated));
      await runCli([
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--no-share',
        '--no-progress-bar',
      ]);
      const results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(results.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
      expect(results.results.results[0].response.output).toBe('ready');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each(['promptfoo-provider-setup', 'promptfoo-redteam-setup'])(
    'runs the %s converter from an isolated installed skills tree',
    (skill) => {
      const installed = path.join(tempDir, 'installed', skill);
      fs.cpSync(skillsRoot, installed, { recursive: true });
      const script =
        skill === 'promptfoo-provider-setup'
          ? 'openapi-operation-to-config.mjs'
          : 'openapi-operation-to-redteam-config.mjs';
      const specPath = path.join(
        repoRoot,
        'test/fixtures/agent-skills/provider-setup-openapi/openapi.yaml',
      );
      const output = execFileSync(
        process.execPath,
        [
          path.join(installed, skill, 'scripts', script),
          '--spec',
          specPath,
          '--operation-id',
          'chatWithInvoice',
          '--base-url-env',
          'CHAT_URL',
        ],
        { cwd: tempDir, encoding: 'utf8' },
      );
      const config = yaml.load(output) as {
        providers?: { config: { url: string } }[];
        targets?: { config: { url: string } }[];
      };
      expect((config.providers ?? config.targets)?.[0].config.url).toContain('{{env.CHAT_URL}}');
    },
  );

  it.each([
    ['promptfoo-evals', 'eval-patterns.md'],
    ['promptfoo-redteam-run', 'redteam-run-patterns.md'],
  ])('%s CI gate rejects empty, malformed, failed, and errored results', (skill, file) => {
    const gate = reference(skill, file)
      .split('## CI Gate')[1]
      .match(/node -e "([^\n]+)" "\$result_dir\/results.json"/)?.[1];
    expect(gate).toBeDefined();
    const artifact = path.join(tempDir, `${skill}-gate.json`);
    for (const stats of [
      {},
      { successes: 0, failures: 0, errors: 0 },
      { successes: -1, failures: 0, errors: 0 },
      { successes: '1', failures: 0, errors: 0 },
      { successes: 0, failures: 1, errors: 0 },
      { successes: 1, failures: 0, errors: 1 },
    ]) {
      fs.writeFileSync(artifact, JSON.stringify({ results: { stats } }));
      expect(() => execFileSync(process.execPath, ['-e', gate!, artifact])).toThrow();
    }
    fs.writeFileSync(
      artifact,
      JSON.stringify({ results: { stats: { successes: 1, failures: 0, errors: 0 } } }),
    );
    expect(() => execFileSync(process.execPath, ['-e', gate!, artifact])).not.toThrow();
  });
});
