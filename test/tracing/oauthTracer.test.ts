import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpAttributes, OAuthAttributes, withOAuthSpan } from '../../src/tracing/oauthTracer';

const mocks = vi.hoisted(() => ({
  propagationExtract: vi.fn(),
  span: {
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  },
  startActiveSpan: vi.fn(),
}));

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');

  return {
    ...actual,
    propagation: {
      ...actual.propagation,
      extract: mocks.propagationExtract,
    },
    ROOT_CONTEXT: { traceId: 'root' },
    trace: {
      ...actual.trace,
      getTracer: vi.fn(() => ({ startActiveSpan: mocks.startActiveSpan })),
    },
  };
});

/** Arguments the tracer was invoked with for the most recent span. */
function lastSpanCall() {
  const call = mocks.startActiveSpan.mock.calls.at(-1);
  return { name: call?.[0] as string, options: call?.[1], parentContext: call?.[2] };
}

describe('withOAuthSpan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.propagationExtract.mockReturnValue({ traceId: 'parent' });
    mocks.startActiveSpan.mockImplementation((_name, _options, _context, fn) => fn(mocks.span));
  });

  it('records HTTP and OAuth attributes for a token fetch', async () => {
    const result = await withOAuthSpan(
      {
        operation: 'token_fetch',
        url: 'https://auth.example.com:8443/oauth/token?client_secret=shhh',
        grantType: 'client_credentials',
        clientId: 'client-abcdef-0123',
        scopes: ['read', 'write'],
        providerType: 'http',
      },
      async () => 'token',
    );

    expect(result).toBe('token');
    const { name, options } = lastSpanCall();
    expect(name).toBe('POST /oauth/token');
    expect(options.kind).toBe(SpanKind.CLIENT);
    expect(options.attributes).toEqual({
      [HttpAttributes.REQUEST_METHOD]: 'POST',
      // Query string is dropped so credentials in the URL never reach the exporter.
      [HttpAttributes.URL_FULL]: 'https://auth.example.com:8443/oauth/token',
      [HttpAttributes.URL_SCHEME]: 'https',
      [HttpAttributes.URL_PATH]: '/oauth/token',
      [HttpAttributes.SERVER_ADDRESS]: 'auth.example.com',
      [HttpAttributes.SERVER_PORT]: 8443,
      [OAuthAttributes.OPERATION]: 'token_fetch',
      [OAuthAttributes.GRANT_TYPE]: 'client_credentials',
      [OAuthAttributes.CLIENT_ID]: 'clie...0123',
      [OAuthAttributes.SCOPES]: ['read', 'write'],
      [OAuthAttributes.PROVIDER_TYPE]: 'http',
    });
    expect(mocks.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mocks.span.end).toHaveBeenCalledTimes(1);
  });

  it('fully redacts a short client id', async () => {
    await withOAuthSpan(
      { operation: 'token_refresh', url: 'https://auth.example.com/token', clientId: 'abc123' },
      async () => undefined,
    );

    expect(lastSpanCall().options.attributes[OAuthAttributes.CLIENT_ID]).toBe('***');
  });

  it('omits optional attributes that were not provided', async () => {
    await withOAuthSpan(
      { operation: 'token_refresh', url: 'http://auth.example.com/token', scopes: [] },
      async () => undefined,
    );

    const { name, options } = lastSpanCall();
    expect(name).toBe('POST /token');
    expect(options.attributes[HttpAttributes.SERVER_PORT]).toBe(80);
    expect(options.attributes).not.toHaveProperty(OAuthAttributes.GRANT_TYPE);
    expect(options.attributes).not.toHaveProperty(OAuthAttributes.CLIENT_ID);
    expect(options.attributes).not.toHaveProperty(OAuthAttributes.SCOPES);
    expect(options.attributes).not.toHaveProperty(OAuthAttributes.PROVIDER_TYPE);
  });

  it('defaults discovery operations to GET and https port 443', async () => {
    await withOAuthSpan(
      { operation: 'discovery', url: 'https://mcp.example.com/mcp', providerType: 'mcp' },
      async () => 'https://mcp.example.com/token',
    );

    const { name, options } = lastSpanCall();
    expect(name).toBe('GET /mcp');
    expect(options.attributes[HttpAttributes.REQUEST_METHOD]).toBe('GET');
    expect(options.attributes[HttpAttributes.SERVER_PORT]).toBe(443);
  });

  it('falls back to a generic span name and truncated url when the url is unparseable', async () => {
    const url = `not-a-url-${'x'.repeat(400)}`;
    await withOAuthSpan({ operation: 'token_fetch', url }, async () => undefined);

    const { name, options } = lastSpanCall();
    expect(name).toBe('POST oauth_token_fetch');
    expect(options.attributes[HttpAttributes.URL_FULL]).toBe(url.slice(0, 256));
    expect(options.attributes).not.toHaveProperty(HttpAttributes.SERVER_ADDRESS);
  });

  it('drops the query string when an unparseable url carries credentials', async () => {
    await withOAuthSpan(
      { operation: 'token_fetch', url: 'not-a-url/token?client_secret=shhh' },
      async () => undefined,
    );

    expect(lastSpanCall().options.attributes[HttpAttributes.URL_FULL]).toBe('not-a-url/token');
  });

  it('extracts a parent context from traceparent', async () => {
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    await withOAuthSpan(
      { operation: 'token_fetch', url: 'https://auth.example.com/token', traceparent },
      async () => undefined,
    );

    expect(mocks.propagationExtract).toHaveBeenCalledWith({ traceId: 'root' }, { traceparent });
    expect(lastSpanCall().parentContext).toEqual({ traceId: 'parent' });
  });

  it('applies the result extractor to set response attributes', async () => {
    await withOAuthSpan(
      { operation: 'token_fetch', url: 'https://auth.example.com/token' },
      async () => ({ expiresIn: 3600, httpStatusCode: 200 }),
      ({ expiresIn, httpStatusCode }) => ({ expiresIn, httpStatusCode, cacheHit: false }),
    );

    expect(mocks.span.setAttribute).toHaveBeenCalledWith(HttpAttributes.RESPONSE_STATUS_CODE, 200);
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(OAuthAttributes.EXPIRES_IN, 3600);
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(OAuthAttributes.CACHE_HIT, false);
  });

  it('records the exception and rethrows when the operation fails', async () => {
    const error = new Error('token endpoint returned 401');

    await expect(
      withOAuthSpan(
        { operation: 'token_fetch', url: 'https://auth.example.com/token' },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow('token endpoint returned 401');

    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'token endpoint returned 401',
    });
    expect(mocks.span.recordException).toHaveBeenCalledWith(error);
    expect(mocks.span.end).toHaveBeenCalledTimes(1);
  });

  it('ends the span for a non-Error throw without recording an exception', async () => {
    await expect(
      withOAuthSpan({ operation: 'discovery', url: 'https://mcp.example.com/mcp' }, async () => {
        throw 'discovery failed';
      }),
    ).rejects.toBe('discovery failed');

    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'discovery failed',
    });
    expect(mocks.span.recordException).not.toHaveBeenCalled();
    expect(mocks.span.end).toHaveBeenCalledTimes(1);
  });
});
