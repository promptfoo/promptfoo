/** Opt-in smoke evals against an existing Foundry agent; never provisions Azure resources. */
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { sanitizeObject } from '../src/util/sanitizer';

import type { EvaluateResult } from '../src/types';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const run = promisify(execFile);
const cliWallClockTimeoutMs = 180_000;
const { values } = parseArgs({
  options: {
    endpoint: { type: 'string' },
    agent: { type: 'string' },
    output: { type: 'string' },
    live: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(
    'Usage: npx tsx scripts/azureFoundryLiveQa.ts --endpoint <https://.../api/projects/...> --agent <existing-agent-name> --live|--dry-run [--output <new-directory>]',
  );
  process.exit(0);
}
if (!values.endpoint || !values.agent || Boolean(values.live) === Boolean(values['dry-run'])) {
  throw new Error(
    'Provide an explicit endpoint, existing agent name, and exactly one of --live or --dry-run.',
  );
}
const endpoint = new URL(values.endpoint);
if (
  endpoint.protocol !== 'https:' ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  !/^\/api\/projects\/[^/]+\/?$/.test(endpoint.pathname)
) {
  throw new Error(
    'Use an HTTPS Foundry project endpoint without credentials, query parameters, or fragments.',
  );
}

const output = values.output
  ? path.resolve(values.output)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-live-qa-'));
if (values.output) {
  fs.mkdirSync(output);
}
const configDir = path.join(output, 'promptfoo');
fs.mkdirSync(configDir);
const callbackLog = path.join(output, 'callbacks.jsonl');
fs.writeFileSync(callbackLog, '');

function packageVersion(name: string, resolver = require): { version: string; entry: string } {
  const entry = resolver.resolve(name);
  let directory = path.dirname(entry);
  while (directory !== path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (data.name === name) {
        return { version: data.version, entry };
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot read installed ${name} version`);
}

const projects = packageVersion('@azure/ai-projects');
const metadata = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  node: process.version,
  sdkVersions: {
    projects: projects.version,
    identity: packageVersion('@azure/identity').version,
    openai: packageVersion('openai', createRequire(projects.entry)).version,
  },
  endpoint: endpoint.toString(),
  agent: values.agent,
  live: Boolean(values.live),
  // Each eval permits one initial Responses request and two tool continuations.
  // This does not count model calls performed internally by the Azure agent service.
  maxClientResponsesRequests: 9,
  cliWallClockTimeoutMs,
  configDir,
  traces: path.join(configDir, 'promptfoo.db'),
};
fs.writeFileSync(path.join(output, 'metadata.json'), JSON.stringify(metadata, null, 2));

const responseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'qa',
    strict: true,
    schema: {
      type: 'object',
      properties: { status: { type: 'string' } },
      required: ['status'],
      additionalProperties: false,
    },
  },
};
const cases = [
  {
    name: 'text',
    prompt: 'Reply with exactly FOUNDRY_QA_OK.',
    config: {},
    assertion: { type: 'equals', value: 'FOUNDRY_QA_OK' },
  },
  {
    name: 'structured',
    prompt: 'Return a JSON object with status equal to FOUNDRY_QA_OK.',
    config: { response_format: responseFormat },
    assertion: { type: 'javascript', value: 'output.status === "FOUNDRY_QA_OK"' },
  },
  {
    name: 'tool',
    prompt: 'Call foundry_qa_weather for Paris, then return your final JSON result.',
    config: {
      instructions: 'In your final JSON result, set status to FOUNDRY_QA_OK.',
      tool_choice: { type: 'function', name: 'foundry_qa_weather' },
      response_format: responseFormat,
      tools: [
        {
          type: 'function',
          name: 'foundry_qa_weather',
          description: 'Return fixed synthetic weather for QA.',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          },
          strict: true,
        },
      ],
      functionToolCallbacks: {
        foundry_qa_weather: `async function(args, context) {
          context?.abortSignal?.throwIfAborted();
          const { appendFileSync } = await import('node:fs');
          appendFileSync(${JSON.stringify(callbackLog)}, JSON.stringify({ runId: context?.runId, name: 'foundry_qa_weather' }) + String.fromCharCode(10));
          return JSON.stringify({ weather: 'sunny', source: 'synthetic QA fixture' });
        }`,
      },
    },
    assertion: { type: 'javascript', value: 'output.status === "FOUNDRY_QA_OK"' },
  },
];

const summaries: unknown[] = [];
for (const test of cases) {
  const configPath = path.join(output, `${test.name}.json`);
  const resultPath = path.join(output, `${test.name}-results.json`);
  const config = {
    description: `Opt-in Azure Foundry ${test.name} QA`,
    providers: [
      {
        id: `azure:foundry-agent:${values.agent}`,
        config: {
          projectUrl: endpoint.toString(),
          timeoutMs: 30_000,
          retryOptions: { maxRetries: 0 },
          maxRetries: 0,
          maxToolIterations: 2,
          maxPollTimeMs: 60_000,
          max_output_tokens: 200,
        },
      },
    ],
    prompts: [{ raw: test.prompt, label: test.name, config: test.config }],
    tests: [{ assert: [test.assertion] }],
    evaluateOptions: { maxConcurrency: 1, timeoutMs: 120_000 },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  if (!values.live) {
    continue;
  }
  let exitCode = 0;
  let terminalError: string | undefined;
  try {
    await run(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/localEntrypoint.ts',
        'eval',
        '-c',
        configPath,
        '--no-cache',
        '--no-share',
        '-o',
        resultPath,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_TRACING_ENABLED: 'true',
          PROMPTFOO_OTEL_LOCAL_EXPORT: 'true',
          PROMPTFOO_OTEL_ENDPOINT: '',
          OTEL_EXPORTER_OTLP_ENDPOINT: '',
        },
        maxBuffer: 4 * 1024 * 1024,
        timeout: cliWallClockTimeoutMs,
        killSignal: 'SIGKILL',
      },
    );
  } catch (error) {
    const failure = error as { code?: string | number; killed?: boolean; signal?: string };
    exitCode = typeof failure.code === 'number' ? failure.code : 1;
    if (failure.killed) {
      terminalError = `CLI terminated before completion (wall-clock limit: ${cliWallClockTimeoutMs}ms).`;
    } else if (failure.signal || typeof failure.code !== 'number') {
      terminalError = 'CLI was interrupted or could not complete.';
    }
  }
  if (!fs.existsSync(resultPath)) {
    summaries.push({
      case: test.name,
      exitCode,
      error:
        terminalError ??
        'CLI did not export results; inspect the isolated promptfoo/logs directory.',
    });
    process.exitCode = 1;
    break;
  }
  const exported = sanitizeObject(JSON.parse(fs.readFileSync(resultPath, 'utf8')), {
    sanitizeUrls: true,
  });
  fs.writeFileSync(resultPath, JSON.stringify(exported, null, 2));
  const callbackCount = fs
    .readFileSync(callbackLog, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean).length;
  const results = exported.results.results as EvaluateResult[];
  summaries.push({
    case: test.name,
    exitCode,
    ...(terminalError && { error: terminalError }),
    callbackCount,
    results: results.map((result) => ({
      success: result.success,
      score: result.score,
      error: result.error,
      output: result.response?.output,
      model: result.response?.raw?.model,
      usage: result.response?.tokenUsage,
      cost: result.response?.cost,
      metadata: result.metadata,
    })),
  });
  if (
    exitCode !== 0 ||
    results.length !== 1 ||
    results.some((result) => !result.success) ||
    (test.name === 'tool' && callbackCount === 0)
  ) {
    process.exitCode = 1;
  }
  // Authentication, reachability and provider errors need attention before more live calls.
  if (terminalError || results.some((result) => result.response?.error)) {
    break;
  }
}
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
console.log(`${values.live ? 'Live QA evidence' : 'Dry-run configs (no Azure calls)'}: ${output}`);
