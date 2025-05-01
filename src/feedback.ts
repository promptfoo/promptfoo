import chalk from 'chalk';
import dedent from 'dedent';
import readline from 'readline';
import { fetchWithProxy } from './fetch';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';

/**
 * Send feedback to the promptfoo API
 */
export async function sendFeedback(feedback: string) {
  if (!feedback.trim()) {
    return;
  }

  try {
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
      logger.info(chalk.green('Feedback sent. Thank you!'));
    } else {
      logger.info(
        chalk.yellow('Failed to send feedback. Please try again or open an issue on GitHub.'),
      );
    }
  } catch {
    logger.error('Network error while sending feedback');
  }
}

/**
 * Simple readline prompt that returns a promise
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Gather and send user feedback
 */
export async function gatherFeedback(message?: string) {
  // If message is provided directly, send it without prompting
  if (message) {
    await sendFeedback(message);
    return;
  }

  try {
    // Get user email if logged in
    const userEmail = getUserEmail();

    console.log(chalk.blue.bold('\n📝 promptfoo Feedback'));
    console.log(chalk.dim('─'.repeat(40)));

    // Get feedback message
    const feedbackText = await prompt(
      dedent`
      ${chalk.gray('Share your thoughts, bug reports, or feature requests:')}
      ${chalk.bold('> ')}
      `,
    );

    if (!feedbackText.trim()) {
      console.log(chalk.yellow('No feedback provided.'));
      return;
    }

    // Get contact info if not logged in
    let finalFeedback = feedbackText;
    let contactInfo = '';

    if (userEmail) {
      contactInfo = userEmail;
    } else {
      const contactResponse = await prompt(
        chalk.gray("Email address (optional, if you'd like a response): "),
      );
      contactInfo = contactResponse.trim();
    }

    // Add contact info to feedback if provided
    if (contactInfo) {
      finalFeedback = `${feedbackText}\n\nContact: ${contactInfo}`;
    }

    await sendFeedback(finalFeedback);
  } catch {
    logger.error('Error gathering feedback');
  }
}
