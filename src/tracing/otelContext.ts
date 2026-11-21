import { AsyncLocalStorage } from 'node:async_hooks';

import { defaultTextMapGetter, ProxyTracerProvider, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import type { Tracer, TracerProvider } from '@opentelemetry/api';
import type { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { TracerProvider as SdkTracerProvider } from '@opentelemetry/sdk-trace';

export const traceContextPropagator = new W3CTraceContextPropagator();

/** Explicit traceparent values use W3C format independently of the host's propagator. */
export function extractTraceparentContext(traceparent: string) {
  return traceContextPropagator.extract(ROOT_CONTEXT, { traceparent }, defaultTextMapGetter);
}

interface OtelScope {
  provider?: SdkTracerProvider;
}

// Custom providers can load the public package alongside the CLI bundle. Share the
// storage object, never a current provider, so both observe the same async scope.
const OTEL_ROUTING_KEY = Symbol.for('promptfoo.otelRouting.v1');
interface OtelRoutingState {
  provider: TracerProvider;
  owners: Map<SdkTracerProvider, OtelScope>;
  scope: AsyncLocalStorage<OtelScope>;
  handlers?: ReadonlyArray<readonly ['SIGTERM' | 'SIGINT' | 'beforeExit', () => Promise<void>]>;
  contextManager?: AsyncLocalStorageContextManager;
}
const globalScopes = globalThis as { [OTEL_ROUTING_KEY]?: OtelRoutingState };
const noopProvider = new ProxyTracerProvider();
export const routingState: OtelRoutingState = (globalScopes[OTEL_ROUTING_KEY] ??= {
  provider: createRoutingProvider(),
  owners: new Map(),
  scope: new AsyncLocalStorage<OtelScope>(),
});
/** Isolate provider ownership even for evaluations with tracing disabled. */
export function withOtelContext<T>(fn: () => T): T {
  return routingState.scope.run({}, fn);
}

export function getOtelScope(): OtelScope | undefined {
  return routingState.scope.getStore();
}

/** Use the evaluation's provider without replacing a host application's global provider. */
export function getOtelTracer(name: string, version?: string): Tracer {
  const scope = getOtelScope();
  if (!scope) {
    return trace.getTracer(name, version);
  }
  if (scope.provider) {
    return scope.provider.getTracer(name, version);
  }
  const globalProvider = trace.getTracerProvider();
  if (isProxyTracerProvider(globalProvider)) {
    // A disabled turn can outlive its async scope. Capture only a real host
    // delegate; a dynamic router could later select another evaluation.
    const hostTracer =
      globalProvider.getDelegate() === routingState.provider
        ? undefined
        : globalProvider.getDelegateTracer(name, version);
    return hostTracer ?? noopProvider.getTracer(name, version);
  }
  return trace.getTracer(name, version);
}

export function isProxyTracerProvider(
  provider: TracerProvider,
): provider is TracerProvider & Pick<ProxyTracerProvider, 'getDelegate' | 'getDelegateTracer'> {
  // OTel shares its global registration across installed API copies. Their
  // public proxy methods are compatible even when class identities differ.
  return (
    'getDelegate' in provider &&
    typeof provider.getDelegate === 'function' &&
    'getDelegateTracer' in provider &&
    typeof provider.getDelegateTracer === 'function'
  );
}

function createRoutingProvider(): TracerProvider {
  return {
    getTracer(name, version, options) {
      // A custom provider can cache this tracer before the first evaluation.
      // Resolve both evaluation ownership and a later host SDK for each span.
      const current = () => {
        const globalProvider = trace.getTracerProvider();
        if (
          isProxyTracerProvider(globalProvider) &&
          globalProvider.getDelegate() !== routingState.provider
        ) {
          const hostTracer = globalProvider.getDelegateTracer(name, version, options);
          if (hostTracer) {
            return hostTracer;
          }
        }
        return (
          getOtelScope()?.provider?.getTracer(name, version, options) ??
          noopProvider.getTracer(name, version, options)
        );
      };
      return {
        startSpan: (spanName, spanOptions, parentContext) =>
          current().startSpan(spanName, spanOptions, parentContext),
        startActiveSpan(...args: unknown[]) {
          const tracer = current();
          return Reflect.apply(tracer.startActiveSpan, tracer, args);
        },
      };
    },
  };
}
