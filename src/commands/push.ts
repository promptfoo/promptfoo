import type { Command } from 'commander';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

export function pushCommand(program: Command) {
  program
    .command('push')
    .description('Push a prompt to the remote server')
    .option('--id <id>', 'Unique identifier for the prompt')
    .option('--type <type>', 'Type of the prompt (default: "prompt")')
    .option('--label <labels...>', 'Labels for the prompt')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .argument('<file>', 'Path to the prompt file')
    .action(
      async (
        file: string,
        options: { id?: string; type?: string; label?: string[]; envPath?: string },
      ) => {
        setupEnv(options.envPath);
        telemetry.record('command_used', { name: 'push' });
        await telemetry.send();

        if (!options.id) {
          logger.error('You must provide an --id for the prompt');
          process.exit(1);
        }

        const filePath = path.resolve(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
          logger.error(`File not found: ${filePath}`);
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const type = options.type || 'prompt';
        const labels = options.label || [];

        try {
          const response = await fetch(`http://localhost:15500/api/prompts/${options.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type,
              labels,
              content,
            }),
          });

          if (response.status === 201) {
            logger.info(`Prompt "${options.id}" pushed successfully`);
          } else {
            const errorData = await response.json();
            logger.error(`Failed to push prompt: ${errorData.error || 'Unknown error'}`);
          }
        } catch (error) {
          logger.error(`Error pushing prompt: ${error}`);
          process.exit(1);
        }
      },
    );
}
