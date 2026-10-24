import { writeFileSync } from 'node:fs';

import { trace } from '@opentelemetry/api';

// Announces that its call has started, then behaves like a stuck network call: it keeps the
// process busy and ignores the abort signal. With tracing on, it first ends a span so there is
// something buffered for the SIGTERM flush to deliver. When SIGTERM_SMOKE_SETTLE_AFTER_MS is set,
// the call instead settles that long after SIGTERM arrives, ending a second span on the way.
export default class HangingProvider {
  id() {
    return 'hanging-provider';
  }

  callApi() {
    const tracer = trace.getTracer('sigterm-smoke');
    tracer.startSpan('sigterm-smoke-before-hang').end();
    const settling = tracer.startSpan('sigterm-smoke-settled-after-signal');
    const keepAlive = setInterval(() => {}, 60_000);
    const settleAfterMs = Number(process.env.SIGTERM_SMOKE_SETTLE_AFTER_MS);
    writeFileSync(process.env.SIGTERM_SMOKE_STARTED_PATH, 'started');
    if (!settleAfterMs) {
      return new Promise(() => {});
    }
    return new Promise((resolve) => {
      process.once('SIGTERM', () => {
        setTimeout(() => {
          settling.end();
          clearInterval(keepAlive);
          resolve({ output: 'settled' });
        }, settleAfterMs);
      });
    });
  }
}
