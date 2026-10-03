import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');

it('runs Go providers with named function types and existing wrapper paths', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-go-smoke-'));
  const cases = ['named-type', 'wrapper-file', 'wrapper-module', 'legacy'];
  try {
    for (const name of cases) {
      const directory = path.join(tempDir, name);
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory, 'go.mod'), 'module example.com/fixture\n\ngo 1.23\n');
      const declaration =
        name === 'named-type'
          ? 'type ProviderFunc func(string, map[string]interface{}, map[string]interface{}) (map[string]interface{}, error)\nvar CallApi ProviderFunc = callApi'
          : 'var CallApi = callApi';
      await fs.writeFile(
        path.join(directory, 'provider.go'),
        `package ${name === 'legacy' ? 'main' : 'provider'}
import "os"
${declaration}
func callApi(prompt string, options map[string]interface{}, ctx map[string]interface{}) (map[string]interface{}, error) {
  return map[string]interface{}{"output": os.Getenv("PROMPTFOO_GO_MESSAGE") + " " + prompt}, nil
}
`,
      );
      if (name === 'wrapper-file') {
        await fs.writeFile(path.join(directory, '.promptfoo-wrapper'), 'Existing project file');
      } else if (name === 'wrapper-module') {
        await fs.mkdir(path.join(directory, '.promptfoo-wrapper'));
        await fs.writeFile(
          path.join(directory, '.promptfoo-wrapper/go.mod'),
          'module example.com/unrelated\n\ngo 1.23\n',
        );
      }
    }
    const configPath = path.join(tempDir, 'config.json');
    const outputPath = path.join(tempDir, 'results.json');
    const envPath = path.join(tempDir, '.env');
    await fs.writeFile(envPath, 'PROMPTFOO_GO_MESSAGE=Hello\nGOFLAGS=-buildvcs=false\n');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        prompts: ['smoke.'],
        providers: cases.map((name) => ({ id: `file://${name}/provider.go`, label: name })),
        tests: [{ assert: [{ type: 'equals', value: 'Hello smoke.' }] }],
      }),
    );
    await promisify(execFile)(
      process.execPath,
      [
        path.join(repoRoot, 'dist/src/main.js'),
        'eval',
        '-c',
        configPath,
        '--env-file',
        envPath,
        '--no-cache',
        '--no-share',
        '--no-write',
        '--max-concurrency',
        '2',
        '-o',
        outputPath,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          GOPROXY: 'off',
          GOSUMDB: 'off',
          PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state'),
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        },
      },
    ).catch((error) => {
      throw new Error(`${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error });
    });
    const exported = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(exported.results.stats).toMatchObject({ successes: 4, failures: 0, errors: 0 });
    expect(exported.results.results).toHaveLength(4);
    for (const row of exported.results.results) {
      expect(row).toMatchObject({ success: true, score: 1, response: { output: 'Hello smoke.' } });
      expect(row.error).toBeUndefined();
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
