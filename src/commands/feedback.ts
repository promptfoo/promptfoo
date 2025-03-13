import type { Command } from 'commander';
import { gatherFeedback } from '../feedback';

export function feedbackCommand(program: Command) {
  program
    .command('feedback [message]')
    .description('Send feedback to the promptfoo developers')
    .action((message?: string) => {
      gatherFeedback(message);
    });
}
