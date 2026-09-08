import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Copy this fixture into an isolated installed consumer before running it. Every runtime
// dependency and migration must resolve from that consumer's promptfoo installation.
const consumerRequire = createRequire(import.meta.url);
const packageEntry = consumerRequire.resolve('promptfoo');
const packageRequire = createRequire(packageEntry);
const installedPackageDir = path.resolve(path.dirname(packageEntry), '..', '..');
const platformEnv = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

async function runPersistedEvaluation() {
  const { evaluate } = await import('promptfoo');
  const outputPath = process.argv[3];
  const summaryPath = process.argv[4];
  assert(outputPath && summaryPath, 'Expected evaluation output and summary paths');
  const record = await evaluate(
    {
      description: 'Installed artifact migration acceptance',
      author: 'package-artifact-fixture',
      prompts: ['Hello {{name}}'],
      providers: ['echo'],
      tests: [
        {
          vars: { name: 'migrated artifact' },
          assert: [{ type: 'equals', value: 'Hello migrated artifact' }],
        },
        {
          vars: { name: 'deliberate failure' },
          assert: [{ type: 'equals', value: 'different output' }],
        },
      ],
      writeLatestResults: true,
      sharing: false,
      outputPath,
    },
    { cache: false, maxConcurrency: 1 },
  );
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({ id: record.id, summary: await record.toEvaluateSummary() }),
  );
}

async function checkMigrations() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-artifact-migrations-'));
  const configDir = path.join(tempDir, 'config');
  const oldMigrationsDir = path.join(tempDir, 'old-migrations');
  const outputPath = path.join(tempDir, 'evaluation.json');
  const summaryPath = path.join(tempDir, 'summary.json');
  let client;

  try {
    fs.mkdirSync(configDir);
    fs.mkdirSync(path.join(oldMigrationsDir, 'meta'), { recursive: true });
    const migrationsDir = path.join(installedPackageDir, 'dist', 'drizzle');
    const journal = JSON.parse(
      fs.readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8'),
    );
    assert(journal.entries.length > 1, 'Expected an initial schema and later migrations');
    const firstMigration = journal.entries[0];
    assert.equal(firstMigration.tag, '0000_lush_hellion');
    fs.copyFileSync(
      path.join(migrationsDir, `${firstMigration.tag}.sql`),
      path.join(oldMigrationsDir, `${firstMigration.tag}.sql`),
    );
    fs.writeFileSync(
      path.join(oldMigrationsDir, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: [firstMigration] }),
    );

    const { createClient } = packageRequire('@libsql/client');
    const { drizzle } = packageRequire('drizzle-orm/libsql');
    const { migrate } = packageRequire('drizzle-orm/libsql/migrator');
    const dbUrl = pathToFileURL(path.join(configDir, 'promptfoo.db')).href;
    client = createClient({ url: dbUrl });
    await migrate(drizzle(client), { migrationsFolder: oldMigrationsDir });
    const historicalValue = 'café / 日本語 / 🚀\n"quoted" \\ unchanged';
    const historicalOutput = `Legacy ${historicalValue}`;
    const historicalPrompt = {
      id: 'prompt-package-artifact-historical',
      raw: 'Legacy {{value}}',
      label: 'Historical echo',
      provider: 'echo',
    };
    const historicalTest = {
      vars: { value: historicalValue },
      assert: [{ type: 'equals', value: historicalOutput }],
    };
    const historicalTokens = { total: 7, prompt: 3, completion: 4, cached: 0, numRequests: 1 };
    const historicalResult = {
      id: 'result-package-artifact-historical',
      promptIdx: 0,
      testIdx: 0,
      promptId: historicalPrompt.id,
      prompt: { raw: historicalOutput, label: historicalPrompt.label },
      provider: { id: 'echo' },
      testCase: historicalTest,
      vars: historicalTest.vars,
      response: { output: historicalOutput, tokenUsage: historicalTokens },
      success: true,
      score: 1,
      failureReason: 0,
      latencyMs: 17,
      cost: 0.125,
      namedScores: { historical: 1 },
      gradingResult: { pass: true, score: 1, reason: 'Historical exact match' },
    };
    const historicalSummary = {
      version: 2,
      timestamp: new Date(1710348564000).toISOString(),
      results: [historicalResult],
      table: {
        head: { prompts: [historicalPrompt], vars: ['value'] },
        body: [
          {
            test: historicalTest,
            testIdx: 0,
            vars: [historicalValue],
            outputs: [
              {
                ...historicalResult,
                pass: historicalResult.success,
                text: historicalOutput,
                prompt: historicalOutput,
                provider: 'echo',
                tokenUsage: historicalTokens,
              },
            ],
          },
        ],
      },
      stats: { successes: 1, failures: 0, errors: 0, tokenUsage: historicalTokens },
    };
    const historical = {
      id: 'eval-package-artifact-historical',
      created_at: 1710348564000,
      description: 'Preserve café / 日本語 / 🚀',
      results: JSON.stringify(historicalSummary),
      config: JSON.stringify({
        description: 'Historical configuration',
        prompts: ['Legacy {{value}}'],
        providers: ['echo'],
        tests: [historicalTest],
      }),
    };
    await client.execute({
      sql: 'INSERT INTO evals (id, created_at, description, results, config) VALUES (?, ?, ?, ?, ?)',
      args: Object.values(historical),
    });
    const before = await client.execute('SELECT count(*) AS count FROM __drizzle_migrations');
    assert.equal(Number(before.rows[0].count), 1, 'Fixture must start on the original schema');
    client.close();
    client = undefined;

    // The child exercises public migration selection and persistence, then releases all
    // native handles before this process inspects and removes its own temporary database.
    const runNode = (args) =>
      execFileSync(process.execPath, args, {
        cwd: path.dirname(fileURLToPath(import.meta.url)),
        env: {
          ...platformEnv,
          NODE_PATH: '',
          IS_TESTING: 'false',
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_CACHE_PATH: path.join(tempDir, 'cache'),
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_TRACING_ENABLED: 'false',
          PROMPTFOO_ENABLE_OTEL: 'false',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    const runEvaluation = () =>
      runNode([fileURLToPath(import.meta.url), '--evaluate', outputPath, summaryPath]);
    runEvaluation();
    const firstId = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).id;
    // A fresh process reopening the upgraded database must not rerun migrations.
    runEvaluation();
    const { id, summary } = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    assert.notEqual(id, firstId, 'The second evaluation must create its own persisted row');
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    for (const results of [summary.results, exported.results.results]) {
      assert.equal(results.length, 2);
      assert.equal(results[0].success, true);
      assert.equal(results[0].score, 1);
      assert.equal(results[0].error, undefined);
      assert.equal(results[0].response.error, undefined);
      assert.equal(results[0].response.output, 'Hello migrated artifact');
      assert.equal(results[0].provider.id, 'echo');
      assert.equal(results[1].success, false);
      assert.equal(results[1].score, 0);
      assert.match(results[1].error, /different output/);
      assert.equal(results[1].response.error, undefined);
      assert.equal(results[1].response.output, 'Hello deliberate failure');
      assert.equal(results[1].provider.id, 'echo');
    }
    assert.equal(summary.stats.successes, 1);
    assert.equal(summary.stats.failures, 1);
    assert.equal(summary.stats.errors, 0);

    // The package root does not export a persisted-eval lookup API. Exercise the
    // supported CLI reader instead of reaching into a private bundled module.
    const manifest = JSON.parse(fs.readFileSync(path.join(installedPackageDir, 'package.json')));
    const historicalExportPath = path.join(tempDir, 'historical-export.json');
    runNode([
      path.join(installedPackageDir, manifest.bin.promptfoo),
      'export',
      'eval',
      historical.id,
      '--output',
      historicalExportPath,
    ]);
    const historicalExport = JSON.parse(fs.readFileSync(historicalExportPath, 'utf8'));
    assert.equal(historicalExport.evalId, historical.id);
    assert.deepEqual(
      historicalExport.results,
      historicalSummary,
      'The public CLI must read the complete historical result and table after migration',
    );
    assert.deepEqual(historicalExport.config, JSON.parse(historical.config));

    client = createClient({ url: dbUrl });
    const preserved = await client.execute({
      sql: 'SELECT id, created_at, description, results, config FROM evals WHERE id = ?',
      args: [historical.id],
    });
    assert.equal(preserved.rows.length, 1, 'Historical eval must survive the upgrade');
    for (const [key, value] of Object.entries(historical)) {
      assert.equal(preserved.rows[0][key], value, `Migration changed historical ${key}`);
    }
    const saved = await client.execute({
      sql: 'SELECT success, score, error, response FROM eval_results WHERE eval_id = ? ORDER BY test_idx',
      args: [id],
    });
    assert.equal(saved.rows.length, 2, 'The installed API must persist both new results');
    assert.equal(saved.rows[0].success, 1);
    assert.equal(saved.rows[0].score, 1);
    assert.equal(saved.rows[0].error, null);
    assert.equal(JSON.parse(saved.rows[0].response).output, 'Hello migrated artifact');
    assert.equal(saved.rows[1].success, 0);
    assert.equal(saved.rows[1].score, 0);
    assert.match(saved.rows[1].error, /different output/);
    assert.equal(JSON.parse(saved.rows[1].response).output, 'Hello deliberate failure');
    const previousResults = await client.execute({
      sql: 'SELECT count(*) AS count FROM eval_results WHERE eval_id = ?',
      args: [firstId],
    });
    assert.equal(
      Number(previousResults.rows[0].count),
      2,
      'Reopening must preserve previous results',
    );

    const applied = await client.execute(
      'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
    );
    assert.deepEqual(
      applied.rows.map((row) => ({ hash: row.hash, when: Number(row.created_at) })),
      journal.entries.map((entry) => ({
        hash: createHash('sha256')
          .update(fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`)))
          .digest('hex'),
        when: entry.when,
      })),
      'The installed API must apply each packaged migration exactly once',
    );
    console.log(
      `Verified installed migrations: 1 -> ${applied.rows.length}, stable after reopening; nonempty historical result/table retained exactly and read by CLI; pass=1 failure=1 scores=1/0 errors=0`,
    );
  } finally {
    client?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--evaluate') {
  await runPersistedEvaluation();
} else {
  assert.equal(process.argv.length, 2, 'Unexpected migration fixture arguments');
  await checkMigrations();
}
