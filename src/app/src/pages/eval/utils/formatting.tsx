import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface FormattingSettings {
  renderMarkdown: boolean;
  prettifyJson: boolean;
  maxTextLength: number;
  wordBreak: 'break-word' | 'break-all';
  showInferenceDetails: boolean;
  maxImageWidth: number;
  maxImageHeight: number;
}

export interface InferenceData {
  tokenUsage?: {
    numRequests?: number;
    prompt?: number;
    completion?: number;
    total?: number;
    cached?: number;
    completionDetails?: {
      reasoning?: number;
    };
  };
  latencyMs?: number;
  cost?: number;
}

/**
 * Formats text content based on user preferences
 */
export function formatTextContent(
  content: string,
  settings: FormattingSettings
): React.ReactNode {
  if (!content) return null;

  // Apply text truncation if specified
  const truncatedContent = settings.maxTextLength && content.length > settings.maxTextLength
    ? content.substring(0, settings.maxTextLength) + '...'
    : content;

  // Apply formatting preferences
  if (settings.prettifyJson || settings.renderMarkdown) {
    // When both prettifyJson and renderMarkdown are enabled,
    // display as JSON if it's a valid object/array, otherwise render as Markdown
    let isJsonHandled = false;

    if (settings.prettifyJson) {
      try {
        const parsed = JSON.parse(truncatedContent);
        if (typeof parsed === 'object' && parsed !== null) {
          return (
            <pre style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: settings.wordBreak,
            }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
          );
        }
      } catch {
        // Not valid JSON, continue to Markdown if enabled
      }
    }

    if (!isJsonHandled && settings.renderMarkdown) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {truncatedContent}
        </ReactMarkdown>
      );
    }
  }

  // Default text rendering
  return (
    <span style={{ wordBreak: settings.wordBreak }}>
      {truncatedContent}
    </span>
  );
}

/**
 * Validates inference data and provides safe access
 */
export function validateInferenceData(data: Partial<InferenceData>): InferenceData {
  return {
    tokenUsage: data.tokenUsage && typeof data.tokenUsage === 'object'
      ? {
          ...data.tokenUsage,
          numRequests: typeof data.tokenUsage.numRequests === 'number'
            ? data.tokenUsage.numRequests
            : undefined,
          prompt: typeof data.tokenUsage.prompt === 'number'
            ? data.tokenUsage.prompt
            : undefined,
          completion: typeof data.tokenUsage.completion === 'number'
            ? data.tokenUsage.completion
            : undefined,
          total: typeof data.tokenUsage.total === 'number'
            ? data.tokenUsage.total
            : undefined,
          cached: typeof data.tokenUsage.cached === 'number'
            ? data.tokenUsage.cached
            : undefined,
        }
      : undefined,
    latencyMs: typeof data.latencyMs === 'number' && data.latencyMs >= 0
      ? data.latencyMs
      : undefined,
    cost: typeof data.cost === 'number' && data.cost >= 0
      ? data.cost
      : undefined,
  };
}

/**
 * Calculates tokens per second safely
 */
export function calculateTokensPerSecond(
  completionTokens?: number,
  latencyMs?: number
): number | null {
  if (!completionTokens || !latencyMs || latencyMs <= 0) {
    return null;
  }

  const tokensPerSec = completionTokens / (latencyMs / 1000);
  return isFinite(tokensPerSec) && tokensPerSec > 0 ? tokensPerSec : null;
}

/**
 * Formats cost for display
 */
export function formatCost(cost?: number): string {
  if (cost === undefined || cost <= 0) {
    return 'N/A';
  }

  return cost >= 0.01 ? `$${cost.toFixed(3)}` : `$${cost.toPrecision(2)}`;
}

/**
 * Formats latency for display
 */
export function formatLatency(latencyMs?: number): string {
  if (!latencyMs) return 'N/A';

  return latencyMs >= 1000
    ? `${(latencyMs / 1000).toFixed(1)}s`
    : `${Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(latencyMs)}ms`;
}

/**
 * Gets appropriate color for cost display
 */
export function getCostColor(cost?: number): 'warning.main' | 'primary.main' | 'text.secondary' {
  if (!cost || cost <= 0) return 'text.secondary';
  return cost > 0.01 ? 'warning.main' : 'primary.main';
}

/**
 * Gets appropriate border color for cost display
 */
export function getCostBorderColor(
  cost?: number
): 'warning.main' | 'primary.main' | 'divider' {
  if (!cost || cost <= 0) return 'divider';
  return cost > 0.01 ? 'warning.main' : 'primary.main';
}