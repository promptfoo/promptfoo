import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Copy beside an installed consumer's package.json. Python and Go are required;
// --ruby additionally requires Ruby and never silently skips an unavailable interpreter.
const fixturePath = fileURLToPath(import.meta.url);
const consumerRequire = createRequire(import.meta.url);
const packageEntry = consumerRequire.resolve('promptfoo');
const packageRequire = createRequire(packageEntry);
const installedPackageDir = path.resolve(path.dirname(packageEntry), '..', '..');
const platformEnv = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

async function checkProtobuf() {
  const protobuf = packageRequire('protobufjs');
  const protoDir = path.join(installedPackageDir, 'dist', 'src', 'tracing', 'proto');
  const root = new protobuf.Root();
  root.resolvePath = (_origin, target) => path.join(protoDir, target);
  await root.load('opentelemetry/proto/collector/trace/v1/trace_service.proto');
  const requestType = root.lookupType(
    'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
  );
  const traceId = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const spanId = Buffer.from('0123456789abcdef', 'hex');
  const message = requestType.fromObject({
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'artifact-fixture' } }],
        },
        scopeSpans: [
          {
            scope: { name: 'artifact-assets' },
            spans: [
              {
                traceId,
                spanId,
                name: 'Local protobuf café 🚀',
                kind: 1,
                startTimeUnixNano: '1700000000000000000',
                endTimeUnixNano: '1700000000001000000',
                attributes: [{ key: 'fixture.value', value: { intValue: 7 } }],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(requestType.verify(message), null);
  const encoded = requestType.encode(message).finish();
  assert(encoded.length > 0);
  const decoded = requestType.toObject(requestType.decode(encoded), { longs: String });
  const resource = decoded.resourceSpans[0];
  const span = resource.scopeSpans[0].spans[0];
  assert.equal(resource.resource.attributes[0].value.stringValue, 'artifact-fixture');
  assert.equal(resource.scopeSpans[0].scope.name, 'artifact-assets');
  assert.deepEqual(Buffer.from(span.traceId), traceId);
  assert.deepEqual(Buffer.from(span.spanId), spanId);
  assert.equal(span.name, 'Local protobuf café 🚀');
  assert.equal(span.startTimeUnixNano, '1700000000000000000');
  assert.equal(span.endTimeUnixNano, '1700000000001000000');
  assert.equal(span.attributes[0].value.intValue, '7');
  assert.equal(span.status.code, 1);
  assert.throws(() => requestType.decode(Uint8Array.of(0xff)), /range|buffer|varint/i);
  console.log('Verified installed protobuf definitions: nonempty trace roundtrip and invalid data');
}

function writeProvider(stateDir, language) {
  const providerDir = path.join(stateDir, 'local providers', language);
  fs.mkdirSync(providerDir, { recursive: true });
  let scriptPath;
  if (language === 'python') {
    scriptPath = path.join(providerDir, 'provider.py');
    fs.writeFileSync(
      scriptPath,
      `calls = 0

def make_prompt(context):
    return "Asset " + context["vars"]["value"]

def call_api(prompt, options, context):
    global calls
    calls += 1
    if context["vars"]["fail"]:
        raise ValueError("artifact-python-failure")
    return {"output": "python:" + prompt, "metadata": {"calls": calls}}
`,
    );
  } else if (language === 'go') {
    // The Go provider copies its module tree. Keep go.mod below the consumer so
    // that this operation never copies node_modules or the repository.
    fs.writeFileSync(
      path.join(providerDir, 'go.mod'),
      'module artifact.local/fixture\n\ngo 1.22\n',
    );
    scriptPath = path.join(providerDir, 'provider.go');
    fs.writeFileSync(
      scriptPath,
      `package main

func CallApi(prompt string, options map[string]interface{}, context map[string]interface{}) (map[string]interface{}, error) {
    if context["vars"].(map[string]interface{})["fail"] == true {
        return map[string]interface{}{"error": "artifact-go-failure"}, nil
    }
    return map[string]interface{}{"output": "go:" + prompt}, nil
}
`,
    );
  } else {
    scriptPath = path.join(providerDir, 'provider.rb');
    fs.writeFileSync(
      scriptPath,
      `def call_api(prompt, options, context)
  raise "artifact-ruby-failure" if context["vars"]["fail"]
  { output: "ruby:" + prompt }
end
`,
    );
  }
  return { providerDir, scriptPath };
}

async function checkProvider(stateDir, language) {
  const { evaluate, loadApiProvider } = await import('promptfoo');
  const { providerDir, scriptPath } = writeProvider(stateDir, language);
  const providerId = `artifact-${language}`;
  const provider = await loadApiProvider(`file://${scriptPath}`, {
    basePath: providerDir,
    options: {
      id: providerId,
      config: language === 'python' ? { workers: 1, timeout: 10_000 } : {},
    },
  });
  assert.equal(provider.id(), providerId);
  try {
    const record = await evaluate(
      {
        // A named Python prompt exercises wrapper.py as well as the provider's
        // persistent_wrapper.py; the other languages use an ordinary template.
        prompts: [language === 'python' ? `file://${scriptPath}:make_prompt` : 'Asset {{value}}'],
        providers: [provider],
        tests: ['café 日本語 🚀', 'deliberate error', 'recovered'].map((value, index) => ({
          vars: { value, fail: index === 1 },
          assert: [{ type: 'equals', value: `${language}:Asset ${value}` }],
        })),
        writeLatestResults: false,
        sharing: false,
      },
      { cache: false, maxConcurrency: 1 },
    );
    const summaryPath = path.join(stateDir, `${language}-results.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(await record.toEvaluateSummary()));
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    assert.equal(summary.results.length, 3);
    for (const [index, result] of summary.results.entries()) {
      assert.equal(result.provider.id, providerId);
      assert.equal(result.success, index !== 1, `${language} test ${index}: ${result.error}`);
      assert.equal(result.score, index === 1 ? 0 : 1);
      if (index === 1) {
        assert.match(result.error, new RegExp(`artifact-${language}-failure`));
      } else {
        assert.equal(result.error, undefined);
        assert.equal(result.response.error, undefined);
        assert.equal(
          result.response.output,
          `${language}:Asset ${index === 0 ? 'café 日本語 🚀' : 'recovered'}`,
        );
        if (language === 'python') {
          assert.equal(
            result.response.metadata.calls,
            index + 1,
            'Python worker must survive errors',
          );
        }
      }
    }
    assert.equal(summary.stats.successes, 2);
    assert.equal(summary.stats.errors, 1);
    console.log(`Verified installed ${language} wrapper: pass=2 score=1 each, deliberate errors=1`);
  } finally {
    await provider.shutdown?.();
  }
}

if (process.argv[2] === '--child') {
  const stateDir = process.argv[3];
  assert(stateDir, 'Expected an owned state directory');
  await checkProtobuf();
  for (const language of ['python', 'go', ...(process.argv[4] === '--ruby' ? ['ruby'] : [])]) {
    await checkProvider(stateDir, language);
  }
} else {
  const { values } = parseArgs({ options: { ruby: { type: 'boolean', default: false } } });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-runtime-assets-'));
  try {
    for (const directory of ['config', 'cache', 'go-cache', 'go-mod-cache', 'tmp']) {
      fs.mkdirSync(path.join(stateDir, directory));
    }
    execFileSync(
      process.execPath,
      [fixturePath, '--child', stateDir, ...(values.ruby ? ['--ruby'] : [])],
      {
        cwd: path.dirname(fixturePath),
        env: {
          ...platformEnv,
          NODE_PATH: '',
          IS_TESTING: 'false',
          PROMPTFOO_CONFIG_DIR: path.join(stateDir, 'config'),
          PROMPTFOO_CACHE_PATH: path.join(stateDir, 'cache'),
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_TRACING_ENABLED: 'false',
          PROMPTFOO_ENABLE_OTEL: 'false',
          PROMPTFOO_PYTHON: 'python3',
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONNOUSERSITE: '1',
          PYTHONPATH: '',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          GOCACHE: path.join(stateDir, 'go-cache'),
          GOMODCACHE: path.join(stateDir, 'go-mod-cache'),
          GOPATH: path.join(stateDir, 'go-path'),
          GOPROXY: 'off',
          GOSUMDB: 'off',
          GOTOOLCHAIN: 'local',
          GOTELEMETRY: 'off',
          GOENV: 'off',
          GOFLAGS: '-buildvcs=false',
          GOWORK: 'off',
          TMPDIR: path.join(stateDir, 'tmp'),
          TEMP: path.join(stateDir, 'tmp'),
          TMP: path.join(stateDir, 'tmp'),
        },
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}
