import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import yaml from 'js-yaml';
import { findProviderConfig, getProviderDisplayName, type ProviderDef } from './providerConfig';

interface ProviderDisplayProps {
  /** The provider string from CompletedPrompt (e.g., "google:gemini-3-flash-preview") */
  providerString: string;
  /** The config.providers array from the eval config */
  providersArray: ProviderDef[] | undefined;
  /** Fallback index for backwards-compatible matching */
  fallbackIndex?: number;
}

/**
 * Fields to exclude from display (not useful for understanding model behavior).
 * These are implementation details or shown elsewhere in the UI.
 */
const EXCLUDED_FIELDS = new Set([
  'callApi',
  'callEmbeddingApi',
  'callClassificationApi',
  'prompts',
  'transform',
  'delay',
  'env',
]);

/**
 * Recursively filter config for display, removing non-useful fields.
 * Returns undefined for empty objects to keep tooltip clean.
 */
// biome-ignore lint/suspicious/noExplicitAny: Test compatibility requires any
export function filterConfigForDisplay(obj: any, depth = 0): any {
  if (depth > 10) {
    return undefined; // Prevent infinite recursion
  }
  if (obj === null || obj === undefined) {
    return undefined;
  }

  // Handle primitive values - pass through as-is
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const filtered = obj
      .map((item) => filterConfigForDisplay(item, depth + 1))
      .filter((x) => x !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  // Handle objects - filter out excluded fields
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip excluded fields (implementation details)
    if (EXCLUDED_FIELDS.has(key)) {
      continue;
    }

    // Recurse into nested objects
    const filteredValue = filterConfigForDisplay(value, depth + 1);
    if (filteredValue !== undefined) {
      result[key] = filteredValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Renders config as formatted YAML with syntax highlighting.
 */
function StyledConfigContent({
  displayId,
  configYaml,
}: {
  displayId: string | null;
  configYaml: string | null;
}): ReactNode {
  // Build the full YAML content
  let fullYaml = '';
  if (displayId) {
    fullYaml = `id: ${displayId}`;
  }
  if (configYaml) {
    fullYaml = fullYaml ? `${fullYaml}\n${configYaml}` : configYaml;
  }

  if (!fullYaml) {
    return null;
  }

  // Apply syntax highlighting to YAML
  const highlighted = fullYaml.split('\n').map((line, index) => {
    // Match pattern: indentation, key, colon, optional value
    const match = line.match(/^(\s*)([^:]+)(:)(.*)$/);
    if (!match) {
      // Lines without colons (like array items starting with -)
      return (
        <div key={index} className="whitespace-pre text-slate-700 dark:text-slate-300">
          {line}
        </div>
      );
    }

    const [, indent, key, colon, value] = match;
    const trimmedValue = value.trim();

    // Determine value color based on type
    let valueClass = 'text-slate-700 dark:text-slate-300';
    if (trimmedValue === 'true' || trimmedValue === 'false') {
      valueClass = 'text-amber-600 dark:text-amber-400';
    } else if (/^-?\d+\.?\d*$/.test(trimmedValue)) {
      valueClass = 'text-emerald-600 dark:text-emerald-400';
    }

    return (
      <div key={index} className="whitespace-pre">
        <span className="text-slate-500 dark:text-slate-500">{`${indent}${key}${colon}`}</span>
        <span className={valueClass}>{value}</span>
      </div>
    );
  });

  return <>{highlighted}</>;
}

/**
 * Displays provider name with full config available on hover.
 * Minimal design: just the name, details in tooltip.
 */
export function ProviderDisplay({
  providerString,
  providersArray,
  fallbackIndex,
}: ProviderDisplayProps) {
  const { config: providerConfig, matchType } = useMemo(
    () => findProviderConfig(providerString, providersArray, fallbackIndex),
    [providerString, providersArray, fallbackIndex],
  );

  const { prefix, name, label } = useMemo(
    () => getProviderDisplayName(providerString, providerConfig, matchType),
    [providerString, providerConfig, matchType],
  );

  // Compute what text the user actually sees displayed
  // - If there's a label, we show the label
  // - Otherwise we show "prefix:name" (or just "name" if prefix === name, e.g., "echo")
  const displayedText = label || (prefix && prefix !== name ? `${prefix}:${name}` : name);

  // Show the underlying provider id in tooltip only when it differs from what's displayed.
  // This provides context without redundancy:
  // - User sees "My Custom GPT" → tooltip shows "id: openai:gpt-4o"
  // - User sees "gpt-4o" (label) → tooltip shows "id: openai:gpt-4o"
  // - User sees "openai:gpt-4o" → no id in tooltip (already visible)
  const showId =
    providerConfig?.id &&
    typeof providerConfig.id === 'string' &&
    providerConfig.id.trim() &&
    providerConfig.id !== displayedText;
  const displayId: string | null = showId && providerConfig.id ? providerConfig.id : null;

  // Tooltip: show id (if label used) + filtered config as YAML
  const tooltipData = useMemo(() => {
    if (!providerConfig) {
      return null;
    }

    try {
      // Extract the actual config - unwrap ProviderOptions structure
      let configToShow = providerConfig.config || providerConfig;

      // Handle double-nested config (sometimes config.config exists)
      if (configToShow.config && typeof configToShow.config === 'object') {
        configToShow = configToShow.config;
      }

      // Remove id/label from the config display (shown separately or in provider name)
      const { id: _id, label: _label, ...restConfig } = configToShow;

      // Filter the config (remove non-useful fields like callApi, transform, env)
      const filteredConfig = filterConfigForDisplay(restConfig);

      // Generate YAML for config - wrap in config: to match actual YAML structure
      let configYaml: string | null = null;
      if (filteredConfig && Object.keys(filteredConfig).length > 0) {
        configYaml = yaml
          .dump(
            { config: filteredConfig },
            {
              indent: 2,
              lineWidth: 80,
              noRefs: true,
              sortKeys: true,
            },
          )
          .trim();
      }

      // Return null if nothing to show
      if (!displayId && !configYaml) {
        return null;
      }

      return { displayId, configYaml };
    } catch {
      return null;
    }
  }, [providerConfig, displayId]);

  // Provider name display content
  const providerLabel = label ? (
    <span className="font-semibold">{label}</span>
  ) : prefix && prefix !== name ? (
    // Standard format: "openai:gpt-4o"
    <span>
      <span className="text-muted-foreground">{prefix}:</span>
      <span className="font-semibold">{name}</span>
    </span>
  ) : (
    // Provider without colon (e.g., "echo", "ollama") - just show name
    <span className="font-semibold">{name}</span>
  );

  // Only wrap in Tooltip if there's content to display
  if (!tooltipData) {
    return <span className="cursor-default">{providerLabel}</span>;
  }

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="cursor-help">{providerLabel}</span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        className={cn(
          'max-w-[420px] p-0 overflow-hidden',
          'bg-white dark:bg-zinc-900',
          'rounded-lg shadow-lg',
          'border border-gray-200/80 dark:border-zinc-700/80',
        )}
      >
        <div
          className={cn(
            'px-3 py-2.5',
            'text-xs leading-relaxed',
            'max-h-[320px] overflow-auto',
            'font-mono',
          )}
        >
          <StyledConfigContent
            displayId={tooltipData.displayId}
            configYaml={tooltipData.configYaml}
          />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default ProviderDisplay;
