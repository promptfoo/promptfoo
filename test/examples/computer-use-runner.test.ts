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
if [[ "$1" == -p ]]; then
  [[ "\${FIXTURE_PID_COMMAND:-$FIXTURE_TARGET_BINARY}" == none ]] || printf '%s\\n' "\${FIXTURE_PID_COMMAND:-$FIXTURE_TARGET_BINARY}"
  exit 0
fi
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
    printf cache > "$CLANG_MODULE_CACHE_PATH/probe"
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
  const run = (overrides: NodeJS.ProcessEnv = {}, args: string[] = []) =>
    new Promise<{ code: string | number; stderr: string }>((resolve) => {
      execFile(
        'bash',
        [script, ...args],
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

  it.each([
    ['config', ['eval', '-c', 'escape.yaml']],
    ['equals-form env file', ['eval', '--env-file=escape.yaml']],
    ['equals-form env path', ['eval', '--env-path=escape.yaml']],
  ])('rejects %s that redirects runner-owned Promptfoo state', async (_name, args) => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.example, 'escape.yaml'),
      'env:\n  PROMPTFOO_CONFIG_DIR: /tmp/outside\n',
    );

    const result = await fixture.run({}, args);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it('rejects trimmed comma-separated env files that redirect state', async () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.example, 'safe.env'), 'SAFE=true\n');
    fs.writeFileSync(
      path.join(fixture.example, 'escape.env'),
      'PROMPTFOO_CACHE_PATH=/tmp/outside\n',
    );

    const result = await fixture.run({}, ['eval', '--env-file=safe.env, escape.env']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it('rejects env files declared by a config before launch', async () => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.example, 'escape.env'),
      'PROMPTFOO_MEDIA_PATH=/tmp/outside\n',
    );
    fs.writeFileSync(
      path.join(fixture.example, 'custom.yaml'),
      'commandLineOptions:\n  envPath: escape.env\n',
    );

    const result = await fixture.run({}, ['eval', '-c', 'custom.yaml']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it('rejects env files that override runner-owned fixture paths', async () => {
    const fixture = createFixture();
    fs.writeFileSync(
      path.join(fixture.example, 'escape.env'),
      'CODEX_HOME_OVERRIDE=/tmp/outside\n',
    );

    const result = await fixture.run({}, ['eval', '--env-file=escape.env']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it.each([
    [
      'yaml array',
      'custom.yaml',
      'commandLineOptions:\n  envPath:\n    - safe.env\n    - escape.env\n',
    ],
    ['json array', 'custom.json', '{"commandLineOptions":{"envPath":["safe.env","escape.env"]}}'],
  ])('rejects %s envPath entries before launch', async (_name, config, contents) => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.example, 'safe.env'), 'SAFE=true\n');
    fs.writeFileSync(
      path.join(fixture.example, 'escape.env'),
      'COMPUTER_USE_TARGET_APP=/tmp/outside\n',
    );
    fs.writeFileSync(path.join(fixture.example, config), contents);

    const result = await fixture.run({}, ['eval', '-c', config]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it('rejects state redirects from later variadic config operands', async () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.example, 'safe.yaml'), 'description: safe\n');
    fs.writeFileSync(
      path.join(fixture.example, 'escape.yaml'),
      'env:\n  PROMPTFOO_CONFIG_DIR: /tmp/outside\n',
    );

    const result = await fixture.run({}, ['eval', '-c', 'safe.yaml', 'escape.yaml']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Refusing config that overrides runner-owned Promptfoo state');
  });

  it('does not signal a saved pid after it no longer belongs to the target', async () => {
    const fixture = createFixture();
    const stale = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const exited = once(stale, 'exit');
    try {
      await fixture.run({
        FIXTURE_STALE_PID: String(stale.pid),
        FIXTURE_PID_COMMAND: '/tmp/reused-by-another-process',
      });
      expect(stale.exitCode).toBeNull();
    } finally {
      stale.kill('SIGTERM');
      await exited;
    }
  });

  it('recreates compiler caches before invoking xcrun', async () => {
    const fixture = createFixture();
    const outside = path.join(fixture.root, 'outside-cache');
    fs.mkdirSync(outside);
    fs.mkdirSync(path.join(fixture.example, '.tmp'));
    fs.symlinkSync(outside, path.join(fixture.example, '.tmp/clang-module-cache'));

    const result = await fixture.run();

    expect(result.code, result.stderr).toBe(0);
    expect(fs.existsSync(path.join(outside, 'probe'))).toBe(false);
  });
});
