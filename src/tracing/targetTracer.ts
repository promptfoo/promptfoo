import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { getGenAITracer, PromptfooAttributes } from './genaiTracer';

export const TargetAttributes = {
  SERVICE_NAME: 'service.name',
  TARGET_TYPE: 'promptfoo.target.type',
  TARGET_LABEL: 'promptfoo.target.label',
} as const;

export type TargetType = 'http' | 'mcp' | 'websocket' | 'provider';

export interface TargetSpanContext {
  targetType: TargetType;
  providerId: string;
  label?: string;
  traceparent: string;
  promptLabel?: string;
  evalId?: string;
  testIndex?: number;
}

/** Record one target span for every evaluated provider, including custom providers. */
export async function withTargetSpan<T>(
  ctx: TargetSpanContext,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const parentContext = propagation.extract(ROOT_CONTEXT, { traceparent: ctx.traceparent });
  const attributes: Record<string, string | number> = {
    [TargetAttributes.SERVICE_NAME]: 'promptfoo-cli',
    [TargetAttributes.TARGET_TYPE]: ctx.targetType,
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
  };

  if (ctx.label) {
    attributes[TargetAttributes.TARGET_LABEL] = ctx.label;
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
    ctx.label || ctx.providerId,
    { kind: SpanKind.CLIENT, attributes },
    parentContext,
    async (span) => {
      try {
        const result = await fn(span);
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

/** Prefer an existing active span when it already belongs to the evaluation trace. */
export function getActiveTargetTraceparent(fallback: string): string {
  const activeSpan = context.active();
  const carrier: Record<string, string> = {};
  propagation.inject(activeSpan, carrier);
  return carrier.traceparent || fallback;
}
