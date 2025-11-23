import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import cliState from '../../cliState';
import logger from '../../logger';
import {
  REDTEAM_MODEL,
  ALL_PLUGINS,
  ALL_STRATEGIES,
  isMultiTurnStrategy,
  type MultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '../../redteam/constants';
import { PluginFactory, Plugins } from '../../redteam/plugins/index';
import { redteamProviderManager } from '../../redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { Strategies } from '../../redteam/strategies/index';
import { fetchWithProxy } from '../../util/fetch/index';
import { evalJobs } from './eval';
import { OpenAiChatCompletionProvider } from '../../providers/openai/chat';
import type { Request, Response } from 'express';
import dedent from 'dedent';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';
import { RedteamConfigSchema } from '../../validators/redteam';
import { type Strategy as StrategyFactory } from '../../redteam/strategies/types';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';

export const redteamRouter = Router();

// Size limit constants with rationale
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB - prevents DoS while allowing large configs with many test cases
const MAX_CLOUD_REQUEST_SIZE = 5 * 1024 * 1024; // 5MB - cloud API has stricter limits for cost control
const MAX_APP_DEFINITION_SIZE = 100 * 1024; // 100KB - typical JSON size for structured app config
const MAX_PURPOSE_LENGTH = 10000; // 10K chars - detailed app description (~2500 words)
const MAX_CONVERSATION_HISTORY = 1000; // 1000 messages - very long multi-turn conversations
const ABORT_CLEANUP_DELAY_MS = 500; // 500ms - wait for abort signal propagation and cleanup
// Note: MAX_MESSAGE_CONTENT_LENGTH (500K chars) is defined in src/redteam/types.ts ConversationMessageSchema

/**
 * Schema for POST /api/redteam/generate-test
 * Generates individual test cases using plugins and strategies
 *
 * Frontend contract: TestCaseGenerationProvider.tsx sends { plugin, strategy, config, history, turn, maxTurns }
 * - plugin/strategy include 'isStatic' boolean field from frontend state
 */
const TestCaseGenerationSchema = z
  .object({
    plugin: z
      .object({
        id: z
          .string()
          .min(1, 'Plugin ID required')
          .max(200, 'Plugin ID too long')
          .refine((val) => ALL_PLUGINS.includes(val as any), {
            message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
          }) as unknown as z.ZodType<Plugin>, // Type assertion needed: Zod can't infer const array type
        config: PluginConfigSchema.optional().default({}),
        isStatic: z.boolean().optional(), // Frontend sends this field for UI state tracking
      })
      .passthrough(), // Allow other fields the frontend may add without breaking

    strategy: z
      .object({
        id: z
          .string()
          .min(1, 'Strategy ID required')
          .max(200, 'Strategy ID too long')
          .refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
            message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
          }) as unknown as z.ZodType<Strategy>, // Type assertion needed: Zod can't infer const array type
        config: StrategyConfigSchema.optional().default({}),
        isStatic: z.boolean().optional(), // Frontend sends this field for UI state tracking
      })
      .passthrough(), // Allow other fields the frontend may add without breaking

    config: z
      .object({
        applicationDefinition: z
          .object({
            purpose: z
              .string()
              .max(
                MAX_PURPOSE_LENGTH,
                `Purpose too long (max ${MAX_PURPOSE_LENGTH.toLocaleString()} characters)`,
              )
              .nullable()
              .transform((val) => val?.trim() || null),
          })
          .passthrough(), // Allow other application definition fields
      })
      .passthrough(), // Allow other config fields

    turn: z.coerce // Coerce to number (may be sent as string)
      .number({
        invalid_type_error: 'Turn must be a number or numeric string',
      })
      .int('Turn must be an integer')
      .min(0, 'Turn cannot be negative')
      .max(100, 'Turn cannot exceed 100')
      .optional()
      .default(0),

    maxTurns: z.coerce // Coerce to number (may be sent as string)
      .number({
        invalid_type_error: 'Max turns must be a number or numeric string',
      })
      .int('Max turns must be an integer')
      .min(1, 'Max turns must be at least 1')
      .max(50, 'Max turns cannot exceed 50')
      .optional(),

    history: z
      .array(ConversationMessageSchema)
      .max(
        MAX_CONVERSATION_HISTORY,
        `Conversation history too long (max ${MAX_CONVERSATION_HISTORY} messages)`,
      )
      .optional()
      .default([]),

    goal: z
      .string()
      .max(5000, 'Goal too long (max 5,000 characters)')
      .trim()
      .optional()
      .describe('CLI only - not sent by frontend'),

    stateful: z.boolean().optional().describe('CLI only - not sent by frontend'),
  })
  .passthrough() // Allow future fields without breaking (changed from .strict())
  .refine(
    (val) => {
      const size = JSON.stringify(val).length;
      return size < MAX_REQUEST_SIZE;
    },
    {
      message: `Request too large (max ${MAX_REQUEST_SIZE / 1024 / 1024}MB)`,
    },
  );

/**
 * Schema for POST /api/redteam/run
 * Runs a complete redteam evaluation campaign
 *
 * Frontend contract: Review.tsx sends { config, force, verbose, maxConcurrency, delay }
 * - maxConcurrency and delay are sent as strings from form inputs, so we coerce to number
 */
const RedteamRunRequestSchema = z
  .object({
    config: RedteamConfigSchema.refine(
      (val) => {
        const size = JSON.stringify(val).length;
        return size < MAX_REQUEST_SIZE;
      },
      {
        message: `Config too large (max ${MAX_REQUEST_SIZE / 1024 / 1024}MB)`,
      },
    ),

    force: z
      .boolean()
      .optional()
      .default(false)
      .describe('Force re-generation of tests even if they exist'),

    verbose: z.boolean().optional().default(false).describe('Enable verbose logging'),

    delay: z.coerce // Coerce string to number (frontend sends string from form input)
      .number({
        invalid_type_error: 'Delay must be a number or numeric string',
      })
      .int('Delay must be an integer')
      .min(0, 'Delay cannot be negative')
      .max(60000, 'Delay cannot exceed 60 seconds')
      .optional()
      .default(0)
      .describe('Delay between test executions in milliseconds'),

    maxConcurrency: z.coerce // Coerce string to number (frontend sends string from form input)
      .number({
        invalid_type_error: 'Max concurrency must be a number or numeric string',
      })
      .int('Concurrency must be an integer')
      .min(1, 'Concurrency must be at least 1')
      .max(100, 'Concurrency cannot exceed 100')
      .optional()
      .default(1)
      .describe('Maximum number of concurrent test executions'),
  })
  .passthrough(); // Allow future fields without breaking

/**
 * Schema for POST /api/redteam/cancel
 * Cancels the currently running redteam job
 *
 * Frontend contract: Review.tsx sends empty POST request
 */
const RedteamCancelRequestSchema = z.object({}).passthrough().optional();

/**
 * Schema for POST /api/redteam/:task
 * Catch-all route for forwarding requests to cloud redteam functions
 *
 * Whitelist includes all legitimate task types used across the codebase:
 * - Test generation: synthesize, extract-entities, generate-examples
 * - Prompt manipulation: augment-prompt, rewrite-prompt
 * - Harm classification: classify-harm
 * - Attack strategies: goat, crescendo, hydra-decision, mischievous-user-redteam
 * - Grading/evaluation: llm-rubric, similar, citation
 * - Discovery/analysis: target-purpose-discovery, extract-intent, extract-goat-failure
 * - Transformations: math-prompt, multilingual, poison-document
 */
const ALLOWED_REDTEAM_TASKS = [
  // Test generation
  'synthesize',
  'extract-entities',
  'generate-examples',
  // Prompt manipulation
  'augment-prompt',
  'rewrite-prompt',
  // Harm classification
  'classify-harm',
  // Attack strategies
  'goat',
  'crescendo',
  'hydra-decision',
  'mischievous-user-redteam',
  // Grading and evaluation
  'llm-rubric',
  'similar',
  'citation',
  // Discovery and analysis
  'target-purpose-discovery',
  'extract-intent',
  'extract-goat-failure',
  // Transformations
  'math-prompt',
  'multilingual',
  'poison-document',
] as const;

const RedteamTaskParamsSchema = z.object({
  task: z
    .string()
    .min(1, 'Task name required')
    .max(100, 'Task name too long')
    .regex(/^[a-z0-9-_]+$/, 'Task name must be alphanumeric with dashes/underscores')
    .refine((val) => ALLOWED_REDTEAM_TASKS.includes(val as any), {
      message: `Task must be one of: ${ALLOWED_REDTEAM_TASKS.join(', ')}`,
    }),
});

const RedteamTaskRequestSchema = z
  .object({
    // Common fields across task types
    prompt: z.string().max(50000).optional(),
    goal: z.string().max(5000).optional(),
    examples: z.array(z.string().max(10000)).max(100).optional(),
    context: z.string().max(20000).optional(),
    messages: z.array(z.unknown()).max(MAX_CONVERSATION_HISTORY).optional(),
    instructions: z.string().max(50000).optional(),
    history: z.array(z.unknown()).max(MAX_CONVERSATION_HISTORY).optional(),
    i: z.coerce
      .number({
        invalid_type_error: 'Index must be a number or numeric string',
      })
      .int()
      .min(0)
      .max(100)
      .optional(),
    turn: z.coerce
      .number({
        invalid_type_error: 'Turn must be a number or numeric string',
      })
      .int()
      .min(0)
      .max(100)
      .optional(),
    // Allow other task-specific fields
  })
  .catchall(z.unknown())
  .refine(
    (val) => {
      const size = JSON.stringify(val).length;
      return size < MAX_CLOUD_REQUEST_SIZE;
    },
    {
      message: `Request payload too large (max ${MAX_CLOUD_REQUEST_SIZE / 1024 / 1024}MB)`,
    },
  );

/**
 * Schema for POST /api/redteam/generate-custom-policy
 * Generates custom security policies using AI based on application context
 *
 * Frontend contract: CustomPoliciesSection.tsx sends { applicationDefinition, existingPolicies }
 * - existingPolicies is an array of STRINGS (policy texts), not objects
 * - applicationDefinition matches SavedRedteamConfig.applicationDefinition structure
 */
const GenerateCustomPolicySchema = z
  .object({
    applicationDefinition: z
      .object({
        purpose: z.string().max(MAX_PURPOSE_LENGTH, 'Purpose too long').optional(),
        features: z.string().max(MAX_PURPOSE_LENGTH, 'Features too long').optional(),
        hasAccessTo: z.string().max(5000, 'Has access to too long').optional(),
        doesNotHaveAccessTo: z.string().max(5000, 'Does not have access to too long').optional(),
        userTypes: z.string().max(5000, 'User types too long').optional(),
        securityRequirements: z
          .string()
          .max(MAX_PURPOSE_LENGTH, 'Security requirements too long')
          .optional(),
        exampleIdentifiers: z.string().max(5000, 'Example identifiers too long').optional(),
        industry: z.string().max(500, 'Industry too long').optional(),
        sensitiveDataTypes: z.string().max(5000, 'Sensitive data types too long').optional(),
        criticalActions: z.string().max(5000, 'Critical actions too long').optional(),
        forbiddenTopics: z.string().max(5000, 'Forbidden topics too long').optional(),
        competitors: z.string().max(5000, 'Competitors too long').optional(),
        systemPrompt: z.string().max(20000, 'System prompt too long').optional(),
        redteamUser: z.string().max(5000, 'Redteam user too long').optional(),
        accessToData: z.string().max(5000, 'Access to data too long').optional(),
        forbiddenData: z.string().max(5000, 'Forbidden data too long').optional(),
        accessToActions: z.string().max(5000, 'Access to actions too long').optional(),
        forbiddenActions: z.string().max(5000, 'Forbidden actions too long').optional(),
        connectedSystems: z.string().max(5000, 'Connected systems too long').optional(),
        attackConstraints: z.string().max(5000, 'Attack constraints too long').optional(),
      })
      .passthrough() // Allow other application definition fields
      .refine(
        (val) => {
          const size = JSON.stringify(val).length;
          return size < MAX_APP_DEFINITION_SIZE;
        },
        {
          message: `Application definition too large (max ${MAX_APP_DEFINITION_SIZE / 1024}KB)`,
        },
      ),
    existingPolicies: z
      .array(z.string().max(MAX_PURPOSE_LENGTH, 'Policy text too long'))
      .max(200, 'Too many existing policies (max 200)')
      .optional()
      .default([])
      .describe('Array of existing policy texts to avoid duplicates'),
  })
  .passthrough(); // Allow other fields that may be added in the future

/**
 * POST /api/redteam/generate-test
 * Generates a single test case for a given plugin/strategy combination
 */
redteamRouter.post('/generate-test', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const parsedBody = TestCaseGenerationSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(parsedBody.error).toString(),
      });
      return;
    }

    const {
      plugin,
      strategy,
      config,
      turn,
      maxTurns,
      history,
      goal: goalOverride,
      stateful,
    } = parsedBody.data;

    // Additional plugin configuration validation
    const pluginConfigurationError = getPluginConfigurationError(plugin);
    if (pluginConfigurationError) {
      res.status(400).json({ error: pluginConfigurationError });
      return;
    }

    logger.debug('[POST /redteam/generate-test] Generating test case', {
      pluginId: plugin.id,
      strategyId: strategy.id,
      turn,
    });

    // Find the plugin
    const pluginFactory = Plugins.find((p) => p.key === plugin.id) as PluginFactory;
    if (!pluginFactory) {
      res.status(400).json({ error: `Plugin not found: ${plugin.id}` });
      return;
    }

    // TODO: Add support for this? Was previously misconfigured such that the no value would ever
    // be passed in as a configuration option.
    const injectVar = 'query';

    // Get the red team provider
    const redteamProvider = await redteamProviderManager.getProvider({ provider: REDTEAM_MODEL });

    const testCases = await pluginFactory.action({
      provider: redteamProvider,
      purpose: config.applicationDefinition.purpose ?? 'general AI assistant',
      injectVar,
      n: 1, // Generate only one test case
      delayMs: 0,
      config: {
        ...plugin.config,
        language: plugin.config.language ?? 'en',
        __nonce: Math.floor(Math.random() * 1000000), // Use a nonce to prevent caching
      },
    });

    if (testCases.length === 0) {
      res.status(500).json({ error: 'Failed to generate test case' });
      return;
    }

    // Apply strategy to test case
    let finalTestCases = testCases;

    // Skip applying strategy if it's 'basic' as they don't transform test cases
    if (!['basic', 'default'].includes(strategy.id)) {
      try {
        const strategyFactory = Strategies.find((s) => s.id === strategy.id) as StrategyFactory;
        if (!strategyFactory) {
          res.status(400).json({
            error: `Strategy not found: ${strategy.id}`,
            details: `Valid strategies: ${Strategies.map((s) => s.id).join(', ')}`,
          });
          return;
        }

        // Type assertion needed: strategy.action expects TestCase[] but our testCases
        // come from plugin.action which may return a compatible but differently typed array
        const strategyTestCases = await strategyFactory.action(
          testCases as any,
          injectVar,
          strategy.config || {},
          strategy.id,
        );

        if (strategyTestCases && strategyTestCases.length > 0) {
          finalTestCases = strategyTestCases;
        }
      } catch (error) {
        logger.error(`[POST /redteam/generate-test] Error applying strategy ${strategy.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          error: `Failed to apply strategy ${strategy.id}`,
          details: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    const testCase = finalTestCases[0];
    const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
    const baseMetadata =
      testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};
    const metadataForStrategy = {
      ...baseMetadata,
      strategyId: strategy.id,
    };
    const context = `This test case targets the ${plugin.id} plugin with strategy ${strategy.id} and was generated based on your application context. If the test case is not relevant to your application, you can modify the application definition to improve relevance.`;
    const purpose = config.applicationDefinition.purpose ?? null;

    if (isMultiTurnStrategy(strategy.id)) {
      try {
        const multiTurnResult = await generateMultiTurnPrompt({
          pluginId: plugin.id,
          strategyId: strategy.id as MultiTurnStrategy,
          strategyConfigRecord: strategy.config as Record<string, unknown>,
          history,
          turn,
          maxTurns,
          goalOverride,
          baseMetadata: metadataForStrategy,
          generatedPrompt,
          purpose,
          stateful,
        });

        res.json({
          prompt: multiTurnResult.prompt,
          context,
          metadata: multiTurnResult.metadata,
        });
        return;
      } catch (error) {
        if (error instanceof RemoteGenerationDisabledError) {
          res.status(400).json({ error: error.message });
          return;
        }

        logger.error('[POST /redteam/generate-test] Multi-turn error', {
          error: error instanceof Error ? error.message : String(error),
          strategy: strategy.id,
        });
        res.status(500).json({
          error: 'Failed to generate multi-turn prompt',
          details: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    // Return single-turn result
    res.json({
      prompt: generatedPrompt,
      context,
      metadata: baseMetadata,
    });
  } catch (error) {
    logger.error('[POST /redteam/generate-test] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to generate test case',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Track the current running job
let currentJobId: string | null = null;
let currentAbortController: AbortController | null = null;

/**
 * POST /api/redteam/run
 * Runs a complete redteam evaluation campaign
 */
redteamRouter.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request
    const validationResult = RedteamRunRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
      return;
    }

    const { config, force, verbose, delay, maxConcurrency } = validationResult.data;

    // If there's a current job running, abort it
    if (currentJobId) {
      logger.info('[POST /redteam/run] Aborting existing job', { jobId: currentJobId });
      if (currentAbortController) {
        currentAbortController.abort();
        // Wait for abort signal to propagate and cleanup to complete
        // This prevents race conditions where the old job continues running while new job starts
        await new Promise((resolve) => setTimeout(resolve, ABORT_CLEANUP_DELAY_MS));
      }
      const existingJob = evalJobs.get(currentJobId);
      if (existingJob) {
        existingJob.status = 'error';
        existingJob.logs.push('Job cancelled - new job started');
      }
    }

    const id = uuidv4();
    currentJobId = id;
    currentAbortController = new AbortController();

    // Initialize job status
    evalJobs.set(id, {
      evalId: null,
      status: 'in-progress',
      progress: 0,
      total: 0,
      result: null,
      logs: [],
    });

    // Set web UI mode
    cliState.webUI = true;

    logger.info('[POST /redteam/run] Starting redteam job', {
      jobId: id,
      force,
      verbose,
      delay,
      maxConcurrency,
    });

    // Run redteam in background
    doRedteamRun({
      liveRedteamConfig: config,
      force,
      verbose,
      delay,
      maxConcurrency,
      logCallback: (message: string) => {
        if (currentJobId === id) {
          const job = evalJobs.get(id);
          if (job) {
            job.logs.push(message);
          }
        }
      },
      abortSignal: currentAbortController.signal,
    })
      .then(async (evalResult) => {
        const summary = evalResult ? await evalResult.toEvaluateSummary() : null;
        const job = evalJobs.get(id);
        if (job && currentJobId === id) {
          job.status = 'complete';
          job.result = summary;
          job.evalId = evalResult?.id ?? null;
          logger.info('[POST /redteam/run] Job completed', { jobId: id });
        }
        if (currentJobId === id) {
          cliState.webUI = false;
          currentJobId = null;
          currentAbortController = null;
        }
      })
      .catch((error) => {
        logger.error('[POST /redteam/run] Job failed', {
          jobId: id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        const job = evalJobs.get(id);
        if (job && currentJobId === id) {
          job.status = 'error';
          job.logs.push(`Error: ${error.message || String(error)}`);
          if (error instanceof Error && error.stack) {
            job.logs.push(`Stack trace: ${error.stack}`);
          }
        }
        if (currentJobId === id) {
          cliState.webUI = false;
          currentJobId = null;
          currentAbortController = null;
        }
      });

    res.json({ id });
  } catch (error) {
    logger.error('[POST /redteam/run] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to start redteam job',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/redteam/cancel
 * Cancels the currently running redteam job
 */
redteamRouter.post('/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request (empty body expected)
    const validationResult = RedteamCancelRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
      return;
    }

    if (!currentJobId) {
      res.status(400).json({ error: 'No job currently running' });
      return;
    }

    const jobId = currentJobId;
    logger.info('[POST /redteam/cancel] Cancelling job', { jobId });

    if (currentAbortController) {
      currentAbortController.abort();
    }

    const job = evalJobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.logs.push('Job cancelled by user');
    }

    // Clear state
    cliState.webUI = false;
    currentJobId = null;
    currentAbortController = null;

    // Wait a moment to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    res.json({ message: 'Job cancelled', jobId });
  } catch (error) {
    logger.error('[POST /redteam/cancel] Error cancelling job', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to cancel job',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/redteam/generate-custom-policy
 * Generates custom security policies using OpenAI based on application definition
 */
redteamRouter.post(
  '/generate-custom-policy',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request
      const validationResult = GenerateCustomPolicySchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: 'Invalid request body',
          details: fromZodError(validationResult.error).toString(),
        });
        return;
      }

      const { applicationDefinition, existingPolicies } = validationResult.data;

      // Check if OpenAI API key is available before attempting to generate policies
      // This feature requires an OpenAI API key and has no remote generation fallback
      if (!process.env.OPENAI_API_KEY) {
        res.status(400).json({
          error: 'OpenAI API key required',
          details: 'Set the OPENAI_API_KEY environment variable to use custom policy generation',
        });
        return;
      }

      logger.debug('[POST /redteam/generate-custom-policy] Generating custom policies', {
        applicationDefinitionSize: JSON.stringify(applicationDefinition).length,
        existingPoliciesCount: existingPolicies.length,
      });

      const provider = new OpenAiChatCompletionProvider('gpt-5-mini-2025-08-07', {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'policies',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  policies: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        text: { type: 'string' },
                      },
                      required: ['name', 'text'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['policies'],
                additionalProperties: false,
              },
            },
          },
          temperature: 0.7,
        },
      });

      const systemPrompt = dedent`
      You are an expert at defining red teaming policies for AI applications.
      Your goal is to suggest custom policies (validators) that should be enforced based on the application definition.
      Return a JSON object with a "policies" array, where each policy has a "name" and "text".
      The "text" should be a clear, specific instruction for what the AI should not do or should check for.
      Do not suggest policies that are already in the existing list.
    `;

      const userPrompt = dedent`
      Application Definition:
      ${JSON.stringify(applicationDefinition, null, 2)}

      Existing Policies:
      ${JSON.stringify(existingPolicies, null, 2)}

      Suggest 3-5 new, unique, and relevant policies.`;

      const response = await provider.callApi(
        JSON.stringify([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]),
      );

      if (response.error) {
        throw new Error(response.error);
      }

      let policies = [];
      try {
        const output =
          typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
        policies = output.policies || [];
      } catch (e) {
        logger.error('[POST /redteam/generate-custom-policy] Failed to parse generated policies', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      logger.info('[POST /redteam/generate-custom-policy] Successfully generated policies', {
        policiesCount: policies.length,
      });

      res.json({ policies });
    } catch (error) {
      logger.error('[POST /redteam/generate-custom-policy] Error generating policies', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Failed to generate policies',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * POST /api/redteam/:task
 * Catch-all route for forwarding validated requests to cloud redteam functions
 * NOTE: This route comes last so specific routes take precedence
 */
redteamRouter.post('/:task', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate task parameter
    const paramsResult = RedteamTaskParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({
        error: 'Invalid task parameter',
        details: fromZodError(paramsResult.error).toString(),
      });
      return;
    }

    // Validate request body
    const bodyResult = RedteamTaskRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(bodyResult.error).toString(),
      });
      return;
    }

    const { task } = paramsResult.data;
    const validatedBody = bodyResult.data;

    const cloudFunctionUrl = getRemoteGenerationUrl();

    logger.debug('[POST /redteam/:task] Forwarding request to cloud', {
      task,
      bodySize: JSON.stringify(validatedBody).length,
    });

    // Forward validated request to cloud
    const response = await fetchWithProxy(cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        ...validatedBody,
      }),
    });

    if (!response.ok) {
      logger.error('[POST /redteam/:task] Cloud function error', {
        task,
        status: response.status,
      });
      throw new Error(`Cloud function responded with status ${response.status}`);
    }

    const data = await response.json();
    logger.debug('[POST /redteam/:task] Received cloud response', { task });
    res.json(data);
  } catch (error) {
    logger.error('[POST /redteam/:task] Error processing task', {
      task: req.params.task,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to process task',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

redteamRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    hasRunningJob: currentJobId !== null,
    jobId: currentJobId,
  });
});
