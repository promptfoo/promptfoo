#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--version')) {
  let directory = path.dirname(fileURLToPath(import.meta.resolve('@openai/codex-sdk')));
  while (true) {
    const manifestPath = path.join(directory, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name === '@openai/codex-sdk') {
        console.log(`codex-cli ${manifest.dependencies['@openai/codex']}`);
        process.exit(0);
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error('The fixture could not find its installed Codex SDK manifest');
    }
    directory = parent;
  }
}

// Exercise the real SDK's subprocess protocol without contacting a model service.
let prompt = '';
for await (const chunk of process.stdin) {
  prompt += chunk;
}
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
send({ type: 'thread.started', thread_id: 'fixture-thread' });
send({ type: 'turn.started' });
if (prompt.includes('fixture error')) {
  send({ type: 'turn.failed', error: { message: 'fixture request failed' } });
} else {
  send({
    type: 'item.completed',
    item: { id: 'fixture-item', type: 'agent_message', text: 'local SDK fixture response' },
  });
  send({
    type: 'turn.completed',
    usage: { input_tokens: 3, output_tokens: 5, cached_input_tokens: 0 },
  });
}
