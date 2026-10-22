import { writeFileSync } from 'node:fs';

import { trace } from '@opentelemetry/api';

// Announces that its call has started, then behaves like a stuck network call: it keeps the
// process busy, never settles, and ignores the abort signal. With tracing on, it first ends a
// span so there is something buffered for the SIGTERM flush to deliver.
export default class HangingProvider {
  id() {
    return 'hanging-provider';
  }

  callApi() {
    trace.getTracer('sigterm-smoke').startSpan('sigterm-smoke-before-hang').end();
    writeFileSync(process.env.SIGTERM_SMOKE_STARTED_PATH, 'started');
    setInterval(() => {}, 60_000);
    return new Promise(() => {});
  }
}
