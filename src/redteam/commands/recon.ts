import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { doRecon } from './recon/index';
import type { Command } from 'commander';

const COMMAND = 'recon';

const ArgsSchema = z.object({
  dir: z.string().optional(),
  output: z.string().optional(),
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().optional(),
  yes: z.boolean().optional(),
  exclude: z.array(z.string()).optional(),
  open: z.boolean().optional(),
});

/**
 * Registers the `recon` command with the CLI
 */
export function reconCommand(program: Command): void {
  program
    .command(COMMAND)
    .description(
      dedent`
        Perform reconnaissance on a codebase to discover application context for red team attack planning.

        Uses OpenAI Codex SDK or Claude Agent SDK to analyze source code and extract
        information about the application's purpose, security boundaries, and attack surface.

        The agent can read files, search the web for documentation, and take notes in a scratchpad.

        Examples:
          $ promptfoo redteam recon
          $ promptfoo redteam recon --dir ./my-agent
          $ promptfoo redteam recon --provider anthropic -o config.yaml
      `,
    )
    .option('-d, --dir <path>', 'Local directory to scan', process.cwd())
    .option('-o, --output <path>', 'Output config file path', 'promptfooconfig.yaml')
    .option('--provider <provider>', 'Force provider (openai or anthropic)')
    .option('-m, --model <model>', 'Override default model')
    .option('-y, --yes', 'Skip confirmation prompts', false)
    .option('--exclude <patterns...>', 'Additional glob patterns to exclude')
    .option('--no-open', 'Do not open browser after analysis')
    // Note: --verbose and --env-file are added automatically by addCommonOptionsRecursively
    .action(async (rawArgs) => {
      telemetry.record('command_used', { name: `redteam ${COMMAND}` });
      telemetry.record('redteam recon', {});

      const { success, data: args, error } = ArgsSchema.safeParse(rawArgs);
      if (!success) {
        logger.error('Invalid options:');
        error.issues.forEach((issue) => {
          logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
        });
        process.exitCode = 1;
        return;
      }

      try {
        await doRecon(args);
      } catch (err) {
        logger.error(`Recon failed: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}
