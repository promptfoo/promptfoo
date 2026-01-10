import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
// Import shared sanitization utilities from backend
import {
  isSecretField,
  looksLikeSecret,
  normalizeFieldName,
  REDACTED,
} from '@promptfoo/util/sanitizer';
import yaml from 'js-yaml';
import { findProviderConfig, getProviderDisplayName } from './providerConfig';

interface ProviderDisplayProps {
  /** The provider string from CompletedPrompt (e.g., "google:gemini-3-flash-preview") */
  providerString: string;
  /** The config.providers array from the eval config */
  providersArray: any[] | undefined;
  /** Fallback index for backwards-compatible matching */
  fallbackIndex?: number;
}

/**
 * Header names that contain auth info - their values should be redacted.
 * Note: These are normalized (lowercase, no hyphens) for comparison.
 */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'xapikey', // x-api-key
  'apikey', // api-key
  'xauthtoken', // x-auth-token
  'xaccesstoken', // x-access-token
  'proxyauthorization', // proxy-authorization
]);

/**
 * Fields to completely exclude (not useful for understanding model behavior).
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
 * Check if a header name is sensitive (case-insensitive, normalized).
 */
function isSensitiveHeaderName(headerName: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(normalizeFieldName(headerName));
}

/**
 * Recursively sanitize config for display, redacting sensitive values.
 * Shows field names but hides secret values.
 *
 * This extends the shared sanitizer with frontend-specific features:
 * - Excluded fields (callApi, transform, env, etc.)
 * - Returns undefined for empty objects (cleaner tooltip display)
 * - Higher depth limit (10 vs 4) for detailed config display
 */
export function sanitizeConfig(obj: any, depth = 0, parentKey = ''): any {
  if (depth > 10) {
    return undefined; // Prevent infinite recursion
  }
  if (obj === null || obj === undefined) {
    return undefined;
  }

  // Handle primitive values
  if (typeof obj !== 'object') {
    // Check if the value itself looks like a secret
    if (typeof obj === 'string' && looksLikeSecret(obj)) {
      return REDACTED;
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const filtered = obj
      .map((item) => sanitizeConfig(item, depth + 1, parentKey))
      .filter((x) => x !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  // Handle objects
  const result: Record<string, any> = {};
  const isHeadersObject = normalizeFieldName(parentKey) === 'headers';

  for (const [key, value] of Object.entries(obj)) {
    // Skip excluded fields entirely (frontend-specific)
    if (EXCLUDED_FIELDS.has(key)) {
      continue;
    }

    // Redact sensitive field values (using shared sanitizer logic)
    if (isSecretField(key)) {
      result[key] = REDACTED;
      continue;
    }

    // Redact sensitive header values
    if (isHeadersObject && isSensitiveHeaderName(key)) {
      result[key] = REDACTED;
      continue;
    }

    // Recurse into nested objects
    const sanitizedValue = sanitizeConfig(value, depth + 1, key);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
  const displayId = showId ? providerConfig.id : null;

  // Tooltip: show id (if label used) + sanitized config
  const tooltipContent = useMemo(() => {
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

      // Sanitize the config (redact secrets)
      const sanitizedConfig = sanitizeConfig(restConfig);

      // Build tooltip parts
      const parts: string[] = [];

      // Show id first if label is being used
      if (displayId) {
        parts.push(`id: ${displayId}`);
      }

      // Show sanitized config
      if (sanitizedConfig && Object.keys(sanitizedConfig).length > 0) {
        const configYaml = yaml.dump(sanitizedConfig, {
          indent: 2,
          lineWidth: 80,
          noRefs: true,
          sortKeys: true,
        });
        parts.push(configYaml.trim());
      }

      return parts.length > 0 ? parts.join('\n') : null;
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
  if (!tooltipContent) {
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
        className={cn(
          'max-w-[400px] p-3',
          'bg-gray-100 dark:bg-gray-900',
          'text-gray-900 dark:text-gray-100',
          'border border-border',
        )}
      >
        <pre
          className={cn(
            'm-0 text-[11px] leading-relaxed',
            'max-h-[300px] overflow-auto',
            'whitespace-pre-wrap break-words',
            'font-mono',
          )}
        >
          {tooltipContent}
        </pre>
      </TooltipContent>
    </Tooltip>
  );
}

export default ProviderDisplay;
