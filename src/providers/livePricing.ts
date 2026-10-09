import { getEnvBool } from '../envars';
import logger from '../logger';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const LIVE_PRICING_TTL_MS = 24 * 60 * 60 * 1000;
const LIVE_PRICING_TIMEOUT_MS = 10_000;

export interface LiveModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

let cache: { costs: Map<string, LiveModelCost>; fetchedAt: number } | undefined;
let pendingRefresh: Promise<void> | undefined;

export function isLivePricingEnabled(): boolean {
  return getEnvBool('PROMPTFOO_LIVE_PRICING', false);
}

function parseRate(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
    return undefined;
  }
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : undefined;
}

function parseLivePricing(body: unknown): Map<string, LiveModelCost> {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    throw new Error('Missing model pricing catalog');
  }
  const costs = new Map<string, LiveModelCost>();
  const aliases = new Map<string, string | undefined>();
  const duplicates = new Set<string>();
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { id, pricing } = entry as {
      id?: unknown;
      pricing?: Record<string, unknown>;
    };
    const input = parseRate(pricing?.prompt);
    const output = parseRate(pricing?.completion);
    if (
      typeof id !== 'string' ||
      !id ||
      id.endsWith(':free') ||
      input === undefined ||
      output === undefined
    ) {
      continue;
    }
    // Keep vendor, punctuation, and snapshot identity. Ambiguous IDs have no fallback.
    if (costs.has(id) || duplicates.has(id)) {
      costs.delete(id);
      duplicates.add(id);
      continue;
    }
    costs.set(id, {
      input,
      output,
      ...(parseRate(pricing?.input_cache_read) === undefined
        ? {}
        : { cacheRead: parseRate(pricing?.input_cache_read) }),
      ...(parseRate(pricing?.input_cache_write) === undefined
        ? {}
        : { cacheWrite: parseRate(pricing?.input_cache_write) }),
    });
    const name = id.slice(id.lastIndexOf('/') + 1);
    aliases.set(name, aliases.has(name) ? undefined : id);
  }
  if (costs.size === 0) {
    throw new Error('No usable model pricing in catalog');
  }
  for (const [alias, id] of aliases) {
    if (id && costs.has(id) && !costs.has(alias) && !duplicates.has(alias)) {
      costs.set(alias, costs.get(id)!);
    }
  }
  return costs;
}

async function fetchPricing(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Model pricing request timed out')),
    LIVE_PRICING_TIMEOUT_MS,
  );
  try {
    // Avoid the shared -> fetch -> shared initialization cycle.
    const { fetchWithProxy } = await import('../util/fetch');
    const response = await fetchWithProxy(OPENROUTER_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`OpenRouter models API returned ${response.status}`);
    }
    // The same abort signal stays active until the body is fully consumed.
    const costs = parseLivePricing(await response.json());
    cache = { costs, fetchedAt: Date.now() };
  } catch (error) {
    logger.debug('[LivePricing] Failed to refresh model pricing', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Share refresh work; cancelling one evaluation must not cancel another's refresh. */
export async function refreshLivePricing(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!isLivePricingEnabled() || (cache && Date.now() - cache.fetchedAt < LIVE_PRICING_TTL_MS)) {
    return;
  }
  pendingRefresh ??= fetchPricing().finally(() => {
    pendingRefresh = undefined;
  });
  if (!signal) {
    return pendingRefresh;
  }
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([pendingRefresh, aborted]);
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', onAbort!);
  }
}

/** Exact catalog IDs, or a unique unqualified model name; no snapshot guessing. */
export function getLiveModelCost(modelName: string): LiveModelCost | undefined {
  return isLivePricingEnabled() ? cache?.costs.get(modelName) : undefined;
}

/** Estimate text usage only when every used category has an explicit or published rate. */
export function calculateLiveCost(
  modelName: string,
  config: { cost?: number; inputCost?: number; outputCost?: number },
  usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
): number | undefined {
  const price = getLiveModelCost(modelName);
  if (!price) {
    return undefined;
  }
  const inputOverride = config.inputCost ?? config.cost;
  const terms = [
    [usage.input, inputOverride ?? price.input],
    [usage.output, config.outputCost ?? config.cost ?? price.output],
    [usage.cacheRead ?? 0, inputOverride ?? price.cacheRead],
    [usage.cacheWrite ?? 0, inputOverride ?? price.cacheWrite],
  ];
  if (
    terms.some(
      ([tokens, rate]) =>
        !Number.isFinite(tokens) ||
        tokens! < 0 ||
        (tokens! > 0 && (rate === undefined || !Number.isFinite(rate) || rate < 0)),
    )
  ) {
    return undefined;
  }
  return terms.reduce((total, [tokens, rate]) => total + tokens! * (rate ?? 0), 0);
}

/** Test-only: reset the in-memory pricing cache after outstanding refreshes settle. */
export function __resetLivePricingForTests(): void {
  cache = undefined;
  pendingRefresh = undefined;
}
