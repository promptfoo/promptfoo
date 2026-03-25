const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yaml = require('js-yaml');

function renderGeneratedOutput(generatedTests) {
  return generatedTests
    .map((test) => {
      const vars = test.vars || {};
      const prompt = typeof vars.prompt === 'string' ? vars.prompt : undefined;
      const multiInputPrompt = typeof vars.__prompt === 'string' ? vars.__prompt : undefined;

      if (prompt) {
        return prompt;
      }

      if (multiInputPrompt) {
        return multiInputPrompt;
      }

      return JSON.stringify(vars);
    })
    .join('\n');
}

function runRedteamGenerate(caseFile) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-plugin-eval-'));
  const outputPath = path.join(tempDir, `${path.basename(caseFile, '.yaml')}.generated.yaml`);

  const result = spawnSync(
    'npm',
    ['run', 'local', '--', 'redteam', 'generate', '-c', caseFile, '-o', outputPath, '--force'],
    {
      cwd: path.resolve(__dirname, '../../../../..'),
      encoding: 'utf8',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `redteam generate failed for ${caseFile}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  const generatedConfig = yaml.load(fs.readFileSync(outputPath, 'utf8'));
  fs.rmSync(tempDir, { recursive: true, force: true });
  return generatedConfig;
}

module.exports = function generateEvalCases() {
  const manifestPath = path.join(__dirname, 'tests', 'policy-generation.yaml');
  const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));

  return manifest.map((testCase) => {
    const caseFile = path.join(__dirname, testCase.case_file);
    const generatedConfig = runRedteamGenerate(caseFile);
    const generatedTests = Array.isArray(generatedConfig.tests) ? generatedConfig.tests : [];

    return {
      description: testCase.description,
      vars: {
        ...testCase.vars,
        generated_config_json: JSON.stringify(generatedConfig),
        generated_tests_json: JSON.stringify(generatedTests),
        generated_output: renderGeneratedOutput(generatedTests),
      },
      assert: testCase.assert,
    };
  });
};
