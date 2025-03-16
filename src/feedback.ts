import readline from 'readline';
import { fetchWithProxy } from './fetch';
import logger from './logger';

export async function sendFeedback(feedback: string) {
  const resp = await fetchWithProxy('https://api.promptfoo.dev/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: feedback,
    }),
  });

  if (resp.ok) {
    logger.info('Feedback sent. Thank you!');
  } else {
    logger.info(
      'Sorry, feedback failed to send for some reason. You can also open an issue at https://github.com/promptfoo/promptfoo/issues/new',
    );
  }
}

export function gatherFeedback(message?: string) {
  if (message) {
    sendFeedback(message);
  } else {
    const reader = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    reader.on('keypress', (str, key) => {
      if (key.name === 'enter' && key.shift) {
        reader.write('\n');
      }
    });

    reader.question(
      '\n\nPlease enter your feedback. Leave your email address if you want to hear back:\n\n> ',
      (input: string) => {
        reader.close();
        sendFeedback(input);
      },
    );
  }
}
