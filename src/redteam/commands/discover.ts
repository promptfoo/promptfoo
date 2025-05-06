import type { Command } from 'commander';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getConfigFromCloud } from '../../util/cloud';
import type { TargetPurposeDiscoveryCommandOptions } from '../types';

export function discoverCommand(program: Command) {
  program
    .command('discover')
    .description(
      "Automatically discover a target application's purpose, enhancing attack probe efficacy.",
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
    .option('-t, --target <id>', 'Cloud provider target ID to run the scan on')
    .option('--env-path <path>', 'Path to a custom .env file')
    .option('-v, --verbose', 'Verbose output')
    .action(async (opts: TargetPurposeDiscoveryCommandOptions) => {
      // Set up the environment:
      setupEnv(opts.envPath);

      // Set up logging:
      if (opts.verbose) {
        setLogLevel('debug');
      }

      // Record telemetry:
      telemetry.record('command_used', {
        name: 'redteam run',
      });

      // TODO: Handle -t and -c
      //const configObj = await getConfigFromCloud(opts.config, opts.target);
    });
}
