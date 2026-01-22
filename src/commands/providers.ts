import chalk from 'chalk';
import logger from '../logger';
import { getDefaultProvidersWithInfo } from '../providers/defaults';
import telemetry from '../telemetry';
import { setupEnv } from '../util/index';
import type { Command } from 'commander';

/**
 * CLI command to display information about default provider selection.
 * Shows which provider is selected, why, and how to override.
 */
export function providersCommand(program: Command) {
  program
    .command('providers')
    .description('Show information about default provider configuration')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      telemetry.record('command_used', { name: 'providers' });

      const { selectionInfo } = await getDefaultProvidersWithInfo();

      const { selectedProvider, reason, detectedCredentials, skippedProviders, providerSlots } =
        selectionInfo;

      logger.info('');
      logger.info(chalk.bold('Default Provider Selection'));
      logger.info(chalk.gray('─'.repeat(25)));
      logger.info(`${chalk.bold('Selected:')} ${chalk.cyan(selectedProvider)}`);
      logger.info(`${chalk.bold('Reason:')} ${reason}`);

      // Detected credentials section
      logger.info('');
      logger.info(chalk.bold('Detected Credentials:'));
      const allCredentials = [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'MISTRAL_API_KEY',
        'GITHUB_TOKEN',
        'AZURE_OPENAI_API_KEY',
        'AZURE_CLIENT_CREDENTIALS',
        'GOOGLE_APPLICATION_CREDENTIALS',
      ];

      for (const cred of allCredentials) {
        const isDetected = detectedCredentials.includes(cred);
        const icon = isDetected ? chalk.green('✓') : chalk.gray('✗');
        const text = isDetected ? chalk.white(cred) : chalk.gray(cred);
        logger.info(`  ${icon} ${text}`);
      }

      // Skipped providers section (if any)
      if (skippedProviders.length > 0) {
        logger.info('');
        logger.info(chalk.bold('Skipped Providers:'));
        for (const { name, reason: skipReason } of skippedProviders) {
          logger.info(`  ${chalk.gray('-')} ${chalk.white(name)}: ${chalk.gray(skipReason)}`);
        }
      }

      // Provider assignments section
      logger.info('');
      logger.info(chalk.bold('Provider Assignments:'));

      const assignments: Array<{
        label: string;
        slot: { id: string; model?: string } | undefined;
      }> = [
        { label: 'Grading', slot: providerSlots.grading },
        { label: 'Grading JSON', slot: providerSlots.gradingJson },
        { label: 'Embedding', slot: providerSlots.embedding },
        { label: 'Moderation', slot: providerSlots.moderation },
        { label: 'Suggestions', slot: providerSlots.suggestions },
        { label: 'Synthesize', slot: providerSlots.synthesize },
        { label: 'LLM Rubric', slot: providerSlots.llmRubric },
        { label: 'Web Search', slot: providerSlots.webSearch },
      ];

      for (const { label, slot } of assignments) {
        if (slot) {
          const modelPart = slot.model ? chalk.gray(` (${slot.model})`) : '';
          logger.info(`  ${chalk.gray(label + ':')} ${chalk.white(slot.id)}${modelPart}`);
        }
      }

      // Override instructions
      logger.info('');
      logger.info(
        chalk.bold('Override:') +
          ' Set ' +
          chalk.cyan('defaultTest.options.provider') +
          ' in your promptfooconfig.yaml',
      );
      logger.info('');
    });
}
