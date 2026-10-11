import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureRoot, '../../../..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-eligibility-'));
fs.cpSync(path.join(fixtureRoot, 'repos'), path.join(workspace, 'repos'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'plugins/promptfoo/skills'), path.join(workspace, '.agents/skills'), {
  recursive: true,
});
console.log(workspace);
