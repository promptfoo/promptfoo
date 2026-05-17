/**
 * Shared error-classification helpers for Azure OpenAI providers.
 *
 * Both the Azure Assistants and Foundry Agents providers run their own
 * polling/retry surface and need to recognize provider-supplied error strings
 * for content-filter, rate-limit, and transient-service categories. These
 * helpers used to be duplicated as private methods on each class; consolidating
 * them here keeps the substring matchers in one place.
 */
import type { ProviderResponse } from '../../types/index';

const CONTENT_FILTER_FALLBACK_MESSAGE =
  "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.";

export function isContentFilterError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('content_filter') ||
    lower.includes('content filter') ||
    lower.includes('filtered due to') ||
    lower.includes('content filtering') ||
    lower.includes('inappropriate content') ||
    lower.includes('safety guidelines') ||
    lower.includes('guardrail')
  );
}

export function isRateLimitError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('quota exceeded') ||
    lower.includes('too many requests') ||
    errorMessage.includes('429')
  );
}

export function isServiceError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Service unavailable') ||
    errorMessage.includes('Bad gateway') ||
    errorMessage.includes('Gateway timeout') ||
    errorMessage.includes('Server is busy') ||
    errorMessage.includes('Sorry, something went wrong')
  );
}

/**
 * Render a {@link ProviderResponse} for an Azure content-filter trip.
 *
 * Disambiguates input-side vs output-side filtering by substring-matching the
 * upstream message, with input given precedence when both are mentioned. This
 * mirrors the Azure content-filter response shape: input filtering blocks the
 * request before the model sees it; output filtering blocks the model's
 * response after generation. A single trip is one or the other, never both,
 * so we treat them as mutually exclusive.
 */
export function formatContentFilterResponse(errorMessage: string): ProviderResponse {
  const lower = errorMessage.toLowerCase();
  const flaggedInput = lower.includes('prompt') || lower.includes('input');
  return {
    output: CONTENT_FILTER_FALLBACK_MESSAGE,
    guardrails: {
      flagged: true,
      flaggedInput,
      flaggedOutput: !flaggedInput,
    },
  };
}
