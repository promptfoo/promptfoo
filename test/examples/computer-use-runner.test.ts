import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const fixtureRoots: string[] = [];
const runnerPath = path.resolve(
  __dirname,
  '../../examples/openai-codex-app-server/computer-use/run-e2e.sh',
);

function createFixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-computer-use-runner-')),
  );
  fixtureRoots.push(root);
  const example = path.join(root, 'example');
  const bin = path.join(root, 'bin');
  const plugin = path.join(root, 'plugin');
  for (const dir of [bin, path.join(example, 'target'), path.join(plugin, '.codex-plugin')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const script = path.join(example, 'run-e2e.sh');
  fs.copyFileSync(runnerPath, script);
  fs.writeFileSync(path.join(example, 'target/Info.plist'), 'fixture');
  fs.writeFileSync(path.join(plugin, '.codex-plugin/plugin.json'), '{"name":"computer-use"}');
  fs.writeFileSync(
    path.join(plugin, '.mcp.json'),
    '{"mcpServers":{"computer-use":{"command":"launcher"}}}',
  );
  fs.writeFileSync(path.join(plugin, 'launcher'), '#!/bin/bash\nexit 0\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/bash\nprintf "{}\\n"\n', { mode: 0o700 });
  fs.writeFileSync(
    path.join(bin, 'npx'),
    `#!/bin/bash
while (($#)); do
  if [[ "$1" == -o ]]; then printf '{}\\n' > "$2"; break; fi
  shift
done
`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, 'ps'),
    `#!/bin/bash
if [[ -n "\${FIXTURE_STALE_PID:-}" ]]; then
  printf '%s %s\\n' "$FIXTURE_STALE_PID" "$FIXTURE_TARGET_BINARY"
fi
`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(bin, 'xcrun'),
    `#!/bin/bash
while (($#)); do
  if [[ "$1" == -o ]]; then
    printf '#!/bin/bash\\nexec sleep 30\\n' > "$2"
    chmod 700 "$2"
    break
  fi
  shift
done
`,
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    OPENAI_API_KEY: 'fixture-only',
    CODEX_API_KEY: '',
    COMPUTER_USE_PLUGIN_DIR: plugin,
    FIXTURE_TARGET_BINARY: path.join(
      example,
      '.tmp/PromptfooComputerUseTarget.app/Contents/MacOS/PromptfooComputerUseTarget',
    ),
  };
  const run = (overrides: NodeJS.ProcessEnv = {}) =>
    new Promise<{ code: string | number; stderr: string }>((resolve) => {
      execFile(
        'bash',
        [script],
        { env: { ...env, ...overrides }, timeout: 8_000 },
        (error, _stdout, stderr) => {
          resolve({ code: error?.code ?? 0, stderr });
        },
      );
    });
  return { root, example, plugin, run };
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.runIf(process.platform !== 'win32')('Computer Use runner recovery', () => {
  it.each([
    ...[
      'target.log',
      'marketplace-add.json',
      'plugin-add.json',
      'plugin-list.json',
      'results.json',
    ].map((artifact) => ({ artifact, link: 'symbolic' })),
    { artifact: 'target.log', link: 'hard' },
  ])('does not truncate a $link-linked $artifact', async ({ artifact, link }) => {
    const fixture = createFixture();
    const artifacts = path.join(fixture.example, '.tmp');
    fs.mkdirSync(artifacts);
    const victim = path.join(fixture.root, 'unrelated.txt');
    fs.writeFileSync(victim, 'keep this file');
    const createLink = link === 'hard' ? fs.linkSync : fs.symlinkSync;
    createLink(victim, path.join(artifacts, artifact));
    const result = await fixture.run();
    expect(result.code, result.stderr).toBe(0);
    expect(fs.readFileSync(victim, 'utf8')).toBe('keep this file');
  });

  it.each(['missing', 'malformed'])('stops the old target when the plugin is %s', async (state) => {
    const fixture = createFixture();
    if (state === 'missing') {
      fs.rmSync(fixture.plugin, { recursive: true });
    } else {
      fs.writeFileSync(path.join(fixture.plugin, '.codex-plugin/plugin.json'), '{invalid');
    }
    const stale = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const exited = once(stale, 'exit');
    try {
      const result = await fixture.run({ FIXTURE_STALE_PID: String(stale.pid) });
      expect(result.code).not.toBe(0);
      expect(stale.exitCode !== null || stale.signalCode !== null).toBe(true);
    } finally {
      stale.kill('SIGTERM');
      await exited;
    }
  });
});
