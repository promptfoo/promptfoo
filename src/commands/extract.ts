import * as fs from 'fs';
import * as path from 'path';
import checkbox from '@inquirer/checkbox';
import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import logger from '../logger';
import { redteamProviderManager } from '../redteam/providers/shared';
import telemetry from '../telemetry';
import { generateExtractionSummary, generateRedTeamConfig } from '../extraction/configGenerator';
import { extractPromptsFromDiff } from '../extraction/diffParser';
import { extractPromptsFromFile, detectSimilarPrompts } from '../extraction/promptExtractor';
import type { ExtractedPrompt } from '../extraction/types';

interface ExtractCommandOptions {
  diff?: string;
  output?: string;
  purpose?: string;
  plugins?: string;
  strategies?: string;
  provider?: string;
  interactive?: boolean;
  minConfidence?: string;
  envPath?: string;
}

export function extractCommand(program: Command) {
  program
    .command('extract [file]')
    .description('Extract prompts from source files and generate red team configuration')
    .option('--diff <source>', 'Extract from git diff (commit range or diff file)')
    .option('-o, --output <path>', 'Output path for red team config', 'redteam.yaml')
    .option('--purpose <description>', 'System purpose (auto-detected if not provided)')
    .option('--plugins <plugins>', 'Comma-separated plugin IDs')
    .option('--strategies <strategies>', 'Comma-separated strategy IDs')
    .option('--provider <provider>', 'Target provider (e.g., openai:gpt-4o-mini)')
    .option('--interactive', 'Interactive mode for selections')
    .option('--min-confidence <number>', 'Minimum confidence threshold (0-1)', '0.6')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (file: string | undefined, cmdObj: ExtractCommandOptions) => {
      // Track telemetry
      telemetry.record('command_used', {
        name: 'extract',
        hasFile: !!file,
        hasDiff: !!cmdObj.diff,
        interactive: !!cmdObj.interactive,
      });

      try {
        // Validate inputs
        if (!file && !cmdObj.diff) {
          logger.error('Error: Either a file path or --diff option is required');
          logger.info('Usage: promptfoo extract <file> [options]');
          logger.info('   or: promptfoo extract --diff <commit-range> [options]');
          process.exitCode = 1;
          return;
        }

        if (file && cmdObj.diff) {
          logger.error('Error: Cannot specify both file and --diff option');
          process.exitCode = 1;
          return;
        }

        // Parse options
        const minConfidence = parseFloat(String(cmdObj.minConfidence || '0.6'));
        if (Number.isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
          logger.error('Error: --min-confidence must be between 0 and 1');
          process.exitCode = 1;
          return;
        }

        const plugins = cmdObj.plugins ? cmdObj.plugins.split(',').map((s) => s.trim()) : undefined;
        const strategies = cmdObj.strategies
          ? cmdObj.strategies.split(',').map((s) => s.trim())
          : undefined;

        logger.info(chalk.cyan('🔍 Extracting prompts from source code...\n'));

        // Get LLM provider for extraction
        logger.debug('[extract] Getting LLM provider for extraction');
        const provider = await redteamProviderManager.getProvider({
          jsonOnly: true,
          preferSmallModel: false,
        });
        logger.info(`Using ${provider.id()} for prompt extraction\n`);

        // Extract prompts
        let prompts: ExtractedPrompt[];

        if (cmdObj.diff) {
          // Extract from diff
          const changes = await extractPromptsFromDiff(cmdObj.diff, provider, minConfidence);
          prompts = changes.map((c) => c.prompt);

          if (changes.length === 0) {
            logger.info(chalk.yellow('No prompts found in diff'));
            return;
          }

          logger.info(
            chalk.green(
              `✓ Found ${prompts.length} prompt${prompts.length !== 1 ? 's' : ''} in diff\n`,
            ),
          );
        } else if (file) {
          // Validate file exists
          if (!fs.existsSync(file)) {
            logger.error(`Error: File not found: ${file}`);
            process.exitCode = 1;
            return;
          }

          // Extract from file
          prompts = await extractPromptsFromFile(file, provider, minConfidence);

          if (prompts.length === 0) {
            logger.info(chalk.yellow(`No prompts found in ${file}`));
            logger.info(
              dedent`
              Try:
              - Lowering --min-confidence (current: ${minConfidence})
              - Checking if the file contains LLM API calls
              - Using a supported file type (.js, .ts, .py)
            `,
            );
            return;
          }

          logger.info(
            chalk.green(`✓ Found ${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}\n`),
          );
        } else {
          throw new Error('Internal error: no file or diff specified');
        }

        // Display extraction summary
        const summary = generateExtractionSummary(prompts);
        logger.info(summary);

        // Detect similar prompts for deduplication
        const promptsWithSimilarity = detectSimilarPrompts(prompts, 0.85);
        const duplicates = promptsWithSimilarity.filter((p) => p.isDuplicate);

        if (duplicates.length > 0) {
          logger.warn(
            chalk.yellow(
              `\n⚠️  Detected ${duplicates.length} duplicate prompt${duplicates.length !== 1 ? 's' : ''}`,
            ),
          );
          if (cmdObj.interactive) {
            logger.info(
              chalk.gray(
                'Duplicates are unselected by default. You can review and select them if needed.\n',
              ),
            );
          }
        }

        // Interactive mode: let user select prompts
        if (cmdObj.interactive && prompts.length > 1) {
          logger.info(chalk.cyan('🎯 Select prompts to include in red team configuration:\n'));

          const choices = promptsWithSimilarity.map((p, i) => {
            const fileName = path.basename(p.location.file);
            const location = `${fileName}:${p.location.line}`;
            const roleLabel = p.role ? ` [${p.role}]` : '';
            const providerLabel = p.apiProvider ? ` (${p.apiProvider})` : '';
            const confidenceLabel = ` - ${(p.confidence * 100).toFixed(0)}%`;

            // Add duplicate indicator
            const duplicateLabel = p.isDuplicate ? chalk.red(' [DUPLICATE]') : '';

            // Truncate content for display, preserving readability
            const maxContentLength = 80;
            let displayContent = p.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            if (displayContent.length > maxContentLength) {
              displayContent = displayContent.substring(0, maxContentLength) + '...';
            }

            return {
              name: `${location}${roleLabel}${providerLabel}${confidenceLabel}${duplicateLabel}\n  ${chalk.gray(displayContent)}`,
              value: i,
              checked: !p.isDuplicate, // Uncheck duplicates by default
            };
          });

          const selectedIndices = await checkbox({
            message: 'Select prompts to include (space to toggle, enter to confirm):',
            choices,
            pageSize: 10,
            loop: false,
          });

          if (selectedIndices.length === 0) {
            logger.warn(chalk.yellow('No prompts selected. Exiting.'));
            return;
          }

          // Filter prompts based on selection
          prompts = selectedIndices.map((idx) => prompts[idx]);
          logger.info(
            chalk.green(
              `\n✓ Selected ${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}\n`,
            ),
          );
        } else if (!cmdObj.interactive && duplicates.length > 0) {
          // Non-interactive mode: auto-filter duplicates
          const originalCount = prompts.length;
          prompts = promptsWithSimilarity.filter((p) => !p.isDuplicate);
          logger.info(
            chalk.green(
              `✓ Automatically filtered ${originalCount - prompts.length} duplicate${originalCount - prompts.length !== 1 ? 's' : ''}, keeping ${prompts.length} unique prompt${prompts.length !== 1 ? 's' : ''}\n`,
            ),
          );
        }

        // Detect variables
        const totalVariables = prompts.reduce((sum, p) => sum + p.variables.length, 0);
        if (totalVariables > 0) {
          logger.info(
            chalk.cyan(
              `✓ Detected ${totalVariables} template variable${totalVariables !== 1 ? 's' : ''}\n`,
            ),
          );
        }

        // Generate config
        logger.info(chalk.cyan('🔧 Generating red team configuration...\n'));

        const config = await generateRedTeamConfig(prompts, {
          purpose: cmdObj.purpose,
          plugins,
          strategies,
          provider: cmdObj.provider,
          output: cmdObj.output,
        });

        // Write config to file
        const outputPath = path.resolve(cmdObj.output || 'redteam.yaml');
        await fs.promises.writeFile(outputPath, config, 'utf-8');

        logger.info(chalk.green(`✓ Configuration written to ${outputPath}\n`));

        // Display next steps
        logger.info(
          chalk.bold(
            dedent`
            Next steps:
              1. Review the generated config: ${chalk.cyan(outputPath)}
              2. Run the security tests: ${chalk.cyan(`promptfoo eval -c ${outputPath}`)}
              3. View results: ${chalk.cyan('promptfoo view')}
          `,
          ),
        );
      } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}
