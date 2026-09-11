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

function runCli(args: string[]) {
  return promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', 'src/localEntrypoint.ts', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state'),
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_UPDATE: 'true',
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
    ] as const) {
      const response = await grader.callApi(
        JSON.stringify({
          candidate: JSON.stringify(candidate),
          rubric: 'The answer must contain inv-123, approved, and low risk.',
        }),
      );
      expect(JSON.parse(response.output).pass).toBe(expected);
    }
  });

  it('runs the documented calibration suite with one pass and two failures', async () => {
    const markdown = reference('promptfoo-evals', 'eval-patterns.md');
    const config = markdown
      .split('## Calibrate Assertions')[1]
      .match(/```yaml\n([\s\S]*?)\n```/)?.[1];
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

  it('validates and runs the rubric fixture through the actual candidate-output contract', async () => {
    const config = path.join(
      repoRoot,
      'test/fixtures/agent-skills/evals-json-rubric/promptfooconfig.yaml',
    );
    const artifact = path.join(tempDir, 'rubric.json');
    await runCli(['validate', 'config', '-c', config]);
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

  it('validates the complete public example and supplies distinct expected statuses', async () => {
    const markdown = fs.readFileSync(
      path.join(repoRoot, 'site/docs/integrations/agent-skill.md'),
      'utf8',
    );
    const exampleDir = path.join(tempDir, 'public-example');
    const written = new Set<string>();
    for (const match of markdown.matchAll(/```(?:yaml|json) title="([^"]+)"\n([\s\S]*?)\n```/g)) {
      if (written.has(match[1])) {
        continue;
      }
      written.add(match[1]);
      const filePath = path.join(exampleDir, match[1]);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, match[2]);
    }
    expect(written.has('prompts/chat.json')).toBe(true);
    await runCli(['validate', 'config', '-c', path.join(exampleDir, 'promptfooconfig.yaml')]);
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

  it('reports a missing required HTTP answer as an error with the documented transform', async () => {
    const markdown = reference('promptfoo-provider-setup', 'provider-patterns.md');
    const config = yaml.load(markdown.match(/```yaml\n([\s\S]*?)\n```/)![1]) as {
      providers: {
        config: { url: string; headers: Record<string, string>; maxRetries?: number };
      }[];
      tests: { vars: { message: string } }[];
    };
    const server = http.createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(JSON.parse(body).message === 'good' ? { output: 'PONG' } : {}));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      config.providers[0].config.url = `http://127.0.0.1:${address.port}`;
      config.providers[0].config.maxRetries = 0;
      delete config.providers[0].config.headers.Authorization;
      config.tests = [{ vars: { message: 'good' } }, { vars: { message: 'missing' } }];
      const configPath = path.join(tempDir, 'http-answer.yaml');
      const outputPath = path.join(tempDir, 'http-answer.json');
      fs.writeFileSync(configPath, yaml.dump(config));
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
      expect(results.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 1 });
      expect(results.results.results.find((row: { error?: string }) => row.error)?.error).toContain(
        'Expected string output',
      );
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
      const script = fs
        .readdirSync(path.join(installed, skill, 'scripts'))
        .find((name) => name.endsWith('.mjs'))!;
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
