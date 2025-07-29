import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import { fetchWithProxy } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import { API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { TestSuite, UnifiedConfig } from '../../types';
import { CallApiContextParams, CallApiOptionsParams } from '../../types/providers';
import { setupEnv } from '../../util';
import { resolveConfigs } from '../../util/config/load';

const SimbaCommandSchema = z.object({
  config: z.union([z.string(), z.array(z.string())]).optional(),
  goal: z.string(),
  purpose: z.string().optional(),
  maxRounds: z.number().optional(),
  maxVectors: z.number().optional(),
  email: z.string().email().optional(),
  additionalInstructions: z.string().optional(),
  sessionId: z.string().optional(),
  concurrency: z.number().min(1).max(100).optional(),
});

type SimbaCommandOptions = z.infer<typeof SimbaCommandSchema>;

const TargetInfoSchema = z.object({
  purpose: z.string().min(1),
  goal: z.string().min(1),
  additionalAttackInstructions: z.string().optional(),
});

const ConfigOptionsSchema = z.object({
  maxConversationRounds: z.number().min(1).default(10),
  maxAttackVectors: z.number().min(1).default(5),
});

const StartRequestSchema = z.object({
  config: ConfigOptionsSchema,
  targetInfo: TargetInfoSchema,
  email: z.string().email(),
});

interface SimbaStartResponse {
  sessionId: string;
}

interface SimbaNextRequest {
  requestedCount: number;
  responses: Record<string, string>;
  email: string;
}

interface BatchOperation {
  conversationId: string;
  nextQuestion: string;
  logMessage: string;
}

interface SimbaBatchResponse {
  operations: BatchOperation[];
  completed: boolean;
}

async function callSimbaApi(endpoint: string, data: any): Promise<any> {
  const host = cloudConfig.getApiHost() ?? API_HOST;
  const url = `${host}/api/v1/simba${endpoint}`;

  logger.debug(`Calling Simba API: ${url}`);
  logger.debug(`Request data: ${JSON.stringify(data)}`);

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Simba API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

async function runSimbaSession(options: SimbaCommandOptions, testSuite: TestSuite): Promise<void> {
  // Use the first provider from the config
  if (!testSuite.providers || testSuite.providers.length === 0) {
    throw new Error('No providers found in configuration. Please add at least one provider.');
  }

  const email = (await getUserEmail()) || options.email || 'demo@promptfoo.dev';
  const concurrency = options.concurrency || 1;

  logger.info(`Using provider from config`);
  const provider = testSuite.providers[0];
  logger.info(chalk.blue(`Concurrency: ${concurrency}`));

  let sessionId: string = options.sessionId || '';

  // If no session ID provided, start a new session
  if (!sessionId) {
    logger.info(chalk.cyan('Starting new Simba session...'));

    const startRequest: z.infer<typeof StartRequestSchema> = {
      targetInfo: {
        goal: options.goal,
        purpose: options.purpose || 'Red team testing',
        additionalAttackInstructions: options.additionalInstructions,
      },
      config: {
        maxConversationRounds: options.maxRounds || 20,
        maxAttackVectors: options.maxVectors || 5,
      },
      email,
    };

    try {
      const startResponse: SimbaStartResponse = await callSimbaApi('/start', startRequest);
      sessionId = startResponse.sessionId;
      logger.info(chalk.green(`Session started with ID: ${sessionId}`));
    } catch (error) {
      logger.error(`Failed to start session: ${error}`);
      throw error;
    }
  }

  // Main conversation loop
  let round = 0;
  let totalTokens = 0;
  let responses: Record<string, string> = {};
  const completedConversations = new Set<string>();

  let multipleZeroRoundRequests = 0;

  while (true) {
    if (multipleZeroRoundRequests > 10) {
      logger.error(
        "We are stuck in a loop and haven't received any operations in 10 rounds. Please check your configuration.",
      );
      break;
    }

    round++;
    logger.info(chalk.cyan(`\n--- Round ${round} ---`));

    try {
      // Request next batch of operations
      const nextRequest: SimbaNextRequest = {
        requestedCount: concurrency,
        responses,
        email,
      };

      const batchResponse: SimbaBatchResponse = await callSimbaApi(
        `/sessions/${sessionId}/next`,
        nextRequest,
      );

      logger.debug(`Next response: ${JSON.stringify(batchResponse)}`);

      if (batchResponse.completed) {
        logger.info(chalk.green('\nWe are DONE!'));
        break;
      }

      if (batchResponse.operations.length === 0) {
        multipleZeroRoundRequests++;
      }

      logger.info(`Received ${batchResponse.operations.length} operations`);

      responses = {};

      // Process all operations in parallel
      const providerCalls = batchResponse.operations.map(async (op) => {
        logger.info(chalk.yellow(`[${op.conversationId}] Simba: `) + op.nextQuestion);
        logger.info(chalk.gray(`[${op.conversationId}] ${op.logMessage}`));

        const context: CallApiContextParams = {
          prompt: { raw: op.nextQuestion, label: 'simba' },
          vars: { sessionId: op.conversationId },
        };

        const providerOptions: CallApiOptionsParams = {
          includeLogProbs: false,
        };

        try {
          const providerResponse = await provider.callApi(
            op.nextQuestion,
            context,
            providerOptions,
          );

          if (providerResponse.error) {
            logger.error(`[${op.conversationId}] Provider error: ${providerResponse.error}`);
            return null;
          }

          const responseContent = providerResponse.output || 'No response';
          logger.info(chalk.blue(`[${op.conversationId}] Target: `) + responseContent);

          // Store response for next round
          responses[op.conversationId] = responseContent;

          // Track token usage
          if (providerResponse.tokenUsage) {
            totalTokens += providerResponse.tokenUsage.total || 0;
          }

          return { conversationId: op.conversationId, response: responseContent };
        } catch (error) {
          logger.error(`[${op.conversationId}] Error calling provider: ${error}`);
          return null;
        }
      });

      await Promise.all(providerCalls);
    } catch (error) {
      logger.error(`Error in conversation round: ${error}`);
      logger.error(
        `You can try again and continue the session with the same session ID ${sessionId} using the -s flag.`,
      );
      break;
    }
  }

  // Summary
  logger.info(chalk.bold('\n=== Session Summary ==='));
  logger.info(`Session ID: ${sessionId}`);
  logger.info(`Total rounds: ${round}`);
  logger.info(`Total tokens used: ${totalTokens.toLocaleString()}`);
  logger.info(`Concurrency: ${concurrency}`);
  logger.info(`Conversations completed: ${completedConversations.size}`);
}

export function simbaCommand(program: Command, defaultConfig: Partial<UnifiedConfig>): void {
  program
    .command('simba', { hidden: true })
    .description('This feature is under development and not ready for use.')
    .option(
      '-c, --config <paths...>',
      'Path to configuration file (defaults to promptfooconfig.yaml)',
    )
    .requiredOption('-g, --goal <goal>', 'The goal/objective for the red team test')
    .option('-e, --email <email>', 'Email address for analytics')
    .option('--purpose <purpose>', 'Purpose of the target system', 'Red team testing')
    .option('--max-rounds <number>', 'Maximum conversation rounds', '20')
    .option('--max-vectors <number>', 'Maximum attack vectors to try', '5')
    .option('--additional-instructions <text>', 'Additional attack instructions')
    .option('-s, --session-id <id>', 'Session ID to continue')
    .option('-j, --concurrency <number>', 'Number of concurrent conversations (1-100)', '1')
    .action(async (opts: any) => {
      setupEnv(opts.envPath);

      try {
        // Validate options
        const validatedOpts = SimbaCommandSchema.parse({
          ...opts,
          maxRounds: opts.maxRounds ? parseInt(String(opts.maxRounds)) : undefined,
          maxVectors: opts.maxVectors ? parseInt(String(opts.maxVectors)) : undefined,
          concurrency: opts.concurrency ? parseInt(String(opts.concurrency)) : undefined,
        });

        // Load config like eval command does
        const { testSuite } = await resolveConfigs(opts, defaultConfig);

        // Run the Simba session
        await runSimbaSession(validatedOpts, testSuite);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
          process.exit(1);
        }
        logger.error(`Simba command failed: ${error}`);
        process.exit(1);
      }
    });
}
