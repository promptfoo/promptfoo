/**
 * Run Command Registration
 *
 * Registers the 'run' subcommand with Commander.
 */

import telemetry from '../../telemetry';
import type { Command } from 'commander';

import type { ScanOptions } from '../scanner/index';

/**
 * Register the run subcommand with Commander
 */
export function runCommand(program: Command): void {
  program
    .command('run')
    .description('Scan code changes for LLM security vulnerabilities')
    .argument('[repo-path]', 'Repository path to scan', '.')
    .option('--api-key <key>', 'Promptfoo API key for authentication')
    .option('--base <ref>', 'Base branch or commit to compare against')
    .option('--compare <ref>', 'Compare branch or commit')
    .option('-c, --config <path>', 'Path to config file')
    .option('--api-host <url>', 'Promptfoo API host URL (default: https://api.promptfoo.app)')
    .option('--diffs-only', 'Scan only PR diffs, skip filesystem exploration')
    .option('--json', 'Output results as JSON')
    .option('--github-pr <owner/repo#number>', 'GitHub PR to post comments to')
    .option('--min-severity <level>', 'Minimum severity level (low|medium|high|critical)')
    .option('--minimum-severity <level>', 'Alias for min-severity (low|medium|high|critical)')
    .option('--guidance <text>', 'Custom guidance for the security scan')
    .option('--guidance-file <path>', 'Path to file containing custom guidance')
    .action(async (repoPath: string, cmdObj: ScanOptions) => {
      telemetry.record('command_used', {
        name: 'code-scans run',
        diffsOnly: cmdObj.diffsOnly ?? false,
        hasGithubPr: !!cmdObj.githubPr,
        hasGuidance: !!(cmdObj.guidance || cmdObj.guidanceFile),
      });

      // lazy import so we only load the scanner's dependencies when needed
      const { executeScan } = await import('../scanner/index');

      await executeScan(repoPath, cmdObj);
    });
}
