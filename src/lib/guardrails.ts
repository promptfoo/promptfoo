import { providerError } from './errors';
import type { EvalErrorInfo } from '../types/result';

export interface GuardrailConfig {
  retryBudget?: number; // default 2
  baseDelayMs?: number; // default 250
  maxDelayMs?: number; // default 4000
  timeoutMs?: number; // default 60000
  respectRetryAfter?: boolean; // default true
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function jitter(ms: number) {
  // 50–150% jitter to reduce thundering herds
  return Math.floor(ms * (0.5 + Math.random()));
}

export type ProviderCall<TArgs, TResp> = (args: TArgs, signal: AbortSignal) => Promise<TResp>;

/**
 * Wrap a provider call with timeout + jittered exponential backoff retries.
 * On exhaustion, throws AppError(provider_error) with structured info.
 */
export async function withRetries<TArgs, TResp>(
  call: ProviderCall<TArgs, TResp>,
  args: TArgs,
  providerName: string,
  cfg: GuardrailConfig = {},
): Promise<TResp> {
  const retryBudget = cfg.retryBudget ?? 2;
  const base = cfg.baseDelayMs ?? 250;
  const max = cfg.maxDelayMs ?? 4000;
  const timeoutMs = cfg.timeoutMs ?? 60_000;
  const respectRetryAfter = cfg.respectRetryAfter ?? true;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const out = await call(args, controller.signal);
      clearTimeout(timeout);
      return out;
    } catch (err: any) {
      attempt++;

      const code = err?.code ?? err?.status ?? err?.name;
      const status = err?.status as number | undefined;
      const retryAfterHeader = err?.retryAfterSeconds;
      const retryAfter = Number(retryAfterHeader);

      const aborted = controller.signal.aborted;
      const retryable =
        aborted ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        status === 429 ||
        (status && status >= 500 && status < 600);

      if (!retryable || attempt > retryBudget) {
        clearTimeout(timeout);
        throw providerError(`Provider request failed after ${attempt} attempt(s)`, {
          provider: providerName,
          code: typeof code === 'string' ? code : String(code ?? status ?? 'UNKNOWN'),
          raw: { status, code, message: err?.message },
          hint:
            status === 429
              ? 'Hit rate limit. Lower concurrency or enable caching.'
              : 'Check network/credentials or retry later.',
        } as Partial<EvalErrorInfo>);
      }

      let delay = Math.min(max, base * 2 ** (attempt - 1));
      if (respectRetryAfter && Number.isFinite(retryAfter) && retryAfter! > 0) {
        delay = Math.max(delay, retryAfter! * 1000);
      }
      await sleep(jitter(delay));
      clearTimeout(timeout);
    }
  }
}
