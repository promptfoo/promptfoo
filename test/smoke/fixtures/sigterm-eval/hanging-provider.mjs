import { writeFileSync } from 'node:fs';

// Announces that its call has started, then behaves like a stuck network call: it keeps the
// process busy, never settles, and ignores the abort signal.
export default class HangingProvider {
  id() {
    return 'hanging-provider';
  }

  callApi() {
    writeFileSync(process.env.SIGTERM_SMOKE_STARTED_PATH, 'started');
    setInterval(() => {}, 60_000);
    return new Promise(() => {});
  }
}
