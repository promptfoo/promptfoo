import chalk from 'chalk';
import { exec } from 'child_process';
import type { Command } from 'commander';
import promptSync from 'prompt-sync';
import { promisify } from 'util';
import { evaluate } from '../index';
import logger from '../logger';
import { PromptManager } from '../prompts/management/PromptManager';
import telemetry from '../telemetry';
import type { PromptTestOptions } from '../types/prompt-management';
import { readTests } from '../util/testCaseReader';

const execAsync = promisify(exec);
const promptUser = promptSync({ sigint: true });

export function promptCommand(program: Command) {
  const promptCmd = program
    .command('prompt')
    .description('Manage prompt templates with versioning and deployment');

  // Create a new prompt
  promptCmd
    .command('create <prompt-id>')
    .description('Create a new prompt template')
    .option('--desc <description>', 'Description of the prompt')
    .option('--from-file <file>', 'Initialize content from a supported file format')
    .action(async (promptId: string, cmdObj: { desc?: string; fromFile?: string }) => {
      telemetry.record('command_used', { name: 'prompt create' });

      const manager = new PromptManager();

      try {
        let content: string | undefined;
        const metadata: Record<string, any> = {};

        if (cmdObj.fromFile) {
          const fs = await import('fs/promises');
          const path = await import('path');
          const fileContent = await fs.readFile(cmdObj.fromFile, 'utf-8');
          const ext = path.extname(cmdObj.fromFile).toLowerCase();

          // Process content based on file type
          content = fileContent;
          metadata.sourceFile = path.basename(cmdObj.fromFile);

          if (ext === '.json' || ext === '.jsonl') {
            try {
              const parsed = JSON.parse(fileContent);
              if (Array.isArray(parsed)) {
                // Chat format or array of prompts
                content = JSON.stringify(parsed, null, 2);
                metadata.sourceType = 'json';
              }
            } catch {}
          } else if (ext === '.csv') {
            metadata.sourceType = 'csv';
            logger.info(
              chalk.yellow(
                'Note: CSV files can contain multiple prompts. Only the raw content will be stored.',
              ),
            );
          } else if (ext === '.yaml' || ext === '.yml') {
            metadata.sourceType = 'yaml';
          } else if (ext === '.j2') {
            metadata.sourceType = 'jinja2';
          } else if (ext === '.md') {
            metadata.sourceType = 'markdown';
          } else if (['.js', '.mjs', '.ts', '.py'].includes(ext)) {
            metadata.sourceType = ext.substring(1);
            logger.info(
              chalk.yellow(
                `Note: ${ext} files should export functions for dynamic prompt generation.`,
              ),
            );
          }

          logger.info(chalk.blue(`Loaded content from ${cmdObj.fromFile}`));
        } else {
          // Open editor for content
          const tempFile = `/tmp/promptfoo-prompt-${Date.now()}.txt`;
          const fs = await import('fs/promises');
          await fs.writeFile(tempFile, '');

          const editor = process.env.EDITOR || 'vi';
          await execAsync(`${editor} ${tempFile}`);

          content = await fs.readFile(tempFile, 'utf-8');
          await fs.unlink(tempFile);
        }

        await manager.createPrompt(promptId, cmdObj.desc, content);
        logger.info(chalk.green(`Created prompt "${promptId}" (version 1)`));
        if (metadata.sourceFile) {
          logger.info(
            chalk.blue(`Source: ${metadata.sourceFile} (${metadata.sourceType || 'text'})`),
          );
        }
      } catch (error) {
        logger.error(chalk.red(`Failed to create prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // List all prompts
  promptCmd
    .command('list')
    .description('List all prompt templates')
    .option('--all', 'Show all versions')
    .action(async (cmdObj: { all?: boolean }) => {
      telemetry.record('command_used', { name: 'prompt list' });

      const manager = new PromptManager();

      try {
        const prompts = await manager.listPrompts();

        if (prompts.length === 0) {
          logger.info('No prompts found');
          return;
        }

        // Table header
        console.log('\nID'.padEnd(25) + 'Description'.padEnd(40) + 'Latest Version   Deployed');
        console.log('-'.repeat(90));

        for (const prompt of prompts) {
          const row =
            prompt.id.padEnd(25) +
            (prompt.description || '').padEnd(40).substring(0, 40) +
            `v${prompt.currentVersion}`.padEnd(17);

          // TODO: Add deployment info
          console.log(row);
        }
      } catch (error) {
        logger.error(chalk.red(`Failed to list prompts: ${error}`));
        process.exitCode = 1;
      }
    });

  // Show prompt details
  promptCmd
    .command('show <prompt-id>')
    .description('Display prompt content and metadata')
    .option('--version <number>', 'Show specific version')
    .action(async (promptId: string, cmdObj: { version?: string }) => {
      telemetry.record('command_used', { name: 'prompt show' });

      const manager = new PromptManager();

      try {
        const prompt = await manager.getPrompt(promptId);

        if (!prompt) {
          logger.error(chalk.red(`Prompt "${promptId}" not found`));
          process.exitCode = 1;
          return;
        }

        const targetVersion = cmdObj.version
          ? Number.parseInt(cmdObj.version)
          : prompt.currentVersion;
        const version = prompt.versions.find((v) => v.version === targetVersion);

        if (!version) {
          logger.error(chalk.red(`Version ${targetVersion} not found`));
          process.exitCode = 1;
          return;
        }

        console.log(chalk.bold(`\nPrompt: ${prompt.id}`));
        if (prompt.description) {
          console.log(`Description: ${prompt.description}`);
        }
        console.log(
          `Version: ${version.version} (created ${version.createdAt.toISOString()} by ${version.author})`,
        );
        if (version.notes) {
          console.log(`Notes: ${version.notes}`);
        }
        console.log('\nContent:');
        console.log('-'.repeat(50));
        console.log(version.content);
        console.log('-'.repeat(50));
      } catch (error) {
        logger.error(chalk.red(`Failed to show prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // Edit a prompt
  promptCmd
    .command('edit <prompt-id>')
    .description('Edit prompt content to create a new version')
    .option('--version <number>', 'Edit from a specific version')
    .action(async (promptId: string, cmdObj: { version?: string }) => {
      telemetry.record('command_used', { name: 'prompt edit' });

      const manager = new PromptManager();

      try {
        const prompt = await manager.getPrompt(promptId);

        if (!prompt) {
          logger.error(chalk.red(`Prompt "${promptId}" not found`));
          process.exitCode = 1;
          return;
        }

        const targetVersion = cmdObj.version
          ? Number.parseInt(cmdObj.version)
          : prompt.currentVersion;
        const version = prompt.versions.find((v) => v.version === targetVersion);

        if (!version) {
          logger.error(chalk.red(`Version ${targetVersion} not found`));
          process.exitCode = 1;
          return;
        }

        // Open editor with existing content
        const tempFile = `/tmp/promptfoo-prompt-${Date.now()}.txt`;
        const fs = await import('fs/promises');
        await fs.writeFile(tempFile, version.content);

        const editor = process.env.EDITOR || 'vi';
        await execAsync(`${editor} ${tempFile}`);

        const newContent = await fs.readFile(tempFile, 'utf-8');
        await fs.unlink(tempFile);

        // Check if content changed
        if (newContent === version.content) {
          logger.info('No changes detected');
          return;
        }

        // Get version notes
        const notes = promptUser('Enter version notes: ');

        const result = await manager.updatePrompt(promptId, newContent, notes);
        logger.info(chalk.green(`Successfully saved ${promptId} version ${result.currentVersion}`));
      } catch (error) {
        logger.error(chalk.red(`Failed to edit prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // Diff prompt versions
  promptCmd
    .command('diff <prompt-id> [versionA] [versionB]')
    .description('Show differences between prompt versions')
    .action(async (promptId: string, versionA?: string, versionB?: string) => {
      telemetry.record('command_used', { name: 'prompt diff' });

      const manager = new PromptManager();

      try {
        const diff = await manager.diffPromptVersions(
          promptId,
          versionA ? Number.parseInt(versionA) : undefined,
          versionB ? Number.parseInt(versionB) : undefined,
        );

        console.log(diff);
      } catch (error) {
        logger.error(chalk.red(`Failed to diff prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // Deploy prompt version
  promptCmd
    .command('deploy <prompt-id> <environment>')
    .description('Deploy a prompt version to an environment')
    .option('--version <number>', 'Version to deploy (default: latest)')
    .action(async (promptId: string, environment: string, cmdObj: { version?: string }) => {
      telemetry.record('command_used', { name: 'prompt deploy' });

      const manager = new PromptManager();

      try {
        await manager.deployPrompt(
          promptId,
          environment,
          cmdObj.version ? Number.parseInt(cmdObj.version) : undefined,
        );

        logger.info(chalk.green(`Deployed ${promptId} to ${environment}`));
      } catch (error) {
        logger.error(chalk.red(`Failed to deploy prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // Test prompt
  promptCmd
    .command('test <prompt-id>')
    .description('Run evaluation tests on a prompt')
    .option('-t, --tests <file>', 'Path to test cases file')
    .option('--provider <provider>', 'Provider to test with')
    .option('--version <number>', 'Version to test (default: latest)')
    .option('-o, --output <path>', 'Output file for results')
    .action(async (promptId: string, cmdObj: PromptTestOptions & { output?: string }) => {
      telemetry.record('command_used', { name: 'prompt test' });

      const manager = new PromptManager();

      try {
        const prompt = await manager.getPrompt(promptId);

        if (!prompt) {
          logger.error(chalk.red(`Prompt "${promptId}" not found`));
          process.exitCode = 1;
          return;
        }

        const targetVersion = cmdObj.version || prompt.currentVersion;
        const version = prompt.versions.find((v) => v.version === targetVersion);

        if (!version) {
          logger.error(chalk.red(`Version ${targetVersion} not found`));
          process.exitCode = 1;
          return;
        }

        if (!cmdObj.testFile) {
          logger.error(chalk.red('Test file required. Use -t or --tests flag'));
          process.exitCode = 1;
          return;
        }

        // Load tests
        const tests = await readTests(cmdObj.testFile);

        // Run evaluation
        logger.info(`Running tests on ${promptId} version ${targetVersion}...`);

        const evalResult = await evaluate({
          prompts: [{ raw: version.content, label: `${promptId}:${targetVersion}` }],
          providers: cmdObj.provider ? [cmdObj.provider] : ['openai:gpt-4'],
          tests,
          outputPath: cmdObj.output,
        });

        // Display summary
        const summary = await evalResult.toEvaluateSummary();
        const stats = 'stats' in summary ? summary.stats : evalResult.getStats();

        logger.info('\nEvaluation Summary:');
        logger.info(`Total tests: ${stats.successes + stats.failures + stats.errors}`);
        logger.info(`Passed: ${stats.successes}`);
        logger.info(`Failed: ${stats.failures}`);
      } catch (error) {
        logger.error(chalk.red(`Failed to test prompt: ${error}`));
        process.exitCode = 1;
      }
    });

  // Delete prompt
  promptCmd
    .command('delete <prompt-id>')
    .description('Delete a prompt (use with caution)')
    .option('--force', 'Skip confirmation')
    .action(async (promptId: string, cmdObj: { force?: boolean }) => {
      telemetry.record('command_used', { name: 'prompt delete' });

      if (!cmdObj.force) {
        const confirmation = promptUser(
          `Are you sure you want to delete prompt "${promptId}"? (y/N) `,
        );
        if (confirmation.toLowerCase() !== 'y') {
          logger.info('Deletion cancelled');
          return;
        }
      }

      const manager = new PromptManager();

      try {
        await manager.deletePrompt(promptId);
        logger.info(chalk.green(`Deleted prompt "${promptId}"`));
      } catch (error) {
        logger.error(chalk.red(`Failed to delete prompt: ${error}`));
        process.exitCode = 1;
      }
    });
}
