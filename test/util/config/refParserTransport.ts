import dns from 'node:dns/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';

import { vi } from 'vitest';
import type { Mock } from 'vitest';

type FetchLike = (input: any, init?: any) => Promise<Response>;

// Resolve from the parser's own directory: it has a nested `undici` that differs from the
// top-level copy promptfoo depends on.
const parserRequire = createRequire(
  createRequire(import.meta.url).resolve('@apidevtools/json-schema-ref-parser/package.json'),
);
const parserTransport = parserRequire('undici') as { fetch: FetchLike };

const realFetch: FetchLike = parserTransport.fetch;
let handler: FetchLike | undefined;

// The parser reaches its transport with `await import('undici')`. Node builds that namespace from
// the CommonJS exports once and freezes it, so a spy installed after the first remote request is
// never seen. Install one permanent delegating hook now, at import time -- before any test can
// trigger that first request -- and let each test swap the handler behind it.
parserTransport.fetch = (input, init) => (handler ?? realFetch)(input, init);

// A public address, so the parser's own SSRF check treats the host as safe.
const PINNED_ADDRESS = [{ address: '93.184.216.34', family: 4 }];

/**
 * Intercept the transport `@apidevtools/json-schema-ref-parser` uses for remote `$ref`s.
 *
 * Since v16 the parser validates the host with `dns.lookup` and then fetches through its own
 * nested `undici`, pinned to the validated address. That path never reaches `globalThis.fetch`,
 * so spying there observes nothing and lets a test fall through to the real network.
 *
 * The returned mock stands in for the `globalThis.fetch` spy it replaces: `mockImplementation()` /
 * `mockResolvedValue()` serve responses, and `mock.calls` records the URLs the parser requested.
 * Left unconfigured it records calls and passes them through to the real transport, which is what
 * the "must not fetch" assertions rely on. `dns.lookup` is stubbed too, so no test resolves a real
 * hostname.
 *
 * Pair with {@link restoreRefParserTransport} in `afterEach`.
 */
export function spyOnRefParserFetch(): Mock<FetchLike> {
  vi.spyOn(dns, 'lookup').mockResolvedValue(PINNED_ADDRESS as never);
  syncBuiltinESMExports();
  const spy = vi.fn(realFetch);
  handler = spy;
  return spy;
}

/** Undo everything {@link spyOnRefParserFetch} installed, including the `node:dns` ESM binding. */
export function restoreRefParserTransport(): void {
  handler = undefined;
  vi.restoreAllMocks();
  syncBuiltinESMExports();
}
