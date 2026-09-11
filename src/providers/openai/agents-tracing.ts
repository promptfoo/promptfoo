import logger from '../../logger';
import { sanitizeBody } from '../../tracing/genaiTracer';
import { encodeExportTraceServiceRequest } from '../../tracing/protobuf';
import { fetchWithProxy } from '../../util/fetch/index';
import { getTracingServiceName } from '../tracing';
import type { Span, SpanData, Trace, TracingExporter } from '@openai/agents';

import type { TracingExportFormat } from '../tracing';

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318';
const OTLP_SPAN_KIND_INTERNAL = 1;
const OTLP_SPAN_KIND_CLIENT = 3;
const MAX_STRUCTURED_ATTRIBUTE_BYTES = 64 * 1024;
const MAX_STRUCTURED_ATTRIBUTE_DEPTH = 32;
const MAX_STRUCTURED_ATTRIBUTE_NODES = 10_000;
const TRACE_LINKAGE_ATTRIBUTE_KEYS = new Set(['evaluation.id', 'test.case.id']);
const losslessJson = JSON as typeof JSON & {
  rawJSON?: (source: string) => unknown;
  isRawJSON?: (value: unknown) => boolean;
};
const INTERNAL_TRACE_METADATA_KEYS = new Set([
  'promptfoo.otlp_endpoint',
  'promptfoo.otlp_format',
  'promptfoo.model_provider',
  'promptfoo.parent_span_id',
  'promptfoo.request_model',
  'promptfoo.service_name',
]);

/**
 * OTLP Tracing Exporter for OpenAI Agents.
 *
 * The Agents SDK emits a framework-native span model. Promptfoo needs those spans
 * normalized into OTLP attributes that its trajectory assertions understand.
 */
export class OTLPTracingExporter implements TracingExporter {
  /**
   * Export traces and spans to their configured OTLP endpoint.
   */
  async export(items: (Trace | Span<any>)[], signal?: AbortSignal): Promise<void> {
    const spans = items.filter((item): item is Span<any> => item.type === 'trace.span');
    if (spans.length === 0) {
      logger.debug('[AgentsTracing] No spans to export');
      return;
    }

    const spansByEndpoint = groupSpansByEndpoint(spans);
    logger.debug('[AgentsTracing] Exporting spans to OTLP', {
      endpointCount: spansByEndpoint.size,
      spanCount: spans.length,
    });

    await Promise.all(
      [...spansByEndpoint.values()].map(async ({ endpoint: otlpEndpoint, format, spans }) => {
        try {
          const otlpPayload = this.transformToOTLP(spans);
          const url = `${otlpEndpoint}/v1/traces`;
          const body =
            format === 'protobuf'
              ? new Uint8Array(await encodeExportTraceServiceRequest(otlpPayload))
              : JSON.stringify(otlpPayload);

          logger.debug('[AgentsTracing] Sending OTLP payload', {
            url,
            format,
            spanCount: spans.length,
          });

          const response = await fetchWithProxy(url, {
            method: 'POST',
            headers: {
              'Content-Type': format === 'protobuf' ? 'application/x-protobuf' : 'application/json',
            },
            body,
            signal,
          });

          if (response.ok) {
            logger.debug('[AgentsTracing] Successfully exported traces to OTLP', {
              otlpEndpoint,
              spanCount: spans.length,
            });
          } else {
            logger.error(
              `[AgentsTracing] OTLP export failed: ${response.status} ${response.statusText}`,
              { otlpEndpoint },
            );
          }
        } catch (error) {
          logger.error('[AgentsTracing] Failed to export traces to OTLP', {
            error,
            otlpEndpoint,
          });
        }
      }),
    );
  }

  /**
   * Transform openai-agents-js spans to OTLP JSON format.
   */
  private transformToOTLP(spans: Span<any>[]): any {
    const spansByService = new Map<string, Span<any>[]>();
    const defaultServiceName = getTracingServiceName();

    for (const span of spans) {
      const serviceName = sanitizeCredentialText(
        getStringTraceMetadata(span, 'promptfoo.service_name') ?? defaultServiceName,
      );
      const serviceSpans = spansByService.get(serviceName) ?? [];
      serviceSpans.push(span);
      spansByService.set(serviceName, serviceSpans);
    }

    return {
      resourceSpans: [...spansByService.entries()].map(([serviceName, serviceSpans]) => ({
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
        },
        scopeSpans: [
          {
            scope: {
              name: 'openai-agents-js',
            },
            spans: serviceSpans.map((span) => this.spanToOTLP(span)),
          },
        ],
      })),
    };
  }

  /**
   * Convert a single span to OTLP format.
   */
  private spanToOTLP(span: Span<any>): any {
    const startTime = span.startedAt ? new Date(span.startedAt).getTime() : Date.now();
    const endTime = span.endedAt ? new Date(span.endedAt).getTime() : undefined;
    const traceId = span.traceId || this.generateTraceId();
    const spanId = span.spanId || this.generateSpanId();
    const parentSpanId =
      span.parentId || getStringTraceMetadata(span, 'promptfoo.parent_span_id') || undefined;

    return {
      traceId: this.hexToBase64(traceId, 'trace'),
      spanId: this.hexToBase64(spanId, 'span'),
      parentSpanId: parentSpanId ? this.hexToBase64(parentSpanId, 'span') : undefined,
      name: sanitizeCredentialText(this.getSpanName(span)),
      kind:
        span.spanData.type === 'generation' || span.spanData.type === 'response'
          ? OTLP_SPAN_KIND_CLIENT
          : OTLP_SPAN_KIND_INTERNAL,
      startTimeUnixNano: String(startTime * 1_000_000),
      endTimeUnixNano: endTime ? String(endTime * 1_000_000) : undefined,
      attributes: this.attributesToOTLP(this.getSpanAttributes(span), span),
      status: this.getSpanStatus(span),
    };
  }

  private getSpanName(span: Span<any>): string {
    const data = span.spanData;

    switch (data.type) {
      case 'function':
        return `execute_tool ${data.name || 'function'}`;
      case 'handoff':
        return `handoff ${data.from_agent || 'unknown'} -> ${data.to_agent || 'unknown'}`;
      case 'agent':
        return `invoke_agent ${data.name || 'agent'}`;
      case 'generation':
        return `chat ${data.model || 'unknown-model'}`;
      case 'response':
        return `chat ${getResponseModel(data) || 'unknown-model'}`;
      case 'guardrail':
        return `guardrail ${data.name || 'guardrail'}`;
      case 'custom':
        return this.getCustomSpanName(data);
      default:
        return data.type ? `agent.${data.type}` : 'agent.span';
    }
  }

  private getCustomSpanName(data: Extract<SpanData, { type: 'custom' }>): string {
    const nestedData = isRecord(data.data) ? data.data : {};
    const sandboxOperation = nestedData['sandbox.operation'];

    if (typeof sandboxOperation === 'string' && sandboxOperation) {
      return `sandbox.${sandboxOperation}`;
    }

    return data.name || 'custom';
  }

  private getSpanStatus(span: Span<any>): any {
    if (span.error) {
      return {
        code: 2,
        message: sanitizeSerializedAttribute(span.error.message || String(span.error)),
      };
    }

    return {
      code: 0,
    };
  }

  private getSpanAttributes(span: Span<any>): Record<string, unknown> {
    const data = span.spanData;
    const attributes: Record<string, unknown> = {
      'openai.agents.span_type': data.type,
    };

    switch (data.type) {
      case 'function':
        attributes['gen_ai.operation.name'] = 'execute_tool';
        attributes['gen_ai.tool.name'] = data.name;
        attributes['tool.name'] = data.name;
        if (data.input !== undefined) {
          attributes['tool.arguments'] = data.input;
        }
        if (data.output !== undefined) {
          attributes['tool.output'] = data.output;
        }
        break;
      case 'handoff':
        attributes['handoff.from_agent'] = data.from_agent;
        attributes['handoff.to_agent'] = data.to_agent;
        break;
      case 'agent':
        attributes['gen_ai.operation.name'] = 'invoke_agent';
        attributes['gen_ai.agent.name'] = data.name;
        attributes['agent.name'] = data.name;
        if (data.tools !== undefined) {
          attributes['agent.tools'] = data.tools;
        }
        if (data.handoffs !== undefined) {
          attributes['agent.handoffs'] = data.handoffs;
        }
        if (data.output_type !== undefined) {
          attributes['agent.output_type'] = data.output_type;
        }
        break;
      case 'generation':
        attributes['gen_ai.operation.name'] = 'chat';
        setGenerationProviderAttribute(data, span, attributes);
        attributes['gen_ai.request.model'] = data.model;
        if (data.usage?.input_tokens !== undefined) {
          attributes['gen_ai.usage.input_tokens'] = data.usage.input_tokens;
        }
        if (data.usage?.output_tokens !== undefined) {
          attributes['gen_ai.usage.output_tokens'] = data.usage.output_tokens;
        }
        if (data.usage && 'total_tokens' in data.usage) {
          attributes['promptfoo.usage.total_tokens'] = data.usage.total_tokens;
        }
        break;
      case 'response':
        this.applyResponseSpanAttributes(data, span, attributes);
        break;
      case 'guardrail':
        attributes['guardrail.name'] = data.name;
        attributes['guardrail.triggered'] = data.triggered;
        break;
      case 'custom':
        this.applyCustomSpanAttributes(data, attributes);
        break;
      default:
        this.applyGenericSpanAttributes(data, attributes);
        break;
    }

    for (const [key, value] of Object.entries(span.traceMetadata ?? {})) {
      if (INTERNAL_TRACE_METADATA_KEYS.has(key)) {
        continue;
      }

      if (key === 'evaluation.id' || key === 'test.case.id') {
        attributes[key] = value;
      } else {
        attributes[`trace.metadata.${key}`] = value;
      }
    }

    return attributes;
  }

  private applyResponseSpanAttributes(
    data: Extract<SpanData, { type: 'response' }>,
    span: Span<any>,
    attributes: Record<string, unknown>,
  ): void {
    const response = isRecord(data._response) ? data._response : undefined;
    const responseId = data.response_id ?? getStringValue(response?.id);
    const model = getResponseModel(data);
    const usage = isRecord(response?.usage) ? response.usage : undefined;

    attributes['gen_ai.operation.name'] = 'chat';
    attributes['gen_ai.provider.name'] = 'openai';
    attributes['openai.api.type'] = 'responses';

    if (model) {
      attributes['gen_ai.response.model'] = model;
    }
    const requestedModel = getStringTraceMetadata(span, 'promptfoo.request_model');
    if (requestedModel) {
      attributes['gen_ai.request.model'] = requestedModel;
    }
    if (responseId) {
      attributes['gen_ai.response.id'] = responseId;
      attributes['openai.response_id'] = responseId;
    }

    setNumericAttribute(attributes, 'gen_ai.usage.input_tokens', usage?.input_tokens);
    setNumericAttribute(attributes, 'gen_ai.usage.output_tokens', usage?.output_tokens);
    setNumericAttribute(attributes, 'promptfoo.usage.total_tokens', usage?.total_tokens);

    const inputTokenDetails = isRecord(usage?.input_tokens_details)
      ? usage.input_tokens_details
      : undefined;
    const outputTokenDetails = isRecord(usage?.output_tokens_details)
      ? usage.output_tokens_details
      : undefined;

    setNumericAttribute(
      attributes,
      'gen_ai.usage.cache_read.input_tokens',
      inputTokenDetails?.cached_tokens,
    );
    setNumericAttribute(
      attributes,
      'gen_ai.usage.reasoning.output_tokens',
      outputTokenDetails?.reasoning_tokens,
    );
  }

  private applyCustomSpanAttributes(
    data: Extract<SpanData, { type: 'custom' }>,
    attributes: Record<string, unknown>,
  ): void {
    attributes['openai.agents.custom_span.name'] = data.name;

    if (!isRecord(data.data)) {
      return;
    }

    for (const [key, value] of Object.entries(data.data)) {
      attributes[key] = sanitizeAttributeValue(value);
    }

    const command = commandToString(
      sanitizeAttributeByKey('command', data.data.command ?? data.data.cmd),
    );
    if (command) {
      attributes.command = command;
    }

    const exitCode = data.data.exit_code ?? data.data.exitCode;
    if (typeof exitCode === 'number') {
      attributes['process.exit.code'] = exitCode;
    }
  }

  private applyGenericSpanAttributes(
    data: Exclude<SpanData, { type: 'custom' }>,
    attributes: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'type') {
        continue;
      }

      attributes[`agent.${key}`] = sanitizeAttributeValue(value);
    }
  }

  private attributesToOTLP(attributes: Record<string, unknown>, span: Span<any>): any[] {
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key: sanitizeCredentialText(key),
        value: this.valueToOTLP(
          sanitizeAttributeByKey(key, value),
          TRACE_LINKAGE_ATTRIBUTE_KEYS.has(key) &&
            Object.prototype.hasOwnProperty.call(span.traceMetadata ?? {}, key),
        ),
      }));
  }

  private valueToOTLP(value: unknown, preserveTraceLinkage = false): any {
    if (value === null || value === undefined) {
      return { stringValue: '' };
    }

    if (typeof value === 'string') {
      return { stringValue: preserveTraceLinkage ? value : sanitizeSerializedAttribute(value) };
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
    }

    if (typeof value === 'boolean') {
      return { boolValue: value };
    }

    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((entry) => this.valueToOTLP(entry)),
        },
      };
    }

    if (typeof value === 'object') {
      return { stringValue: sanitizeSerializedAttribute(safeJsonStringify(value)) };
    }

    return { stringValue: String(value) };
  }

  /**
   * Convert hex string to base64 for OTLP JSON payloads.
   */
  private hexToBase64(hex: string, kind: 'trace' | 'span'): string {
    if (!hex) {
      return '';
    }

    try {
      let cleanHex = hex.replace(/^(trace_|span_|group_)/, '');
      const targetLength = kind === 'span' ? 16 : 32;
      if (cleanHex.length > targetLength) {
        cleanHex = cleanHex.substring(0, targetLength);
      } else if (cleanHex.length < targetLength) {
        cleanHex = cleanHex.padEnd(targetLength, '0');
      }

      return Buffer.from(cleanHex, 'hex').toString('base64');
    } catch (error) {
      logger.error(`[AgentsTracing] Failed to convert hex to base64: ${hex}`, { error });
      const fallbackLen = kind === 'span' ? 16 : 32;
      return Buffer.from(this.generateRandomHex(fallbackLen), 'hex').toString('base64');
    }
  }

  private generateTraceId(): string {
    return this.generateRandomHex(32);
  }

  private generateSpanId(): string {
    return this.generateRandomHex(16);
  }

  private generateRandomHex(length: number): string {
    const bytes = Math.ceil(length / 2);
    const buffer = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer.toString('hex').substring(0, length);
  }
}

function getResponseModel(data: Extract<SpanData, { type: 'response' }>): string | undefined {
  return isRecord(data._response) ? getStringValue(data._response.model) : undefined;
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function setNumericAttribute(
  attributes: Record<string, unknown>,
  name: string,
  value: unknown,
): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    attributes[name] = value;
  }
}

interface SpanExportDestination {
  endpoint: string;
  format: TracingExportFormat;
  spans: Span<any>[];
}

function groupSpansByEndpoint(spans: Span<any>[]): Map<string, SpanExportDestination> {
  const grouped = new Map<string, SpanExportDestination>();

  for (const span of spans) {
    const endpoint =
      getStringTraceMetadata(span, 'promptfoo.otlp_endpoint') ?? DEFAULT_OTLP_ENDPOINT;
    const format =
      getStringTraceMetadata(span, 'promptfoo.otlp_format') === 'protobuf' ? 'protobuf' : 'json';
    const destinationKey = `${format}:${endpoint}`;
    const destination = grouped.get(destinationKey) ?? { endpoint, format, spans: [] };
    destination.spans.push(span);
    grouped.set(destinationKey, destination);
  }

  return grouped;
}

function setGenerationProviderAttribute(
  data: Extract<SpanData, { type: 'generation' }>,
  span: Span<any>,
  attributes: Record<string, unknown>,
): void {
  const modelConfig = isRecord(data.model_config) ? data.model_config : undefined;
  const provider =
    getStringValue(modelConfig?.provider) ??
    getStringValue(modelConfig?.provider_name) ??
    getStringValue(modelConfig?.providerName) ??
    getStringTraceMetadata(span, 'promptfoo.model_provider') ??
    inferProviderFromModel(data.model);

  if (provider) {
    attributes['gen_ai.provider.name'] = provider;
  }
}

function inferProviderFromModel(model: string | undefined): string | undefined {
  if (!model) {
    return undefined;
  }

  const explicitProvider = model.match(
    /^(openai|anthropic|azure|google|vertex|bedrock|litellm)[/:]/i,
  );
  if (explicitProvider) {
    return explicitProvider[1].toLowerCase();
  }
  if (/^(gpt-|chatgpt-|o[134]-|text-embedding-|dall-e-|whisper-|tts-)/i.test(model)) {
    return 'openai';
  }
  if (/^claude-/i.test(model)) {
    return 'anthropic';
  }
  if (/^gemini-/i.test(model)) {
    return 'google';
  }

  return undefined;
}

function getStringTraceMetadata(span: Span<any>, key: string): string | undefined {
  const value = span.traceMetadata?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function commandToString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    const command = value
      .map((part) => String(part).trim())
      .filter(Boolean)
      .join(' ');
    return command || undefined;
  }

  return String(value).trim() || undefined;
}

function sanitizeSerializedAttribute(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    if (
      trimmed.length > MAX_STRUCTURED_ATTRIBUTE_BYTES ||
      Buffer.byteLength(trimmed, 'utf8') > MAX_STRUCTURED_ATTRIBUTE_BYTES
    ) {
      return '<redacted>';
    }
    try {
      const parsed = parseStructuredJson(trimmed);
      if (isRecord(parsed) || Array.isArray(parsed)) {
        const state = { changed: false };
        const sanitized = sanitizeStructuredAttribute(parsed, state);
        return state.changed ? JSON.stringify(sanitized) : sanitizeCredentialText(value);
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return '<redacted>';
      }
      // Non-JSON strings still need the existing free-text credential redaction.
    }
  }

  return sanitizeCredentialText(value);
}

function parseStructuredJson(value: string): unknown {
  if (typeof losslessJson.rawJSON !== 'function') {
    return JSON.parse(value);
  }

  return JSON.parse(value, (_key, parsed: unknown, context?: { source?: string }) => {
    if (
      typeof parsed === 'number' &&
      (!Number.isSafeInteger(parsed) ||
        Object.is(parsed, -0) ||
        (parsed === 0 && /[eE]-/.test(context?.source ?? ''))) &&
      typeof context?.source === 'string'
    ) {
      return losslessJson.rawJSON!(context.source);
    }
    return parsed;
  });
}

function sanitizeCredentialText(value: string): string {
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/.test(value)) {
    return '<redacted>';
  }

  if (hasCredentialNamedPayload(value)) {
    return '<redacted>';
  }

  if (
    !value.trim().startsWith('{') &&
    /"ciphertext"\s*:\s*"[^"]+"/.test(value) &&
    /"tag"\s*:\s*"[^"]+"/.test(value)
  ) {
    return '<redacted>';
  }

  for (const [, key] of value.matchAll(/<(?:[\w.-]+:)?([A-Za-z_][A-Za-z\d_.-]*)\b[^>]*>/gi)) {
    if (isCredentialAttributeKey(key)) {
      return '<redacted>';
    }
  }

  // YAML values can span lines, including flow collections under credential keys.
  for (const [, , key, scalar] of value.matchAll(
    /(?:^|[\r\n])[ \t]*(?:-[ \t]+)?(["']?)([A-Za-z_][A-Za-z\d_.-]*)\1[ \t]*:[ \t]*([^\r\n]*)/g,
  )) {
    if (isCredentialAttributeKey(key) && !/^[ \t]*["']/.test(scalar)) {
      return '<redacted>';
    }
  }

  for (const [, , key, first] of value.matchAll(
    /[,{\[]\s*(["']?)([A-Za-z_][A-Za-z\d_.-]*)\1\s*:\s*(?=(\S|$))/g,
  )) {
    if (isCredentialAttributeKey(key) && first !== '"' && first !== "'") {
      return '<redacted>';
    }
  }

  const netrc = value.replace(/^[ \t]*#[^\r\n]*/gm, '');
  if (
    /(?:^|[\r\n])\s*(?:machine\s+\S+\s+|default\s+)(?:login|password|account)\b/i.test(netrc) &&
    /(?:^|\s)(?:password|account)\s+\S/i.test(netrc)
  ) {
    return '<redacted>';
  }

  // Embedded encoded JSON cannot be traversed safely as an ordinary text value.
  for (const [, encodedKey] of value.matchAll(/\\+"((?:\\.|[^"\\])*)\\+"\s*:/g)) {
    let key = encodedKey;
    try {
      key = JSON.parse(`"${encodedKey}"`);
    } catch {
      // Malformed embedded JSON falls through to the remaining text masks.
    }
    if (isCredentialAttributeKey(key)) {
      return '<redacted>';
    }
  }

  const options =
    /(^|\s)(--?[A-Za-z][A-Za-z\d_.-]*)([ \t]+|=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s;]+)/g;
  let match: RegExpExecArray | null;
  let sanitized = '';
  let copied = 0;
  while ((match = options.exec(value))) {
    const [, prefix, option, separator] = match;
    if (isCredentialAttributeKey(option) || ['-u', '--user', '--proxy-user'].includes(option)) {
      sanitized += value.slice(copied, match.index) + prefix + option + separator + '<redacted>';
      copied = options.lastIndex;
    } else {
      // A boolean option can precede another option instead of a value.
      options.lastIndex = match.index + prefix.length + option.length;
    }
  }
  value = sanitized + value.slice(copied);

  // Preserve escapes before the generic masker can shorten quoted credentials.
  return redactQuotedCredentials(sanitizeBody(redactQuotedCredentials(value)))
    .replace(/\bAIza[a-zA-Z0-9_-]{35}\b/g, '<redacted>')
    .replace(
      /(?<![A-Za-z0-9_-])([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*)?/g,
      (token, header: string) => {
        if (header.length > MAX_STRUCTURED_ATTRIBUTE_BYTES) {
          return '<redacted>';
        }
        try {
          const parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
          return isRecord(parsed) && typeof parsed.alg === 'string' ? '<redacted>' : token;
        } catch {
          return token;
        }
      },
    )
    .replace(
      /\b([a-z][a-z\d+.-]*:\/\/)[^\s/?#]+@/gi,
      (_match, prefix: string) => `${prefix}<redacted>@`,
    )
    .replace(
      /(\b(?:Authorization\s*:|Authorization\s*=(?=[ \t]*(?:Bearer|Basic|Token|Api[-_]?Key|Digest|Negotiate|AWS4-HMAC-SHA256)\b)|Cookie\s*:)[ \t]*)[^\r\n]*/gi,
      (_match, prefix: string) => `${prefix}<redacted>`,
    )
    .replace(
      /(\bAuthorization\s*=\s*)([A-Za-z][A-Za-z\d-]*\s+)[^\s;,"'{}\]]+/gi,
      (_match, prefix: string) => `${prefix}<redacted>`,
    )
    .replace(
      /(^|[\s;,:])([A-Za-z_][A-Za-z\d_.-]*)(\s*:\s*)((?:(?:Bearer|Basic|Token|Api[-_]?Key)\s+)?[^\s;,"'{}\]]+)/gi,
      (match, prefix: string, key: string, separator: string) =>
        isCredentialAttributeKey(key) ? `${prefix}${key}${separator}<redacted>` : match,
    )
    .replace(
      /(^|[?&#;:\s.])((?:[A-Za-z_]|%[\da-fA-F]{2})[A-Za-z\d_.%-]*)(\s*=\s*)(["']?)(?:(?:Bearer|Basic|Token|Api[-_]?Key)\s+)?([^&#;\s"',}\]\\]+)\4/gi,
      (match, prefix: string, key: string, separator: string, quote: string) => {
        let decodedKey = key;
        try {
          decodedKey = decodeURIComponent(key);
        } catch {
          // Preserve malformed query parameters while still checking their literal key.
        }
        return isCredentialAttributeKey(decodedKey)
          ? `${prefix}${key}${separator}${quote}<redacted>${quote}`
          : match;
      },
    );
}

function hasCredentialNamedPayload(value: string): boolean {
  if (
    /content-disposition:[^\r\n]*\bname=["']?[A-Za-z_][A-Za-z\d_.-]*["']?/i.test(value) &&
    [...value.matchAll(/\bname=["']?([A-Za-z_][A-Za-z\d_.-]*)["']?/gi)].some(([, key]) =>
      isCredentialAttributeKey(key),
    )
  ) {
    return true;
  }
  for (const [, attributes] of value.matchAll(/<[\w.-]+\b([^>]*)>/g)) {
    const key = attributes.match(/\b(?:name|key)=["']([A-Za-z_][A-Za-z\d_.-]*)["']/i)?.[1];
    if (key && isCredentialAttributeKey(key) && /\bvalue=["']/i.test(attributes)) {
      return true;
    }
  }
  return false;
}

function redactQuotedCredentials(value: string): string {
  return value
    .replace(
      /(^|[\s;])([A-Za-z_][A-Za-z\d_.-]*)(\s*=\s*)\{(?:}}|[^}])*(?:}|$)/gi,
      (match, prefix: string, key: string, separator: string) =>
        isCredentialAttributeKey(key) ? `${prefix}${key}${separator}<redacted>` : match,
    )
    .replace(
      /(["'])([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)(["'])(?:\\(?:[\s\S]|$)|\4\4|(?!\4)[^\\])*(?:\4|$)/g,
      (match, keyQuote: string, key: string, separator: string, valueQuote: string) =>
        isCredentialAttributeKey(key)
          ? `${keyQuote}${key}${keyQuote}${separator}${valueQuote}<redacted>${valueQuote}`
          : match,
    )
    .replace(
      /(^|[\s;,:{\[])([A-Za-z_][A-Za-z\d_.-]*)(\s*[:=]\s*)(["'])(?:\\(?:[\s\S]|$)|\4\4|(?!\4)[^\\])*(?:\4|$)/gi,
      (match, prefix: string, key: string, separator: string, quote: string) =>
        isCredentialAttributeKey(key)
          ? `${prefix}${key}${separator}${quote}<redacted>${quote}`
          : match,
    );
}

function isCredentialAttributeKey(key: string): boolean {
  const parts = key
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);

  return parts.some((part, index) => {
    if (part === 'token' || part === 'tokens') {
      return (
        ![
          'used',
          'count',
          'counts',
          'usage',
          'limit',
          'budget',
          'length',
          'type',
          'id',
          'ids',
          'index',
          'indices',
          'position',
          'positions',
          'mask',
          'masks',
          'endpoint',
          'url',
          'uri',
        ].includes(parts[index + 1]) &&
        ![
          'num',
          'estimated',
          'used',
          'usage',
          'input',
          'output',
          'total',
          'cached',
          'reasoning',
          'prompt',
          'completion',
          'prediction',
          'response',
          'max',
          'min',
        ].includes(parts[index - 1])
      );
    }
    if (
      [
        'authorization',
        'cookie',
        'cookies',
        'password',
        'passwords',
        'passwd',
        'pwd',
        'passphrase',
        'passphrases',
        'secret',
        'secrets',
        'credential',
        'credentials',
        'apikey',
        'apikeys',
        'auth',
        'jwt',
        'sig',
        'signature',
        'pgpassword',
        'assertion',
      ].includes(part)
    ) {
      if (
        part === 'auth' &&
        ['type', 'method', 'methods', 'supported', 'status', 'enabled'].includes(parts[index + 1])
      ) {
        return false;
      }
      if (
        part === 'signature' &&
        (parts[index - 1] === 'function' ||
          ['algorithm', 'method', 'type', 'version', 'format', 'scheme', 'encoding'].includes(
            parts[index + 1],
          ))
      ) {
        return false;
      }
      if (part === 'authorization' && ['endpoint', 'url', 'uri'].includes(parts[index + 1])) {
        return false;
      }
      if (part === 'assertion' && parts[index - 1] === 'client') {
        return !['type', 'types'].includes(parts[index + 1]);
      }
      return true;
    }
    return (
      (part === 'key' || part === 'keys') &&
      !['algorithm', 'type', 'format', 'id'].includes(parts[index + 1]) &&
      ['api', 'access', 'private', 'client', 'ssl', 'tls', 'signing', 'encryption'].includes(
        parts[index - 1],
      )
    );
  });
}

function sanitizeAttributeByKey(key: string, value: unknown): unknown {
  if (isCredentialAttributeKey(key)) {
    return '<redacted>';
  }
  if (ArrayBuffer.isView(value)) {
    return '<redacted>';
  }
  // Walk plain objects before JSON serialization so nested native byte views cannot
  // turn into ordinary { type, data } records. Preserve intentional toJSON objects.
  if (Array.isArray(value) || (isRecord(value) && typeof value.toJSON !== 'function')) {
    return sanitizeStructuredAttribute(value);
  }
  return value;
}

function isCredentialPairValue(source: Record<string, unknown> | unknown[], key: string) {
  if (Array.isArray(source)) {
    const option = source[Number(key) - 1];
    return (
      typeof option === 'string' &&
      (['-u', '--user', '--proxy-user'].includes(option) ||
        (isCredentialAttributeKey(option) &&
          (/^--?[A-Za-z][A-Za-z\d_.-]*$/.test(option) ||
            (Number(key) % 2 === 1 && /^[A-Za-z][A-Za-z\d_.-]*$/.test(option)))))
    );
  }
  return (
    key.toLowerCase() === 'value' &&
    Object.entries(source).some(
      ([field, name]) =>
        /^(name|key)$/i.test(field) && typeof name === 'string' && isCredentialAttributeKey(name),
    )
  );
}

function isPrivateJwkParameter(source: Record<string, unknown> | unknown[], key: string): boolean {
  if (Array.isArray(source)) {
    return false;
  }
  if (source.kty === 'RSA') {
    return ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].includes(key);
  }
  return source.kty === 'EC' || source.kty === 'OKP'
    ? key === 'd'
    : source.kty === 'oct' && key === 'k';
}

function isJwe(value: unknown, budget: { remaining: number }): boolean {
  if (!isRecord(value) || typeof value.ciphertext !== 'string' || typeof value.tag !== 'string') {
    return false;
  }
  let protectedHeader: unknown;
  if (typeof value.protected === 'string') {
    if (value.protected.length > MAX_STRUCTURED_ATTRIBUTE_BYTES) {
      return true;
    }
    try {
      protectedHeader = JSON.parse(Buffer.from(value.protected, 'base64url').toString('utf8'));
    } catch {
      // Unprotected headers can still identify a sensitive envelope.
    }
  }
  const hasAlgorithms = (recipientHeader: unknown) =>
    ['alg', 'enc'].every((key) =>
      [protectedHeader, value.unprotected, recipientHeader].some(
        (header) => isRecord(header) && typeof header[key] === 'string',
      ),
    );
  if (hasAlgorithms(value.header)) {
    return true;
  }
  if (!Array.isArray(value.recipients)) {
    return false;
  }
  budget.remaining -= value.recipients.length;
  return (
    budget.remaining < 0 ||
    value.recipients.some((recipient) => isRecord(recipient) && hasAlgorithms(recipient.header))
  );
}

function sanitizeStructuredAttribute(
  value: Record<string, unknown> | unknown[],
  state: { changed: boolean } = { changed: false },
  normalizeScalars = false,
): Record<string, unknown> | unknown[] | string {
  const budget = { remaining: MAX_STRUCTURED_ATTRIBUTE_NODES };
  if (isJwe(value, budget)) {
    state.changed = true;
    return '<redacted>';
  }
  type StructuredValue = Record<string, unknown> | unknown[];
  const root: StructuredValue = Array.isArray(value) ? [] : {};
  const stack: Array<{ source: StructuredValue; target: StructuredValue; depth: number }> = [
    { source: value, target: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const { source, target, depth } = stack.pop()!;
    for (const [key, entry] of structuredAttributeEntries(source)) {
      if (--budget.remaining < 0) {
        state.changed = true;
        return '<redacted>';
      }

      let sanitized: unknown;
      if (
        ArrayBuffer.isView(entry) ||
        isCredentialPairValue(source, key) ||
        isCredentialAttributeKey(key) ||
        isPrivateJwkParameter(source, key) ||
        isJwe(entry, budget)
      ) {
        sanitized = '<redacted>';
        state.changed = true;
      } else if (
        !normalizeScalars &&
        (losslessJson.isRawJSON?.(entry) || (isRecord(entry) && typeof entry.toJSON === 'function'))
      ) {
        sanitized = entry;
      } else if (isRecord(entry) || Array.isArray(entry)) {
        if (depth >= MAX_STRUCTURED_ATTRIBUTE_DEPTH) {
          sanitized = '<redacted>';
          state.changed = true;
        } else {
          const child: StructuredValue = Array.isArray(entry) ? [] : {};
          stack.push({ source: entry, target: child, depth: depth + 1 });
          sanitized = child;
        }
      } else {
        sanitized = normalizeScalars ? sanitizeAttributeValue(entry) : entry;
        if (typeof sanitized === 'string') {
          sanitized = sanitizeSerializedAttribute(sanitized);
        }
        state.changed ||= sanitized !== entry;
      }

      const sanitizedKey = sanitizeCredentialText(key);
      state.changed ||= sanitizedKey !== key;
      Object.defineProperty(target, sanitizedKey, {
        configurable: true,
        enumerable: true,
        value: sanitized,
        writable: true,
      });
    }
  }

  if (Buffer.byteLength(safeJsonStringify(root), 'utf8') > MAX_STRUCTURED_ATTRIBUTE_BYTES) {
    state.changed = true;
    return '<redacted>';
  }

  return root;
}

function* structuredAttributeEntries(
  value: Record<string, unknown> | unknown[],
): Generator<[string, unknown]> {
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      yield [key, Reflect.get(value, key)];
    }
  }
}

function sanitizeAttributeValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value) || isRecord(value)) {
    return sanitizeStructuredAttribute(value, { changed: false }, true);
  }

  return String(value);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
