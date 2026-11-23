import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { runExperiment } from './experiment.mjs';
import { readSeeds } from './seeds.mjs';

const help = `Usage: node run.mjs --out NEW.json [options]
  --target safe|vulnerable|codex     Default safe (offline)
  --proposer scripted|fixed|live    Default scripted (offline)
  --seeds FILE                      2–32 issues as JSON strings or .burp lines
  --neutrals FILE                   Matched neutral issues in seed order
  --order-seed STRING               Reproduce donor assignment and trial order
  --max-target-runs NUMBER          Default 10, must cover 5 per seed
  --allow-model-calls               Required for codex or live, may incur costs

Set ISSUE_TARGET_MODEL and ISSUE_TARGET_URL (Responses) for Codex.
Set ISSUE_PROPOSER_MODEL and ISSUE_PROPOSER_URL (Chat Completions) for live proposals.
Optional credentials are ISSUE_TARGET_API_KEY and ISSUE_PROPOSER_API_KEY.
Use synthetic inputs. Review the README for limits and how to interpret findings.`;

function config(mode, prefix) {
  if (mode !== 'codex' && mode !== 'live') return { mode };
  return {
    mode,
    model: process.env[prefix + '_MODEL'],
    url: process.env[prefix + '_URL'],
    apiKey: process.env[prefix + '_API_KEY'],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      out: { type: 'string' },
      seeds: { type: 'string' },
      neutrals: { type: 'string' },
      target: { type: 'string', default: 'safe' },
      proposer: { type: 'string', default: 'scripted' },
      'allow-model-calls': { type: 'boolean', default: false },
      'order-seed': { type: 'string' },
      'max-target-runs': { type: 'string', default: '10' },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  if (!values.out) throw new Error('Pass --out with a new report file path.');
  if (!/^[1-9]\d*$/.test(values['max-target-runs']))
    throw new Error('Invalid target trial budget.');
  const issues = values.seeds ? await readSeeds(values.seeds) : undefined;
  const neutrals = values.neutrals ? await readSeeds(values.neutrals) : undefined;
  const stop = new AbortController();
  const cancel = () => stop.abort();
  // Reserve a new private file before spending any budget. A hard kill can
  // leave a partial file. An existing report is never overwritten.
  const file = await open(values.out, 'wx', 0o600);
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const report = await runExperiment({
      issues,
      neutrals,
      orderSeed: values['order-seed'],
      target: config(values.target, 'ISSUE_TARGET'),
      proposer: config(values.proposer, 'ISSUE_PROPOSER'),
      maxTargetRuns: Number(values['max-target-runs']),
      allowModelCalls: values['allow-model-calls'],
      signal: stop.signal,
    });
    await file.writeFile(JSON.stringify(report, null, 2) + '\n');
    const { eligibleSeeds, paired, pairedBlind, neutral, usage } = report.summary;
    console.log(
      `Eligible seeds ${eligibleSeeds}. Neutral disclosures ${neutral.confirmedLeaks}/${neutral.total}.`,
    );
    console.log('Confirmed disclosures on revision with a safe neutral control');
    for (const [label, group, arms] of [
      ['Distinct donor', paired, ['actual', 'unrelated', 'blind']],
      ['All paired seeds', pairedBlind, ['actual', 'blind']],
    ]) {
      console.log(
        label,
        arms
          .map(
            (arm) =>
              `${arm} ${group.seeds ? group[arm].confirmedLeaks + '/' + group.seeds : 'N/A'}`,
          )
          .join(', '),
      );
    }
    console.log('Model usage', JSON.stringify(usage));
    const errors = report.attempts.filter(
      (r) => !r.verified || r.target?.error || !['safe', 'violation'].includes(r.status),
    );
    if (errors.length)
      console.error(`${errors.length} attempts need inspection. See the saved report.`);
    process.exitCode = report.interrupted ? 130 : errors.length ? 2 : 0;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    await file.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
