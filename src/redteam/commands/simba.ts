import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { DEFAULT_MAX_CONCURRENCY } from '../../constants';
import logger from '../../logger';
import { TestSuite, UnifiedConfig } from '../../types/index';
import { ApiProvider, CallApiContextParams, isApiProvider } from '../../types/providers';
import { resolveConfigs } from '../../util/config/load';
import { setupEnv } from '../../util/index';
import { strategyDisplayNames } from '../constants';
import SimbaProvider from '../providers/simba';

const SimbaCommandSchema = z.object({
  config: z.union([z.string(), z.array(z.string())]).optional(),
  goals: z.array(z.string()),
  purpose: z.string().optional(),
  maxRounds: z.number().optional(),
  maxVectors: z.number().optional(),
  email: z.string().email().optional(),
  additionalInstructions: z.string().optional(),
  sessionId: z.string().optional(),
  concurrency: z.number().min(1).max(100).optional(),
  injectVar: z.string().min(1).optional(),
});

type SimbaCommandOptions = z.infer<typeof SimbaCommandSchema>;

function normalizeGoals(goals: SimbaCommandOptions['goals']): string[] {
  if (Array.isArray(goals)) {
    return goals;
  }
  return [goals];
}

function inferInjectVar(testSuite: TestSuite): string {
  const candidateVars = new Set<string>();
  const tests = testSuite.tests ?? [];

  for (const test of tests) {
    if (test?.vars) {
      for (const key of Object.keys(test.vars)) {
        candidateVars.add(key);
      }
    }
  }

  if (candidateVars.has('prompt')) {
    return 'prompt';
  }

  const firstCandidate = candidateVars.values().next().value as string | undefined;
  if (firstCandidate) {
    logger.debug(
      `Inferring ${strategyDisplayNames.simba} injectVar as '${firstCandidate}' from test cases`,
    );
    return firstCandidate;
  }

  logger.debug(`Falling back to default ${strategyDisplayNames.simba} injectVar "prompt"`);
  return 'prompt';
}

function getTargetProvider(testSuite: TestSuite): ApiProvider {
  for (const provider of testSuite.providers ?? []) {
    if (!isApiProvider(provider)) {
      continue;
    }
    return provider;
  }
  throw new Error(
    'No valid target provider found. Ensure your configuration includes at least one provider.',
  );
}

async function runSimbaWithProvider(
  options: SimbaCommandOptions,
  testSuite: TestSuite,
): Promise<void> {
  if (!testSuite.providers || testSuite.providers.length === 0) {
    throw new Error('No providers found in configuration. Please add at least one provider.');
  }

  const targetProvider = getTargetProvider(testSuite);
  const goals = normalizeGoals(options.goals);
  const injectVar = options.injectVar ?? inferInjectVar(testSuite);
  const concurrency = options.concurrency ?? 1;

  logger.info(chalk.blue(`Using target provider: ${targetProvider.id()}`));
  logger.info(chalk.blue(`Concurrency: ${concurrency}`));
  logger.info(chalk.blue(`Inject var: ${injectVar}`));

  const simbaProvider = new SimbaProvider({
    injectVar,
    goals,
    purpose: options.purpose ?? 'Red team testing',
    additionalAttackInstructions: options.additionalInstructions,
    maxConversationRounds: options.maxRounds ?? 10,
    maxAttacksPerGoal: options.maxVectors ?? 5,
    sessionId: options.sessionId,
    concurrency: concurrency,
  });

  const context: CallApiContextParams = {
    prompt: { raw: '', label: strategyDisplayNames.simba },
    vars: {},
    originalProvider: targetProvider,
    test: {
      metadata: {
        purpose: options.purpose ?? 'Red team testing',
      },
      vars: {},
      assert: [],
    } as any,
  };

  logger.info(chalk.cyan(`Starting ${strategyDisplayNames.simba} session...`));
  const results = await simbaProvider.runSimba({
    prompt: goals.join('; '),
    context,
    options: undefined,
    concurrency,
  });

  if (!results.length) {
    logger.warn(`${strategyDisplayNames.simba} did not return any results.`);
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  logger.info(chalk.bold(`\n=== ${strategyDisplayNames.simba} Results ===`));
  for (const result of results) {
    const planName = String(result.metadata?.attackPlan?.planName ?? result.promptId ?? 'Unknown');

    if (result.error) {
      errorCount += 1;
      logger.error(chalk.red(`[${planName}] ${strategyDisplayNames.simba} error: ${result.error}`));
      continue;
    }

    const attackSucceeded = Boolean(result.success);
    if (attackSucceeded) {
      successCount += 1;
    }

    const statusLabel = attackSucceeded
      ? chalk.red.bold('ATTACK SUCCEEDED')
      : chalk.green.bold('ATTACK BLOCKED');
    const summary = result.metadata?.result?.summary;

    logger.info(`${statusLabel} - ${planName}`);
    if (summary) {
      logger.info(`  Summary: ${summary}`);
    }

    const dataExtracted = result.metadata?.dataExtracted;
    if (dataExtracted) {
      logger.info(`  Data Extracted:\n${dataExtracted}`);
    }

    const jailbreaks = result.metadata?.successfulJailbreaks;
    if (jailbreaks) {
      logger.info(`  Successful Jailbreaks:\n${jailbreaks}`);
    }
  }

  logger.info(chalk.bold('\n=== Session Summary ==='));
  logger.info(`Attack plans evaluated: ${results.length}`);
  logger.info(`Successful attacks: ${successCount}`);
  logger.info(`Errors: ${errorCount}`);
  logger.info(`Concurrency used: ${concurrency}`);
  if (options.sessionId) {
    logger.info(`Session ID: ${options.sessionId}`);
  }
}

export function simbaCommand(program: Command, defaultConfig: Partial<UnifiedConfig>): void {
  program
    .command('simba', { hidden: true })
    .description('This feature is under development and not ready for use.')
    .option(
      '-c, --config <paths...>',
      'Path to configuration file (defaults to promptfooconfig.yaml)',
    )
    .requiredOption('-g, --goals <goals...>', 'The goals/objectives for the red team test')
    .option('-e, --email <email>', 'Email address for analytics')
    .option('--purpose <purpose>', 'Purpose of the target system', 'Red team testing')
    .option('--max-conversation-rounds <number>', 'Maximum conversation rounds', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--max-attacks-per-goal <number>', 'Maximum attack vectors to try', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--additional-instructions <text>', 'Additional attack instructions')
    .option('-s, --session-id <id>', 'Session ID to continue')
    .option(
      '-j, --concurrency <number>',
      'Number of concurrent conversations (1-100)',
      (val) => Number.parseInt(val, 10),
      DEFAULT_MAX_CONCURRENCY,
    )
    .option(
      '--inject-var <name>',
      `Variable name to inject ${strategyDisplayNames.simba} prompts into`,
    )
    .action(async (opts: any) => {
      setupEnv(opts.envPath);

      try {
        const validationResult = SimbaCommandSchema.safeParse(opts);

        if (!validationResult.success) {
          const validationError = fromZodError(validationResult.error);
          logger.error(`Invalid options:\n${validationError.message}`);
          process.exitCode = 1;
          return;
        }

        const { testSuite } = await resolveConfigs(opts, defaultConfig);

        await runSimbaWithProvider(validationResult.data, testSuite);
      } catch (error) {
        logger.error(`${strategyDisplayNames.simba} command failed: ${error}`);
        process.exit(1);
      }
    });
}
