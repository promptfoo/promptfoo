import { Router } from 'express';
import { z } from 'zod';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { Request, Response } from 'express';

const router = Router();

// Request schemas
const GenerateAssertionsSchema = z.object({
  prompts: z.array(z.string()).min(1, 'At least one prompt is required'),
  instructions: z.string().optional(),
  numAssertions: z.number().int().min(1).max(20).default(5),
  existingTests: z
    .array(
      z.object({
        vars: z.record(z.unknown()).optional(),
        assert: z.array(z.unknown()).optional(),
      }),
    )
    .optional()
    .default([]),
  provider: z.string().optional(),
  type: z.enum(['pi', 'g-eval', 'llm-rubric']).optional().default('llm-rubric'),
});

const GenerateTestCasesSchema = z.object({
  prompts: z.array(z.string()).min(1, 'At least one prompt is required'),
  instructions: z.string().optional(),
  numPersonas: z.number().int().min(1).max(10).default(5),
  numTestCasesPerPersona: z.number().int().min(1).max(10).default(3),
  existingTests: z
    .array(
      z.object({
        vars: z.record(z.unknown()).optional(),
        assert: z.array(z.unknown()).optional(),
      }),
    )
    .optional()
    .default([]),
  provider: z.string().optional(),
});

/**
 * POST /api/generate/assertions
 * Generate suggested assertions using AI based on the provided prompts
 */
router.post('/assertions', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const parsed = GenerateAssertionsSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.debug('[Generate] Invalid request body', { errors: parsed.error.errors });
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { prompts, instructions, numAssertions, existingTests, provider, type } = parsed.data;

    logger.debug('[Generate] Generating assertions', {
      promptCount: prompts.length,
      numAssertions,
      type,
      hasInstructions: !!instructions,
    });

    // Dynamically import to avoid circular dependencies
    const { synthesize } = await import('../../assertions/synthesis');

    const assertions = await synthesize({
      prompts,
      instructions,
      numQuestions: numAssertions,
      tests: existingTests as any[],
      provider,
      type,
    });

    const durationMs = Date.now() - startTime;

    // Record telemetry
    telemetry.record('webui_api', {
      event: 'generate_assertions',
      assertionCount: assertions.length,
      type,
      durationMs,
    });

    logger.debug('[Generate] Generated assertions successfully', {
      count: assertions.length,
      durationMs,
    });

    return res.json({
      success: true,
      data: {
        assertions,
        metadata: {
          generatedCount: assertions.length,
          requestedCount: numAssertions,
          type,
          durationMs,
        },
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[Generate] Failed to generate assertions', { error: errorMessage, durationMs });

    telemetry.record('webui_api', {
      event: 'generate_assertions_error',
      error: errorMessage,
      durationMs,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to generate assertions',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/generate/testcases
 * Generate test cases using AI based on the provided prompts
 */
router.post('/testcases', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const parsed = GenerateTestCasesSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.debug('[Generate] Invalid request body for test cases', {
        errors: parsed.error.errors,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const { prompts, instructions, numPersonas, numTestCasesPerPersona, existingTests, provider } =
      parsed.data;

    logger.debug('[Generate] Generating test cases', {
      promptCount: prompts.length,
      numPersonas,
      numTestCasesPerPersona,
      hasInstructions: !!instructions,
    });

    // Dynamically import to avoid circular dependencies
    const { synthesize } = await import('../../testCase/synthesis');

    const testCaseVars = await synthesize({
      prompts,
      instructions,
      numPersonas,
      numTestCasesPerPersona,
      tests: existingTests as any[],
      provider,
    });

    // Convert VarMapping[] to TestCase[] format
    const testCases = testCaseVars.map((vars, index) => ({
      description: `Generated Test Case #${index + 1}`,
      vars,
    }));

    const durationMs = Date.now() - startTime;

    // Record telemetry
    telemetry.record('webui_api', {
      event: 'generate_testcases',
      testCaseCount: testCases.length,
      numPersonas,
      numTestCasesPerPersona,
      durationMs,
    });

    logger.debug('[Generate] Generated test cases successfully', {
      count: testCases.length,
      durationMs,
    });

    return res.json({
      success: true,
      data: {
        testCases,
        metadata: {
          generatedCount: testCases.length,
          requestedCount: numPersonas * numTestCasesPerPersona,
          numPersonas,
          numTestCasesPerPersona,
          durationMs,
        },
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[Generate] Failed to generate test cases', { error: errorMessage, durationMs });

    telemetry.record('webui_api', {
      event: 'generate_testcases_error',
      error: errorMessage,
      durationMs,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to generate test cases',
      message: errorMessage,
    });
  }
});

export default router;
