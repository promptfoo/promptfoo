import { Command } from 'commander';
import { setBaselinePointer, getBaselinePointer, clearBaselinePointer } from '../baseline/pointer';
import { setLastRunPointer, getLastRunPointer } from '../store/lastRun';

// NOTE: export a function that ACCEPTS the root program
export function baselineCommand(program: Command) {
  const cmd = program.command('baseline').description('Manage pinned baseline and @last pointer');

  cmd.command('set')
    .argument('<file>', 'Path to baseline results (JSON or directory)')
    .action(async (file) => {
      await setBaselinePointer(file);
      console.log(`Pinned baseline -> ${file}`);
    });

  cmd.command('show')
    .description('Show current pinned baseline')
    .action(async () => {
      console.log((await getBaselinePointer()) ?? '(none)');
    });

  cmd.command('clear')
    .description('Clear pinned baseline')
    .action(async () => {
      await clearBaselinePointer();
      console.log('Cleared baseline');
    });

  // Helpers for @last
  cmd.command('last-set')
    .argument('<file>', 'Mark a results file/dir as @last')
    .action(async (file) => {
      await setLastRunPointer(file);
      console.log(`Set @last -> ${file}`);
    });

  cmd.command('last-show')
    .description('Show the current @last pointer')
    .action(async () => {
      console.log((await getLastRunPointer()) ?? '(none)');
    });
}
