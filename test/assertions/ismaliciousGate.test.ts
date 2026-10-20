import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleJavascript } from '../../src/assertions/javascript';

import type { AtomicTestCase } from '../../src/types/index';

interface GateResult {
  pass: boolean;
  score: number;
  reason: string;
}

type GateAssertion = (
  output: unknown,
  context?: { config?: { source_url?: unknown } },
) => Promise<GateResult>;

const require = createRequire(import.meta.url);
const gateModule = require('../../examples/ismalicious-gate/gate-assertion.cjs') as {
  createAssertion: (options: {
    fetchImpl?: typeof fetch;
    credentials?: { apiKey: string; apiSecret: string };
    timeoutMs?: number;
  }) => GateAssertion;
};
const credentials = { apiKey: 'fixture-key', apiSecret: 'fixture-secret' };
const allowed = {
  verdict: 'allow',
  injection: { score: 0, families: [], spans: [] },
  links: [],
  links_truncated: false,
  mode: 'fast',
  latency_ms: 7,
};

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('IsMalicious Gate example assertion', () => {
  it('sends the complete text and exact source URL with no redirects', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(allowed));
    const assertion = gateModule.createAssertion({ fetchImpl, credentials });
    const content = 'Quoted "instructions" with accents: été 🐈';
    const source_url = 'https://example.test/path?a=1,b=2#fragment';
    const result = await assertion(content, { config: { source_url } });
    expect(result.pass).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.ismalicious.com/gate/scan');
    expect(JSON.parse(options?.body as string)).toEqual({ content, mode: 'fast', source_url });
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-KEY': Buffer.from('fixture-key:fixture-secret').toString('base64'),
    });
    expect(JSON.stringify(result)).not.toContain(content);
    expect(JSON.stringify(result)).not.toContain(credentials.apiSecret);
  });

  it.each(['warn', 'block'])('refuses a valid %s verdict', async (verdict) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ ...allowed, verdict }));
    const result = await gateModule.createAssertion({ fetchImpl, credentials })('text');
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: `Gate verdict ${verdict}; assertion failed.`,
    });
  });

  it('preserves the distinction between allow and unknown link reputation', async () => {
    const links = [
      {
        url: 'https://example.test/',
        entity: 'domain:example.test',
        verdict: 'unknown',
        sources: 0,
      },
    ];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ ...allowed, links }));
    const result = await gateModule.createAssertion({ fetchImpl, credentials })('text');
    expect(result.pass).toBe(true);
    expect(result.reason).toContain('1 links have unknown reputation');
    expect(result.reason).not.toMatch(/safe|benign|clean/i);
  });

  it('fails when the API reports truncated link inspection', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ ...allowed, links_truncated: true }));
    expect((await gateModule.createAssertion({ fetchImpl, credentials })('text')).pass).toBe(false);
  });

  it.each([401, 429, 500, 302])('fails on HTTP %i without retry', async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ error: 'private' }, status));
    const result = await gateModule.createAssertion({ fetchImpl, credentials })('private content');
    expect(result.pass).toBe(false);
    expect(result.reason).toContain(`HTTP ${status}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.reason).not.toContain('private');
  });

  it.each([
    null,
    { verdict: 'allow' },
    { ...allowed, verdict: 'unknown' },
    { ...allowed, injection: { score: 2, families: [], spans: [] } },
    { ...allowed, injection: { score: 0, families: [null], spans: [] } },
    {
      ...allowed,
      injection: { score: 0, families: [], spans: [{ start: 4, end: 2, family: 'x' }] },
    },
    { ...allowed, links: [{ verdict: 'clean' }] },
    { ...allowed, links_truncated: 'false' },
    { ...allowed, mode: 'unsupported' },
    { ...allowed, latency_ms: -1 },
    { ...allowed, source: 'not a link' },
    { ...allowed, sanitized_content: 42 },
  ])('fails closed on malformed response %#', async (value) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(value));
    expect((await gateModule.createAssertion({ fetchImpl, credentials })('text')).pass).toBe(false);
  });

  it('does not include malformed JSON or exception text in the reason', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private non-json'));
    const result = await gateModule.createAssertion({ fetchImpl, credentials })('private content');
    expect(result.pass).toBe(false);
    expect(result.reason).not.toContain('private');
  });

  it('rejects a response larger than the example limit', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...allowed, padding: 'x'.repeat(1024 * 1024) })),
      );
    expect((await gateModule.createAssertion({ fetchImpl, credentials })('text')).pass).toBe(false);
  });

  it.each(['', {}, ['text'], new Uint8Array([1])])(
    'rejects unsupported output %# before HTTP',
    async (output) => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect((await gateModule.createAssertion({ fetchImpl, credentials })(output)).pass).toBe(
        false,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(['x'.repeat(1024 * 1024), 'é'.repeat(512 * 1024), '"'.repeat(512 * 1024)])(
    'measures the complete serialized UTF-8 body %# before HTTP',
    async (output) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const result = await gateModule.createAssertion({ fetchImpl, credentials })(output);
      expect(result.reason).toContain('1 MiB');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(['file:///secret', 'https://user:password@example.test/', 42, 'not a URL'])(
    'rejects invalid source URL %#',
    async (source_url) => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect(
        (
          await gateModule.createAssertion({ fetchImpl, credentials })('text', {
            config: { source_url },
          })
        ).pass,
      ).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('fails before HTTP when credentials are absent', async () => {
    vi.stubEnv('ISMALICIOUS_API_KEY', '');
    vi.stubEnv('ISMALICIOUS_API_SECRET', '');
    const fetchImpl = vi.fn<typeof fetch>();
    expect((await gateModule.createAssertion({ fetchImpl })('text')).pass).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a network exception without disclosing its message', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('fixture-secret raw content'));
    const result = await gateModule.createAssertion({ fetchImpl, credentials })('text');
    expect(result.pass).toBe(false);
    expect(result.reason).not.toMatch(/fixture-secret|raw content/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the configured 15-second abort fires', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('private timeout')), {
            once: true,
          });
        }),
    );
    const pending = gateModule.createAssertion({ fetchImpl, credentials })('text');
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;
    expect(timeout).toHaveBeenCalledWith(15000);
    expect(result.pass).toBe(false);
    expect(result.reason).not.toContain('private');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['allow', 'warn', 'block'])(
    'works with the native JavaScript handler for %s',
    async (verdict) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ ...allowed, verdict }));
      const gate = gateModule.createAssertion({ fetchImpl, credentials });
      const valueFromScript = await gate('text');
      const test: AtomicTestCase = { vars: {} };
      const result = await handleJavascript({
        baseType: 'javascript',
        assertion: { type: 'javascript', value: 'file://gate-assertion.cjs' },
        renderedValue: 'file://gate-assertion.cjs',
        valueFromScript,
        assertionValueContext: {
          vars: {},
          test,
          prompt: 'text',
          logProbs: undefined,
          provider: undefined,
          providerResponse: { output: 'text' },
        },
        outputString: 'text',
        output: 'text',
        providerResponse: { output: 'text' },
        test,
        inverse: false,
      });
      expect(result.pass).toBe(verdict === 'allow');
      expect(result.score).toBe(verdict === 'allow' ? 1 : 0);
    },
  );
});
