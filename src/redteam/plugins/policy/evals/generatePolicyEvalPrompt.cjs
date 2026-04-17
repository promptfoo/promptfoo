#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yaml = require('js-yaml');

function renderGeneratedOutput(generatedTests) {
  return generatedTests
    .map((test) => {
      const vars = test.vars || {};

      if (typeof vars.prompt === 'string') {
        return vars.prompt;
      }

      if (typeof vars.__prompt === 'string') {
        return vars.__prompt;
      }

      return JSON.stringify(vars);
    })
    .join('\n');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main() {
  const rawContext = process.argv[2];
  if (!rawContext) {
    fail('Policy eval prompt requires Promptfoo context JSON as its first argument.');
  }

  let context;
  try {
    context = JSON.parse(rawContext);
  } catch (error) {
    fail(`Failed to parse Promptfoo context JSON: ${error.message}`);
  }

  const vars = context.vars || {};
  if (typeof vars.case_file !== 'string' || vars.case_file.length === 0) {
    fail('Policy eval prompt requires vars.case_file.');
  }

  const evalDir = __dirname;
  const repoRoot = path.resolve(evalDir, '../../../../..');
  const caseFile = path.resolve(evalDir, vars.case_file);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-plugin-eval-'));
  const outputPath = path.join(tempDir, `${path.basename(caseFile, '.yaml')}.generated.yaml`);

  const result = spawnSync(
    'npm',
    ['run', 'local', '--', 'redteam', 'generate', '-c', caseFile, '-o', outputPath, '--force'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fail(
      [
        `redteam generate failed for ${vars.case_file}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  let generatedConfig;
  try {
    generatedConfig = yaml.load(fs.readFileSync(outputPath, 'utf8'));
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fail(`Failed to parse generated config for ${vars.case_file}: ${error.message}`);
  }

  const generatedTests = Array.isArray(generatedConfig?.tests) ? generatedConfig.tests : [];
  const normalized = {
    generated_config: generatedConfig,
    generated_tests: generatedTests,
    generated_output: renderGeneratedOutput(generatedTests),
    generated_count: generatedTests.length,
  };

  fs.rmSync(tempDir, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(normalized, null, 2));
}

main();
