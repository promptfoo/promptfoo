import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { CallApiContextParams, CallApiOptionsParams, UnifiedConfig, TestSuite } from '../types';
import { setupEnv } from '../util';
import { fetchWithProxy } from '../fetch';
import { resolveConfigs } from '../util/config/load';
import { getUserEmail } from '../globalConfig/accounts';

const SimbaCommandSchema = z.object({
  config: z.union([z.string(), z.array(z.string())]).optional(),
  goal: z.string(),
  purpose: z.string().optional(),
  maxRounds: z.number().optional(),
  maxVectors: z.number().optional(),
  email: z.string().email().optional(),
  additionalInstructions: z.string().optional(),
  sessionId: z.string().optional(),
  concurrency: z.coerce.number().min(1).max(50).optional(),
});

type SimbaCommandOptions = z.infer<typeof SimbaCommandSchema>;

interface SimbaStartRequest {
  config: {
    maxConversationRounds: number;
    maxAttackVectors: number;
  };
  targetInfo: {
    purpose: string;
    goal: string;
    additionalAttackInstructions?: string;
  };
  email: string;
}

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
  completed: boolean;
}

interface SimbaBatchResponse {
  operations: BatchOperation[];
  summary: {
    active: number;
    completed: number;
    remaining: number;
  };
}

async function callSimbaApi(endpoint: string, data: any, apiUrl?: string): Promise<any> {
  const baseUrl = apiUrl || process.env.PROMPTFOO_REMOTE_GENERATION_URL || 'http://localhost:3201';
  const url = `${baseUrl}/api/v1/simba${endpoint}`;
  logger.debug(`[Simba] Calling API: ${url}`);

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Simba API error: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

async function runSimbaSession(options: SimbaCommandOptions, config: UnifiedConfig, testSuite: TestSuite): Promise<void> {
  // Use the first provider from the config
  if (!testSuite.providers || testSuite.providers.length === 0) {
    throw new Error('No providers found in configuration. Please add at least one provider.');
  }

  const email = await getUserEmail() || options.email || 'steve@promptfoo.dev';
  const concurrency = options.concurrency || 4;

  logger.info(`Using provider from config`);
  const provider = testSuite.providers[0];
  logger.info(chalk.blue(`Concurrency: ${concurrency}`));


  let sessionId: string = options.sessionId || '';

  if (!sessionId) {
    // Start the Simba session
    logger.info(chalk.blue('Starting Simba red team session...'));
    const startRequest: SimbaStartRequest = {
      config: {
        maxConversationRounds: options.maxRounds || 20,
        maxAttackVectors: options.maxVectors || 5,
      },
      targetInfo: {
        purpose: options.purpose || 'Red team testing',
        goal: options.goal,
        additionalAttackInstructions: options.additionalInstructions,
      },
      email,
    };


    try {
      const startResponse: SimbaStartResponse = await callSimbaApi('/start', startRequest);
      sessionId = startResponse.sessionId;
      logger.info(chalk.green(`✓ Session started: ${sessionId}`));
    } catch (error) {
      logger.error(`Failed to start Simba session: ${error}`);
      throw error;
    }
  }

  // Main conversation loop
  let round = 0;
  let totalTokens = 0;
  let responses: Record<string, string> = {};


  while (true) {
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
        nextRequest
      );

      logger.debug(`Next response: ${JSON.stringify(batchResponse)}`);
      responses = {};



      // Process all operations in parallel
      const providerCalls = batchResponse.operations.map(async (op) => {
        if (op.completed) {
          logger.info(chalk.green(`✓ Conversation ${op.conversationId} completed`));
          return null;
        }

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
          const providerResponse = await provider.callApi(op.nextQuestion, context, providerOptions);

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
      break;
    }
  }

  // Summary
  logger.info(chalk.bold('\n=== Session Summary ==='));
  logger.info(`Session ID: ${sessionId}`);
  logger.info(`Total rounds: ${round}`);
  logger.info(`Total tokens used: ${totalTokens.toLocaleString()}`);
  logger.info(`Concurrency: ${concurrency}`);
}

export function simbaCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const simbaCmd = program
    .command('simba', {
      hidden: true,
    })
    .description('Run an interactive red team session using Simba agent')
    .option('-c, --config <paths...>', 'Path to configuration file (defaults to promptfooconfig.yaml)')
    .requiredOption('-g, --goal <goal>', 'The goal/objective for the red team test')
    .option('-e, --email <email>', 'Email address for analytics')
    .option('--purpose <purpose>', 'Purpose of the target system', 'Red team testing')
    .option('--max-rounds <number>', 'Maximum conversation rounds', '20')
    .option('--max-vectors <number>', 'Maximum attack vectors to try', '5')
    .option('--additional-instructions <text>', 'Additional attack instructions')
    .option('-s, --session-id <id>', 'Session ID to continue')
    .option('-j, --concurrency <number>', 'Number of concurrent conversations (1-50)')
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
        const { config, testSuite } = await resolveConfigs(opts, defaultConfig);

        await runSimbaSession(validatedOpts, config as UnifiedConfig, testSuite);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const validationError = fromError(err);
          logger.error(dedent`
            Invalid command options:
            ${validationError.toString()}
          `);
        } else {
          logger.error(`Failed to run Simba session: ${err}`);
        }
        process.exitCode = 1;
      }
    });

  return simbaCmd;
}