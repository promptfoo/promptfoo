import { Command } from 'commander';
import fs from 'node:fs/promises';

import { loadEval } from '../io/loadEval';
import { computeDiff } from '../diff/computeDiff';
import { renderHtml } from '../diff/renderHtml';
import { getBaselinePointer, setBaselinePointer } from '../baseline/pointer';
import { resolveInputAlias } from '../resolveInputAlias';

// NOTE: export a function that ACCEPTS the root program
export function diffCommand(program: Command) {
  program
    .command('diff')
    .description('Compare two eval runs')
    .option('--from <pathOrAlias>', 'Baseline (JSON/dir or @baseline/@last)')
    .requiredOption('--to <pathOrAlias>', 'Candidate (JSON/dir or @last)')
    .option('--pin-baseline', 'Pin the chosen --from as the default baseline', false)
    .option('--html <file>', 'Write HTML report')
    .option('--json', 'Write JSON diff to stdout')
    .action(async (opts) => {
      const toPath = await resolveInputAlias(opts.to);
      const resolvedFrom = await resolveInputAlias(opts.from);
      const fromPath = resolvedFrom ?? (await getBaselinePointer('global'));

      if (!toPath) {
        throw new Error('Missing --to <path|@last>.');
      }
      if (!fromPath) {
        throw new Error(
          'No baseline provided and no pinned baseline found.\n' +
          'Pass --from <path|@last> or run: promptfoo baseline set <path>'
        );
      }

      if (opts.pinBaseline) {
        await setBaselinePointer(fromPath);
      }

      const from = await loadEval(fromPath);
      const to   = await loadEval(toPath);

      const diff = computeDiff(from, to, {});
      if (opts.json) {
        process.stdout.write(JSON.stringify(diff, null, 2) + '\n');
        return;
      }
      if (opts.html) {
        await fs.writeFile(opts.html, renderHtml(diff), 'utf8');
        console.log(`wrote ${opts.html}`);
        return;
      }
      console.log(`Compared ${diff.summary.totalCompared}; changed ${diff.summary.changedCount}`);
      console.log('Tip: use --html diff.html for a full report');
    });
}
