import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

import { runIsolated } from './isolated.mjs';

async function runQuickstart(origin, installedVersion) {
  const signal = AbortSignal.timeout(20_000);
  async function json(route, options) {
    const response = await fetch(origin + route, { ...options, signal });
    assert.equal(response.status, 200, `${route}: ${response.status}`);
    return response.json();
  }

  const spec = await json('/api/openapi.json');
  assert.equal(spec.info.version, installedVersion);
  const jobPath = '/api/eval/job';
  const example = spec.paths[jobPath].post.requestBody.content['application/json'].example;
  assert.deepEqual(example.providers, ['echo']);
  assert.equal(example.sharing, false);
  const { id } = await json(jobPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(example),
  });
  assert.equal(typeof id, 'string');
  const statusPath = `${jobPath}/${encodeURIComponent(id)}`;
  let job = await json(statusPath);
  while (job.status === 'in-progress') {
    await delay(100, undefined, { signal });
    job = await json(statusPath);
  }
  assert.equal(job.status, 'complete', JSON.stringify(job.logs));
  assert.equal(job.result.stats.successes, 1);
  assert.equal(job.result.stats.failures, 0);
  assert.equal(job.result.stats.errors, 0);
  assert.equal(job.result.results[0].response.output, 'ping');
  assert.equal(typeof job.evalId, 'string');
  const saved = await json(`/api/eval/${encodeURIComponent(job.evalId)}/table`);
  assert.equal(saved.id, job.evalId);
  assert.equal(saved.table.body[0].outputs[0].success, true);
  assert.equal(saved.table.body[0].outputs[0].response.output, 'ping');
}

async function checkInstalledView() {
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );

  const packageDir = path.resolve('node_modules/promptfoo');
  const { bin, version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const child = spawn(
    process.execPath,
    [path.join(packageDir, bin.promptfoo), 'view', '--no', '--port', String(port)],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (line.includes(`Server running at http://localhost:${port} `)) {
        await runQuickstart(`http://127.0.0.1:${port}`, version);
        return;
      }
    }
    throw new Error('Installed promptfoo view exited before listening');
  } finally {
    child.kill();
  }
}

if (process.argv[2] === '--child') {
  await checkInstalledView();
} else {
  await runIsolated(import.meta.url, { label: 'http-quickstart' });
  console.log(
    'Verified the installed HTTP quickstart: one passing echo result, persisted by evalId.',
  );
}
