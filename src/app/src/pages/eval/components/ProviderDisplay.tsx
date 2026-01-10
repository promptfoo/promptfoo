import { useMemo } from 'react';
import type { ReactNode } from 'react';

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
 * Renders a YAML-like config display with syntax highlighting.
 * Keys are muted, values are emphasized, with proper indentation preserved.
 */
function StyledConfigContent({
  displayId,
  configYaml,
}: {
  displayId: string | null;
  configYaml: string | null;
}): ReactNode {
  const lines: ReactNode[] = [];

  // Add id line if present
  if (displayId) {
    lines.push(
      <div key="id" className="flex">
        <span className="text-slate-500 dark:text-slate-500">id: </span>
        <span className="text-slate-700 dark:text-slate-300">{displayId}</span>
      </div>,
    );
  }

  // Parse and style YAML lines
  if (configYaml) {
    const yamlLines = configYaml.split('\n');
    yamlLines.forEach((line, index) => {
      if (!line.trim()) {
        return;
      }

      // Find the colon that separates key from value
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        // No colon - just render as-is (shouldn't happen in valid YAML)
        lines.push(
          <div key={index} className="text-slate-700 dark:text-slate-300">
            {line}
          </div>,
        );
        return;
      }

      // Extract indentation, key, and value
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const keyPart = line.slice(indent.length, colonIndex);
      const valuePart = line.slice(colonIndex + 1);

      // Style based on value type
      let valueElement: ReactNode;
      const trimmedValue = valuePart.trim();

      if (trimmedValue === '' || trimmedValue === '|' || trimmedValue === '>') {
        // Empty value or YAML block indicator - just show colon
        valueElement = null;
      } else if (trimmedValue === 'true' || trimmedValue === 'false') {
        // Boolean
        valueElement = <span className="text-amber-600 dark:text-amber-400">{valuePart}</span>;
      } else if (trimmedValue === '[REDACTED]') {
        // Redacted secret
        valueElement = (
          <span className="text-red-500/70 dark:text-red-400/70 italic">{valuePart}</span>
        );
      } else if (/^-?\d+\.?\d*$/.test(trimmedValue)) {
        // Number
        valueElement = <span className="text-emerald-600 dark:text-emerald-400">{valuePart}</span>;
      } else {
        // String or other
        valueElement = <span className="text-slate-700 dark:text-slate-300">{valuePart}</span>;
      }

      lines.push(
        <div key={index} className="flex">
          <span className="text-slate-500 dark:text-slate-500 whitespace-pre">
            {indent}
            {keyPart}:
          </span>
          {valueElement}
        </div>,
      );
    });
  }

  return <>{lines}</>;
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

  // Tooltip: show id (if label used) + sanitized config as YAML
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

      // Sanitize the config (redact secrets)
      const sanitizedConfig = sanitizeConfig(restConfig);

      // Generate YAML for config
      let configYaml: string | null = null;
      if (sanitizedConfig && Object.keys(sanitizedConfig).length > 0) {
        configYaml = yaml
          .dump(sanitizedConfig, {
            indent: 2,
            lineWidth: 80,
            noRefs: true,
            sortKeys: true,
          })
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
