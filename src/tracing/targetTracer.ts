import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  GenAIAttributes,
  getGenAITracer,
  PromptfooAttributes,
  sanitizeBody,
  withGenAISpan,
} from './genaiTracer';
import {
  getActiveTraceparent,
  type PromptfooSpanRole,
  SPAN_ROLE_ATTRIBUTE,
  withSpanRole,
} from './spanRoles';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../types/index';

export const TargetAttributes = {
  TARGET_TYPE: 'promptfoo.target.type',
  TARGET_LABEL: 'promptfoo.target.label',
} as const;

export const GraderAttributes = {
  GRADER_ID: 'promptfoo.grader.id',
} as const;

const MAX_GRADING_EXPLANATION_LENGTH = 1024;

export type TargetType = 'http' | 'mcp' | 'websocket' | 'provider';

export interface TargetSpanContext {
  targetType: TargetType;
  providerId: string;
  label?: string;
  traceparent: string;
  promptLabel?: string;
  evalId?: string;
  testIndex?: number;
  role?: Extract<PromptfooSpanRole, 'target' | 'grader'>;
}

/** Keep one recorded test-case root active until immediate or deferred grading has finished. */
export async function withTestCaseSpan<T>(
  rootSpan: Span | undefined,
  fn: () => Promise<T>,
  getDeferredCompletion?: (result: T) => Promise<unknown> | undefined,
): Promise<T> {
  if (!rootSpan) {
    return fn();
  }

  let result: T;
  try {
    const rootContext = trace.setSpan(ROOT_CONTEXT, rootSpan);
    result = await context.with(rootContext, () => withSpanRole('test_case', fn));
  } catch (error) {
    rootSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      rootSpan.recordException(error);
    }
    rootSpan.end();
    throw error;
  }

  const finish = () => {
    const row = Array.isArray(result) ? result[0] : undefined;
    if (row && typeof row === 'object') {
      if ('success' in row && typeof row.success === 'boolean') {
        rootSpan.setAttribute('promptfoo.test.success', row.success);
      }
      if ('score' in row && typeof row.score === 'number') {
        rootSpan.setAttribute('promptfoo.test.score', row.score);
      }
      if ('error' in row && row.error) {
        rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(row.error) });
      } else {
        rootSpan.setStatus({ code: SpanStatusCode.OK });
      }
    } else {
      rootSpan.setStatus({ code: SpanStatusCode.OK });
    }
    rootSpan.end();
  };

  const completion = getDeferredCompletion?.(result);
  if (completion) {
    void completion.then(finish, finish);
  } else {
    finish();
  }

  return result;
}

/** Record one target span for every evaluated provider, including custom providers. */
export async function withTargetSpan<T>(
  ctx: TargetSpanContext,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const activeTraceparent = getActiveTraceparent();
  const parentContext =
    activeTraceparent?.split('-')[1] === ctx.traceparent.split('-')[1]
      ? context.active()
      : propagation.extract(ROOT_CONTEXT, { traceparent: ctx.traceparent });
  const role = ctx.role ?? 'target';
  const attributes: Record<string, string | number> = {
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
    [SPAN_ROLE_ATTRIBUTE]: role,
  };

  if (role === 'target') {
    attributes[TargetAttributes.TARGET_TYPE] = ctx.targetType;
    if (ctx.label) {
      attributes[TargetAttributes.TARGET_LABEL] = ctx.label;
    }
  }
  if (ctx.promptLabel) {
    attributes[PromptfooAttributes.PROMPT_LABEL] = ctx.promptLabel;
  }
  if (ctx.evalId) {
    attributes[PromptfooAttributes.EVAL_ID] = ctx.evalId;
  }
  if (ctx.testIndex !== undefined) {
    attributes[PromptfooAttributes.TEST_INDEX] = ctx.testIndex;
  }

  return getGenAITracer().startActiveSpan(
    role === 'grader'
      ? `grader provider ${ctx.label || ctx.providerId}`
      : ctx.label || ctx.providerId,
    { kind: SpanKind.CLIENT, attributes },
    parentContext,
    async (span) => {
      try {
        const result = await withSpanRole(role, () => fn(span));
        if (result && typeof result === 'object' && 'cached' in result) {
          span.setAttribute(PromptfooAttributes.CACHE_HIT, Boolean(result.cached));
        }
        if (result && typeof result === 'object' && 'error' in result && result.error) {
          const message = String(result.error);
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          span.recordException(new Error(message));
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
        return result;
      } catch (error) {
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
    },
  );
}

interface TracedProviderCallOptions {
  provider: ApiProvider;
  callContext?: CallApiContextParams;
  operationName?: 'embeddings';
  role?: Extract<PromptfooSpanRole, 'target' | 'grader'>;
  promptLabel?: string;
  evalId?: string;
  testIndex?: number;
}

function getTargetType(providerId: string): TargetType {
  if (providerId.startsWith('mcp')) {
    return 'mcp';
  }
  if (providerId.startsWith('ws')) {
    return 'websocket';
  }
  return providerId.startsWith('http') ? 'http' : 'provider';
}

/** Apply consistent provider spans and propagation without modifying provider implementations. */
export async function withTracedProviderCall<T extends ProviderResponse>(
  {
    provider,
    callContext,
    operationName,
    role = 'target',
    promptLabel,
    evalId,
    testIndex,
  }: TracedProviderCallOptions,
  invoke: (callContext: CallApiContextParams | undefined) => Promise<T>,
): Promise<T> {
  const traceparent = getActiveTraceparent() ?? callContext?.traceparent;
  if (!traceparent) {
    return invoke(callContext);
  }

  const providerId = provider.id();
  return withTargetSpan(
    {
      targetType: getTargetType(providerId),
      providerId,
      label: provider.label,
      traceparent,
      promptLabel: promptLabel ?? callContext?.prompt?.label,
      evalId: evalId ?? callContext?.evaluationId,
      testIndex,
      role,
    },
    async () => {
      const childTraceparent = getActiveTraceparent() ?? traceparent;
      const invokeProvider = () =>
        callContext ? invoke({ ...callContext, traceparent: childTraceparent }) : invoke(undefined);

      if (operationName === 'embeddings') {
        const providerWithModel = provider as ApiProvider & {
          deploymentName?: unknown;
          modelName?: unknown;
        };
        const providerModel =
          typeof providerWithModel.modelName === 'string'
            ? providerWithModel.modelName
            : typeof providerWithModel.deploymentName === 'string'
              ? providerWithModel.deploymentName
              : providerId.split(':').slice(1).join(':') || providerId;

        return withGenAISpan(
          {
            system: providerId.split(':', 1)[0],
            operationName,
            model: providerModel,
            providerId,
            promptLabel,
            traceparent: childTraceparent,
          },
          invokeProvider,
          (response) => ({ tokenUsage: response.tokenUsage, cacheHit: response.cached }),
        );
      }

      return invokeProvider();
    },
  );
}

interface GraderSpanContext {
  graderId: string;
  traceparent?: string;
  evalId?: string;
  testIndex?: number;
}

function setEvaluationResultAttributes(span: Span, result: unknown): void {
  const grade = result && typeof result === 'object' && 'grade' in result ? result.grade : result;
  if (!grade || typeof grade !== 'object') {
    return;
  }

  if ('pass' in grade && typeof grade.pass === 'boolean') {
    span.setAttribute(GenAIAttributes.EVALUATION_SCORE_LABEL, grade.pass ? 'pass' : 'fail');
  }
  if ('score' in grade && typeof grade.score === 'number') {
    span.setAttribute(GenAIAttributes.EVALUATION_SCORE_VALUE, grade.score);
  }
  if ('reason' in grade && typeof grade.reason === 'string' && grade.reason) {
    const explanation = sanitizeBody(grade.reason);
    span.setAttribute(
      GenAIAttributes.EVALUATION_EXPLANATION,
      explanation.length > MAX_GRADING_EXPLANATION_LENGTH
        ? `${explanation.slice(0, MAX_GRADING_EXPLANATION_LENGTH - 1)}…`
        : explanation,
    );
  }
}

/** Instrument assertion dispatch and registered graders at their shared invocation boundaries. */
export async function withGraderSpan<T>(ctx: GraderSpanContext, fn: () => Promise<T>): Promise<T> {
  const traceparent = getActiveTraceparent() ?? ctx.traceparent;
  if (!traceparent) {
    return fn();
  }

  const activeTraceparent = getActiveTraceparent();
  const parentContext =
    activeTraceparent?.split('-')[1] === traceparent.split('-')[1]
      ? context.active()
      : propagation.extract(ROOT_CONTEXT, { traceparent });
  const attributes: Record<string, string | number> = {
    [GraderAttributes.GRADER_ID]: ctx.graderId,
    [GenAIAttributes.EVALUATION_NAME]: ctx.graderId,
    [SPAN_ROLE_ATTRIBUTE]: 'grader',
  };
  if (ctx.evalId) {
    attributes[PromptfooAttributes.EVAL_ID] = ctx.evalId;
  }
  if (ctx.testIndex !== undefined) {
    attributes[PromptfooAttributes.TEST_INDEX] = ctx.testIndex;
  }

  return getGenAITracer().startActiveSpan(
    `grader ${ctx.graderId}`,
    { kind: SpanKind.INTERNAL, attributes },
    parentContext,
    async (span) => {
      try {
        const result = await withSpanRole('grader', fn);
        setEvaluationResultAttributes(span, result);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
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
    },
  );
}
