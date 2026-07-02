import { CODING_AGENT_CORE_PLUGINS, CODING_AGENT_PLUGINS } from './constants/codingAgents';
import { ALIASED_PLUGIN_MAPPINGS } from './constants/frameworks';
import {
  BIAS_PLUGINS,
  DEFAULT_PLUGINS,
  FINANCIAL_PLUGINS,
  FOUNDATION_PLUGINS,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  INSURANCE_PLUGINS,
  MEDICAL_PLUGINS,
  PHARMACY_PLUGINS,
  PII_PLUGINS,
  TEEN_SAFETY_PLUGINS,
  TELECOM_PLUGINS,
} from './constants/plugins';

export const runtimePluginCategories = {
  foundation: FOUNDATION_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  'coding-agent:core': CODING_AGENT_CORE_PLUGINS,
  'coding-agent:all': CODING_AGENT_PLUGINS,
  bias: BIAS_PLUGINS,
  pii: PII_PLUGINS,
  medical: MEDICAL_PLUGINS,
  pharmacy: PHARMACY_PLUGINS,
  insurance: INSURANCE_PLUGINS,
  financial: FINANCIAL_PLUGINS,
  telecom: TELECOM_PLUGINS,
  'teen-safety': TEEN_SAFETY_PLUGINS,
  default: [...DEFAULT_PLUGINS],
  'guardrails-eval': GUARDRAILS_EVALUATION_PLUGINS,
} as const;

type PluginLike = { id: string; numTests?: number; config?: Record<string, any>; severity?: any };

/** Expands plugins exactly as synthesis does before it applies strategies. */
export function expandRuntimePlugins<T extends PluginLike>(
  input: T[],
  isDirectPlugin: (id: string) => boolean = () => false,
): {
  plugins: T[];
  strategyIds: string[];
} {
  const withCategories = [...input];
  for (const [category, categoryPlugins] of Object.entries(runtimePluginCategories)) {
    const plugin = input.find((p) => p.id === category);
    if (plugin) {
      withCategories.push(...categoryPlugins.map((id) => ({ ...plugin, id }) as T));
    }
  }

  const plugins: T[] = [];
  const strategyIds: string[] = [];
  for (const plugin of withCategories) {
    if (isDirectPlugin(plugin.id)) {
      plugins.push(plugin);
      continue;
    }
    const mappingKey = Object.keys(ALIASED_PLUGIN_MAPPINGS).find(
      (key) => plugin.id === key || plugin.id.startsWith(`${key}:`),
    );
    const mapping = mappingKey
      ? ALIASED_PLUGIN_MAPPINGS[mappingKey][plugin.id] ||
        Object.values(ALIASED_PLUGIN_MAPPINGS[mappingKey]).find(() =>
          plugin.id.startsWith(`${mappingKey}:`),
        )
      : undefined;
    if (mapping) {
      plugins.push(...mapping.plugins.map((id) => ({ ...plugin, id }) as T));
      strategyIds.push(...mapping.strategies);
    } else if (!(plugin.id in runtimePluginCategories)) {
      plugins.push(plugin);
    }
  }
  return { plugins, strategyIds };
}
