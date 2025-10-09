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
import { extractPromptsFromFile } from '../extraction/promptExtractor';

interface ExtractCommandOptions {
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
    .command('extract <file>')
    .description('Extract prompts from source files and generate red team configuration')
    .option('-o, --output <path>', 'Output path for red team config', 'redteam.yaml')
    .option('--purpose <description>', 'System purpose (auto-detected if not provided)')
    .option('--plugins <plugins>', 'Comma-separated plugin IDs')
    .option('--strategies <strategies>', 'Comma-separated strategy IDs')
    .option('--provider <provider>', 'Target provider (e.g., openai:gpt-4o-mini)')
    .option('--interactive', 'Interactive mode for selections')
    .option('--min-confidence <number>', 'Minimum confidence threshold (0-1)', '0.6')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (file: string, cmdObj: ExtractCommandOptions) => {
      // Track telemetry
      telemetry.record('command_used', {
        name: 'extract',
        interactive: !!cmdObj.interactive,
      });

      try {
        // Validate file exists
        if (!fs.existsSync(file)) {
          logger.error(`Error: File not found: ${file}`);
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

        // Extract prompts from file
        const prompts = await extractPromptsFromFile(file, provider, minConfidence);

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

        // Display extraction summary
        const summary = generateExtractionSummary(prompts);
        logger.info(summary);

        // Interactive mode: let user select prompts
        let selectedPrompts = prompts;
        if (cmdObj.interactive && prompts.length > 1) {
          logger.info(chalk.cyan('🎯 Select prompts to include in red team configuration:\n'));

          const choices = prompts.map((p, i) => {
            const fileName = path.basename(p.location.file);
            const location = `${fileName}:${p.location.line}`;
            const typeLabel = p.type === 'composed' ? chalk.blue(' [COMPOSED]') : '';
            const roleLabel = p.role && !p.type ? ` [${p.role}]` : '';
            const providerLabel = p.apiProvider ? ` (${p.apiProvider})` : '';
            const confidenceLabel = ` - ${(p.confidence * 100).toFixed(0)}%`;

            // Format display content based on type
            let displayContent: string;
            if (p.type === 'composed' && p.messages) {
              // Show message count and first message preview
              const msgCount = p.messages.length;
              const firstMsg = p.messages[0];
              const preview = firstMsg.content
                .substring(0, 60)
                .replace(/\n/g, ' ')
                .replace(/\s+/g, ' ');
              displayContent = `${msgCount} messages: ${firstMsg.role}: ${preview}...`;
            } else {
              // Truncate content for display, preserving readability
              const maxContentLength = 80;
              displayContent = p.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
              if (displayContent.length > maxContentLength) {
                displayContent = displayContent.substring(0, maxContentLength) + '...';
              }
            }

            return {
              name: `${location}${typeLabel}${roleLabel}${providerLabel}${confidenceLabel}\n  ${chalk.gray(displayContent)}`,
              value: i,
              checked: true,
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
          selectedPrompts = selectedIndices.map((idx) => prompts[idx]);
          logger.info(
            chalk.green(
              `\n✓ Selected ${selectedPrompts.length} prompt${selectedPrompts.length !== 1 ? 's' : ''}\n`,
            ),
          );
        }

        // Detect variables
        const totalVariables = selectedPrompts.reduce((sum, p) => sum + p.variables.length, 0);
        if (totalVariables > 0) {
          logger.info(
            chalk.cyan(
              `✓ Detected ${totalVariables} template variable${totalVariables !== 1 ? 's' : ''}\n`,
            ),
          );
        }

        // Generate config
        logger.info(chalk.cyan('🔧 Generating red team configuration...\n'));

        const config = await generateRedTeamConfig(
          selectedPrompts,
          {
            purpose: cmdObj.purpose,
            plugins,
            strategies,
            provider: cmdObj.provider,
            output: cmdObj.output,
          },
          provider,
        );

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
