import { withRetries } from '../src/lib/guardrails';

/**
 * Scenario A: transient 429 once, then success.
 * Verifies: we wait (honoring Retry-After) and then succeed.
 */
async function transient429ThenOk() {
  let calls = 0;
  const t0 = Date.now();

  const result = await withRetries<null, { ok: boolean; calls: number }>(
    async (_args, _signal) => {
      calls++;
      if (calls === 1) {
        const e: any = new Error('HTTP 429');
        e.status = 429;
        e.retryAfterSeconds = 0.05; // 50ms suggested by server
        throw e;
      }
      return { ok: true, calls };
    },
    null,
    'openai',
    {
      retryBudget: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
      timeoutMs: 5_000,
      respectRetryAfter: true,
    },
  );

  const waited = Date.now() - t0;
  console.log('[A] result:', result, 'waited(ms)≈', waited);
}

/**
 * Scenario B: persistent 500.
 * Verifies: we retry up to budget and then throw provider_error.
 */
async function persistent500() {
  let calls = 0;
  try {
    await withRetries(
      async () => {
        calls++;
        const e: any = new Error('HTTP 500');
        e.status = 500;
        throw e;
      },
      null,
      'openai',
      {
        retryBudget: 1, // 1 retry then fail
        baseDelayMs: 10,
        maxDelayMs: 20,
        timeoutMs: 5_000,
      },
    );
  } catch (err: any) {
    console.log('[B] threw as expected:', {
      type: err?.type,
      code: err?.code,
      provider: err?.provider,
      message: err?.message,
      raw: err?.raw,
      calls,
    });
    return;
  }
  console.log('[B] unexpected success');
}

(async () => {
  await transient429ThenOk();
  await persistent500();
})();
