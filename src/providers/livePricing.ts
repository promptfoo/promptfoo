import { getEnvBool } from '../envars';
import logger from '../logger';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const LIVE_PRICING_TTL_MS = 24 * 60 * 60 * 1000;
const LIVE_PRICING_TIMEOUT_MS = 10_000;

interface LiveModelCost {
  input: number;
  output: number;
}

interface LivePricingCache {
  costs: Map<string, LiveModelCost>;
  fetchedAt: number;
}

let cache: LivePricingCache | undefined;

/**
 * Whether the opt-in live pricing fallback is enabled. Never fetches on its
 * own; when disabled, cost calculation behaves exactly as before.
 */
export function isLivePricingEnabled(): boolean {
  return getEnvBool('PROMPTFOO_LIVE_PRICING', false);
}

/**
 * Normalizes a model id for cross-provider pricing lookup:
 * strips promptfoo provider prefixes (`anthropic:messages:claude-...`),
 * OpenRouter vendor prefixes (`anthropic/claude-...`), dated snapshot
 * suffixes (`...-20251001`, `...@2025-10-01`), and separator characters
 * so `claude-haiku-4-5-20251001` matches `claude-haiku-4.5`.
 */
function normalizeModelId(modelName: string): string {
  let id = modelName;
  const lastColon = id.lastIndexOf(':');
  if (lastColon !== -1) {
    id = id.slice(lastColon + 1);
  }
  const lastSlash = id.lastIndexOf('/');
  if (lastSlash !== -1) {
    id = id.slice(lastSlash + 1);
  }
  id = id.replace(/-?\d{8}$/, '');
  id = id.replace(/-?@\d{4}-\d{2}-\d{2}$/, '');
  id = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseLivePricing(body: unknown): Map<string, LiveModelCost> {
  const costs = new Map<string, LiveModelCost>();
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return costs;
  }
  for (const entry of data) {
    const { id, pricing } = entry as {
      id?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    };
    const input = Number(pricing?.prompt);
    const output = Number(pricing?.completion);
    if (typeof id !== 'string' || !Number.isFinite(input) || !Number.isFinite(output)) {
      continue;
    }
    // Skip :free variants so a $0 free-tier price can never shadow the paid
    // model under the same normalized key.
    if (id.endsWith(':free')) {
      continue;
    }
    const key = normalizeModelId(id);
    // First entry wins on segment collisions; OpenRouter prices per token,
    // the same unit promptfoo's static tables use.
    if (!costs.has(key)) {
      costs.set(key, { input, output });
    }
  }
  return costs;
}

/**
 * Warms the live pricing cache. No-op when the feature is disabled or the
 * cache is still fresh; on fetch failure it keeps any stale entries so an
 * offline run degrades to whatever was fetched before (or to the pre-feature
 * behavior when nothing was ever fetched).
 */
export async function refreshLivePricing(): Promise<void> {
  if (!isLivePricingEnabled()) {
    return;
  }
  if (cache && Date.now() - cache.fetchedAt < LIVE_PRICING_TTL_MS) {
    return;
  }
  try {
    // Lazy import: a static import here closes a dependency cycle
    // shared.ts > livePricing.ts > util/fetch > shared.ts that the
    // Style Check madge gate rejects (same pattern as globalConfig/cloud.ts).
    const { fetchWithTimeout } = await import('../util/fetch');
    const response = await fetchWithTimeout(
      OPENROUTER_MODELS_URL,
      { headers: { Accept: 'application/json' } },
      LIVE_PRICING_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`OpenRouter models API returned ${response.status}`);
    }
    const costs = parseLivePricing(await response.json());
    cache = { costs, fetchedAt: Date.now() };
  } catch (err) {
    logger.debug('[LivePricing] Failed to refresh model pricing', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Looks up live pricing for a model from the warmed cache. Returns undefined
 * when the feature is disabled, the cache is empty, or the model is unknown.
 */
export function getLiveModelCost(modelName: string): LiveModelCost | undefined {
  return cache?.costs.get(normalizeModelId(modelName));
}

/** Test-only: reset the in-memory pricing cache. */
export function __resetLivePricingForTests(): void {
  cache = undefined;
}
