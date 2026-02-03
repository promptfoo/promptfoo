import {
  type Attributes,
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { getGenAITracer, PromptfooAttributes } from './genaiTracer';

/** Service name for grader spans */
const GRADER_SERVICE_NAME = 'promptfoo-api';

/** Default service name for target/CLI spans */
const DEFAULT_SERVICE_NAME = 'promptfoo-cli';

/** Grader-specific attribute names */
export const GraderAttributes = {
  SERVICE_NAME: 'service.name',
  GRADER_ID: 'promptfoo.grader.id',
  GRADER_PASS: 'promptfoo.grader.pass',
  GRADER_SCORE: 'promptfoo.grader.score',
} as const;

/**
 * Labels that indicate grading context.
 * Used to determine service name for provider spans.
 */
export const GRADING_LABELS = [
  'llm-rubric',
  'factuality',
  'model-graded-closedqa',
  'g-eval',
  'judge',
  'context-recall',
  'context-relevance',
  'context-faithfulness',
  'answer-relevance',
] as const;

/**
 * Check if a prompt label indicates a grading context.
 *
 * @param label - The prompt label to check
 * @returns true if the label matches a grading pattern
 */
export function isGradingContext(label?: string): boolean {
  if (!label) {
    return false;
  }
  return GRADING_LABELS.some((g) => label.includes(g));
}

/**
 * Get the appropriate service name based on the prompt label.
 *
 * @param label - The prompt label
 * @returns The grading label if it matches a grading context, otherwise 'promptfoo-cli'
 */
export function getServiceName(label?: string): string {
  if (label && isGradingContext(label)) {
    return label;
  }
  return DEFAULT_SERVICE_NAME;
}

/**
 * Context for creating a grader span.
 */
export interface GraderSpanContext {
  /** The grader ID (e.g., 'promptfoo:redteam:harmful') */
  graderId: string;
  /** Optional prompt label */
  promptLabel?: string;
  /** Optional evaluation ID */
  evalId?: string;
  /** Optional test case index */
  testIndex?: number;
  /** Optional iteration/turn number (1-indexed) */
  iteration?: number;
  /** W3C Trace Context - for propagating trace context from parent */
  traceparent?: string;
}

/**
 * Result data to attach to a grader span after grading completes.
 */
export interface GraderSpanResult {
  /** Whether the grading passed */
  pass: boolean;
  /** The grading score */
  score: number;
}

/**
 * Execute a function within a grader span.
 *
 * This wrapper:
 * 1. Creates a span for the grading operation
 * 2. Sets grader attributes before execution
 * 3. Executes the provided function
 * 4. Sets result attributes (pass/score) after execution
 * 5. Handles errors and sets appropriate span status
 *
 * @param ctx - Grader span context with grader information
 * @param fn - The async function to execute (the grading operation)
 * @param resultExtractor - Optional function to extract result data from the return value
 * @returns The return value from fn
 */
export async function withGraderSpan<T>(
  ctx: GraderSpanContext,
  fn: (span: Span) => Promise<T>,
  resultExtractor?: (value: T) => GraderSpanResult,
): Promise<T> {
  // Use the same tracer as other working spans (HTTP, target, etc.)
  const tracer = getGenAITracer();

  // Span name includes the grader ID
  const spanName = `grader ${ctx.graderId}`;

  // Extract parent context from traceparent if provided
  let parentContext = context.active();
  if (ctx.traceparent) {
    const carrier = { traceparent: ctx.traceparent };
    parentContext = propagation.extract(ROOT_CONTEXT, carrier);
  }

  // Build initial attributes
  const attributes: Attributes = {
    [GraderAttributes.SERVICE_NAME]: GRADER_SERVICE_NAME,
    [GraderAttributes.GRADER_ID]: ctx.graderId,
  };

  if (ctx.promptLabel) {
    attributes[PromptfooAttributes.PROMPT_LABEL] = ctx.promptLabel;
  }

  if (ctx.evalId) {
    attributes[PromptfooAttributes.EVAL_ID] = ctx.evalId;
  }

  if (ctx.testIndex !== undefined) {
    attributes[PromptfooAttributes.TEST_INDEX] = ctx.testIndex;
  }

  if (ctx.iteration !== undefined) {
    attributes[PromptfooAttributes.ITERATION] = ctx.iteration;
  }

  // Create span with the parent context
  const span = tracer.startSpan(
    spanName,
    {
      kind: SpanKind.INTERNAL,
      attributes,
    },
    parentContext,
  );

  // Set default OK status immediately - will be overwritten on error
  span.setStatus({ code: SpanStatusCode.OK });

  // Run the function within the span's context
  const spanContext = trace.setSpan(parentContext, span);

  try {
    const value = await context.with(spanContext, () => fn(span));

    // Set result attributes if extractor provided
    if (resultExtractor) {
      try {
        const result = resultExtractor(value);
        span.setAttribute(GraderAttributes.GRADER_PASS, result.pass);
        span.setAttribute(GraderAttributes.GRADER_SCORE, result.score);
      } catch {
        // Ignore errors from result extraction - status already set to OK
      }
    }

    return value;
  } catch (error) {
    // Override with ERROR status on exception
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error) {
      span.recordException(error);
    }

    throw error;
  } finally {
    span.end();
  }
}
