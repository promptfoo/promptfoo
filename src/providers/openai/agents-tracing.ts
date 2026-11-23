import { tokenizer, tokTypes } from 'acorn';
import logger from '../../logger';
import { encodeExportTraceServiceRequest } from '../../tracing/protobuf';
import { fetchWithProxy } from '../../util/fetch/index';
import {
  credentialContainer,
  isCredentialAttributeKey,
  isCredentialHeader,
  looksLikeSecret,
  sanitizePathnameForLogging,
} from '../providerLogging';
import { getTracingServiceName } from '../tracing';
import type { Span, SpanData, Trace, TracingExporter } from '@openai/agents';

import type { TracingExportFormat } from '../tracing';

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318';
const OTLP_SPAN_KIND_INTERNAL = 1;
const OTLP_SPAN_KIND_CLIENT = 3;
const MAX_STRUCTURED_ATTRIBUTE_BYTES = 64 * 1024;
const MAX_STRUCTURED_ATTRIBUTE_DEPTH = 32;
const MAX_STRUCTURED_ATTRIBUTE_NODES = 10_000;
const PRIVATE_JWK_FIELDS = new Map([
  ['RSA', ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']],
  ['EC', ['d']],
  ['OKP', ['d']],
  ['oct', ['k']],
]);
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

          const response = await fetchWithProxy(url, {
            method: 'POST',
            headers: {
              'Content-Type': format === 'protobuf' ? 'application/x-protobuf' : 'application/json',
            },
            body,
            signal,
          });

          if (!response.ok) {
            logger.error('[AgentsTracing] OTLP export failed', { status: response.status });
          }
        } catch {
          logger.error('[AgentsTracing] Failed to export traces to OTLP');
        }
      }),
    );
  }

  private transformToOTLP(spans: Span<any>[]): any {
    const spansByService = new Map<string, Span<any>[]>();
    const defaultServiceName = getTracingServiceName();

    for (const span of spans) {
      const serviceName = sanitizeSerializedAttribute(
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
      name: sanitizeSerializedAttribute(this.getSpanName(span)),
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
    try {
      const sandboxOperation = nestedData['sandbox.operation'];
      if (typeof sandboxOperation === 'string' && sandboxOperation) {
        return `sandbox.${sandboxOperation}`;
      }
    } catch {
      // An unreadable optional label must not discard this span or its siblings.
    }

    return data.name || 'custom';
  }

  private getSpanStatus(span: Span<any>) {
    try {
      const error = span.error;
      return error ? { code: 2, message: sanitizeSerializedAttribute(error.message) } : { code: 0 };
    } catch {
      // SDK extensions can attach errors with unreadable property accessors.
      return { code: 2, message: '<redacted>' };
    }
  }

  private getSpanAttributes(span: Span<any>): Record<string, unknown> {
    const data = span.spanData;
    const attributes: Record<string, unknown> = {
      __proto__: null,
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

    for (const [key, value] of flattenedAttributes(
      span.traceMetadata ?? {},
      TRACE_LINKAGE_ATTRIBUTE_KEYS,
    )) {
      if (INTERNAL_TRACE_METADATA_KEYS.has(key)) {
        continue;
      }

      if (TRACE_LINKAGE_ATTRIBUTE_KEYS.has(key)) {
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

    for (const [key, value] of flattenedAttributes(data.data)) {
      attributes[key] = value;
    }

    const command = commandToString(
      sanitizeAttributeByKey('command', attributes.command ?? attributes.cmd),
    );
    if (command) {
      attributes.command = command;
    }

    const exitCode = attributes.exit_code ?? attributes.exitCode;
    if (typeof exitCode === 'number') {
      attributes['process.exit.code'] = exitCode;
    }
  }

  private applyGenericSpanAttributes(
    data: Exclude<SpanData, { type: 'custom' }>,
    attributes: Record<string, unknown>,
  ): void {
    for (const [key, value] of flattenedAttributes(data)) {
      if (key === 'type') {
        continue;
      }

      attributes[`agent.${key}`] = value;
    }
  }

  private attributesToOTLP(attributes: Record<string, unknown>, span: Span<any>): any[] {
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const preserveTraceLinkage =
          typeof value === 'string' &&
          TRACE_LINKAGE_ATTRIBUTE_KEYS.has(key) &&
          Object.prototype.hasOwnProperty.call(span.traceMetadata ?? {}, key);
        return {
          key: sanitizeCredentialText(key),
          value: this.valueToOTLP(
            preserveTraceLinkage ? value : sanitizeAttributeByKey(key, value, attributes),
          ),
        };
      });
  }

  private valueToOTLP(value: unknown): any {
    if (value === null || value === undefined) {
      return { stringValue: '' };
    }

    if (typeof value === 'string') {
      return { stringValue: value };
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

    return { stringValue: sanitizeCredentialText(String(value)) };
  }

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
    } catch {
      logger.error('[AgentsTracing] Failed to encode an identifier');
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

type Container = ReturnType<typeof credentialContainer>;
type AttributeContext = Container | 'curl' | 'operands' | 'omit';

function sanitizeSerializedAttribute(
  value: unknown,
  context?: AttributeContext,
  parent = '',
): string {
  if (typeof value !== 'string') {
    return '<redacted>';
  }
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    if (
      trimmed.length > MAX_STRUCTURED_ATTRIBUTE_BYTES ||
      Buffer.byteLength(trimmed, 'utf8') > MAX_STRUCTURED_ATTRIBUTE_BYTES
    ) {
      return '<redacted>';
    }
    try {
      const parsed = parseStructuredJson(trimmed);
      if (typeof parsed === 'string') {
        const clean = sanitizeSerializedAttribute(parsed, context, parent);
        return clean === parsed ? value : JSON.stringify(clean);
      }
      if (isRecord(parsed) || Array.isArray(parsed)) {
        // Parsing can discard earlier duplicate fields that still contain secrets in the source.
        return JSON.stringify(sanitizeStructuredAttribute(parsed, context, parent));
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return '<redacted>';
      }
      // Non-JSON strings still need the existing free-text credential redaction.
    }
  }

  if (context && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    return '<redacted>'; // A truncated header or argument list can still contain credentials.
  }
  return sanitizeCredentialText(value, true, context);
}

function parseStructuredJson(value: string): unknown {
  if (typeof losslessJson.rawJSON !== 'function') {
    return JSON.parse(value);
  }

  return JSON.parse(value, (_key, parsed: unknown, context?: { source?: string }) => {
    if (typeof parsed === 'number' && typeof context?.source === 'string') {
      return losslessJson.rawJSON!(context.source);
    }
    return parsed;
  });
}

function isStandaloneAuthorization(value: string): boolean {
  const auth = /^\s*(Bearer|Basic)[ \t]+([A-Za-z\d._~+/-]+)=*\s*$/i.exec(value);
  if (!auth) {
    return false;
  }
  // Basic credentials encode a colon even for empty usernames or passwords.
  // Retain the existing opaque-token protection without masking labels like "Basic plan".
  return (
    auth[1].toLowerCase() === 'bearer' ||
    auth[2].length >= 20 ||
    Buffer.from(auth[2], 'base64').includes(':')
  );
}

// Withhold the whole string when a credential has no reliable closing delimiter.
function mustWithholdCredentialText(value: string): boolean {
  if (
    /\b(?:authorization|cookie)[ \t]*:[^\r\n]*\r?\n[ \t]/i.test(value) ||
    isStandaloneAuthorization(value) ||
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/.test(value) ||
    hasCredentialNamedPayload(value)
  ) {
    return true;
  }
  for (const [, key] of value.matchAll(
    /^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*:[^=\r\n]*=/gm,
  )) {
    if (isCredentialAttributeKey(key)) {
      return true;
    }
  }

  if (
    /"ciphertext"\s*:\s*"[^"]+"/.test(value) &&
    /"tag"\s*:\s*"[^"]+"/.test(value) &&
    /"(?:protected|unprotected|recipients|header)"\s*:/.test(value)
  ) {
    return true;
  }

  if (
    /"kty"\s*:\s*"(?:RSA|EC|OKP|oct)"/.test(value) &&
    /"(?:d|p|q|dp|dq|qi|oth|k)"\s*:/.test(value)
  ) {
    return true;
  }

  // YAML values can span lines, including flow collections under credential keys.
  for (const [, , key, scalar] of value.matchAll(
    /(?:^|[\r\n])[ \t]*(?:-[ \t]+)?(["']?)([A-Za-z_][A-Za-z\d_.-]*)\1[ \t]*:[ \t]*([^\r\n]*)/g,
  )) {
    if (isCredentialAttributeKey(key) && !/^[ \t]*["']/.test(scalar)) {
      return true;
    }
  }

  for (const [, , key, first] of value.matchAll(
    /[,{\[]\s*(["']?)([A-Za-z_][A-Za-z\d_.-]*)\1\s*:\s*(?=(\S|$))/g,
  )) {
    if (isCredentialAttributeKey(key) && first !== '"' && first !== "'") {
      return true;
    }
  }

  const netrc = value.replace(/^[ \t]*#[^\r\n]*/gm, '');
  if (
    /(?:^|[\r\n])[ \t]*(?:machine\s+\S+|default)\b/i.test(netrc) &&
    (/(?:^|\s)login\s+\S/i.test(netrc) ||
      /(?:machine\s+\S+|default)\s+(?:password|account)\b/i.test(netrc)) &&
    /(?:^|\s)(?:password|account)\s+\S/i.test(netrc)
  ) {
    return true;
  }

  return hasAmbiguousCredential(value);
}

// Withhold ambiguous quoted fields, including keys followed by JSONC comments.
function hasAmbiguousCredential(value: string) {
  for (const match of value.matchAll(
    /(?<!\\)(\\*)(?:"([^"]*)"|'([^']*)')\s*(?:\/[*/]|[:=]\s*(?=(\S|$)))/g,
  )) {
    const [, escapes, double, single, first] = match;
    if (first === undefined && value[match.index - 1] === '=') {
      continue; // A quoted assignment value can precede a //registry line.
    }
    const key = double ?? single;
    if (!escapes && /^[A-Za-z_][\w.-]*$/.test(key) && (first === '"' || first === "'")) {
      continue;
    }
    if (isCredentialAttributeKey(key.replace(/(?<!\\)\\+$/, ''))) {
      return true;
    }
  }

  return false;
}

function sanitizeCredentialText(
  value: string,
  inspectEncoding = true,
  context?: AttributeContext,
): string {
  if (value.length > MAX_STRUCTURED_ATTRIBUTE_BYTES || mustWithholdCredentialText(value)) {
    return '<redacted>';
  }

  if (
    (context === 'headers' &&
      value
        .split(/[\r\n]+/)
        .some((line) => isCredentialHeader('', line.replace(/^\s*[\w.-]+\s*:\s*/, '')))) ||
    (context === 'params' && looksLikeSecret(value))
  ) {
    return '<redacted>';
  }

  // Withhold mixed dumps as a unit. A header or environment value can span lines.
  if (context === 'env' || context === 'headers') {
    for (const match of value.matchAll(/(?<![\w.-])([\w.-]+)["']?\s*[:=][ \t]*/g)) {
      if (isCredentialAttributeKey(match[1], context)) {
        return context === 'headers' && match.index === 0 ? match[0] + '<redacted>' : '<redacted>';
      }
    }
  }

  value = redactCredentialLiterals(value);
  const command = value.replace(/\\\r?\n/g, '');
  const curl = context === 'curl' || containsCurl(command);
  if (curl || command.includes('-')) {
    const redact = argumentRedactor(context);
    const masked = command.replace(COMMAND_WORDS, (word) => redact(word) ?? word);
    if ((curl || masked !== command) && SHELL_EXPANSION.test(command)) {
      return '<redacted>'; // Variable and command expansion cannot be classified safely.
    }
    if (masked !== command) {
      value = masked;
    }
  }

  // Mask field values before Stripe keys, since names like sk_org_token can match both.
  const clean = redactStripeKeys(
    redactQuotedCredentials(value)
      .replace(/\b(?:gh[opsur]_|github_pat_|glpat-)[A-Za-z0-9_-]+/g, '<redacted>')
      .replace(/\b(?:sk|pk|key)-[a-zA-Z0-9_-]{20,}\b/g, '<REDACTED_API_KEY>')
      .replace(/\bAKIA[A-Z0-9]{16}\b/g, '<REDACTED_AWS_KEY>')
      .replace(/\bAIza[a-zA-Z0-9_-]{35}\b/g, '<redacted>')
      .replace(
        /^([ \t]*)([A-Za-z_][A-Za-z\d_.-]*)([ \t]+)(?![ \t:=])([^\r\n]+)/gm,
        (match, prefix: string, key: string, separator: string) =>
          key.toLowerCase() !== 'pwd' && isCredentialAttributeKey(key)
            ? `${prefix}${key}${separator}<redacted>`
            : match,
      )
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
      .replace(/\/[\w.%~+=/-]+/g, sanitizePathnameForLogging)
      .replace(/(\/\/)[^\s/?#]+@/g, (_match, prefix: string) => `${prefix}<redacted>@`)
      .replace(
        /(["'])(\b(?:Authorization\s*:|Authorization\s*=(?=[ \t]*(?:Bearer|Basic|Token|Api[-_]?Key|Digest|Negotiate|AWS4-HMAC-SHA256)\b)|Cookie\s*:)[ \t]*)(?:\\[^\r\n]|(?!\1)[^\\\r\n])*(?:\1|(?=[\r\n]|$))|(\b(?:Authorization\s*:|Authorization\s*=(?=[ \t]*(?:Bearer|Basic|Token|Api[-_]?Key|Digest|Negotiate|AWS4-HMAC-SHA256)\b)|Cookie\s*:)[ \t]*)[^\r\n]*/gi,
        (match, quote: string | undefined, quotedPrefix: string, prefix: string) =>
          quote
            ? `${quote}${quotedPrefix}<redacted>${match.endsWith(quote) ? quote : ''}`
            : `${prefix}<redacted>`,
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
      // Query and form parameters admit punctuation that delimits configuration
      // values. Mask the full parameter before applying configuration delimiters.
      .replace(
        /(^|[?&#])([\w.%+[\]-]+)=(?:(?:Bearer|Basic|Token|Api[-_]?Key)\s+)?([^&#\s]+)/gi,
        (match, prefix: string, key: string, raw: string) =>
          isPrivateParameter(key, prefix, raw, inspectEncoding)
            ? prefix + key + '=<redacted>'
            : match,
      )
      .replace(
        /(^|[?&#;:,\s{])((?:[A-Za-z_]|%[\da-fA-F]{2})[A-Za-z\d_.%+-]*(?:\[[\w.%+-]*\])*)(\s*=\s*)(["']?)(?:(?:Bearer|Basic|Token|Api[-_]?Key)\s+)?([^&#;\s"',}\]]+)\4/gi,
        (match, prefix: string, key: string, separator: string, quote: string, raw: string) =>
          isPrivateParameter(key, prefix, raw, inspectEncoding)
            ? prefix + key + separator + quote + '<redacted>' + quote
            : match,
      ),
  );
  // The format-specific rules can consume an outer assignment while missing
  // an inner unquoted credential. Never export a surviving bare assignment.
  return /[:=]/.test(clean) ? checkCredentialAssignments(clean) : clean;
}

// Inspect escaped delimiters and ANSI colors without putting decoded text into a trace.
function isStripeKeyBoundary(before: string): boolean {
  for (let depth = 0; depth < 3; depth++) {
    const decoded = before.replace(/(?:%|\\x)([\da-f]{2})|\\u([\da-f]{4})/gi, (_, byte, unit) =>
      String.fromCharCode(Number.parseInt(byte ?? unit, 16)),
    );
    if (decoded === before) {
      break;
    }
    before = decoded;
  }
  return /(?:^|[^A-Za-z0-9]|\\[bfnrtv]|(?:\[|\u009b)[\d;:]*m)$/.test(before);
}

function redactStripeKeys(value: string): string {
  const suffix = /[\w-]*[A-Za-z0-9]/y;
  let result = '';
  let start = 0;
  for (const key of value.matchAll(/[sr]k_(?:live|test)_|sk_org(?:_|(?=[A-Za-z0-9]{20}))/g)) {
    if (key.index < start) {
      continue;
    }
    // Inspect each gap once. A prefix inside an identifier (e.g. task_test_results)
    // must not consume a later, delimited key.
    const before = value.slice(start, key.index);
    result += before;
    start = key.index;
    suffix.lastIndex = start + key[0].length;
    if (isStripeKeyBoundary(before) && suffix.test(value)) {
      result += '<redacted>';
      start = suffix.lastIndex;
    }
  }
  return result + value.slice(start);
}

function isPrivateParameter(key: string, prefix: string, raw: string, inspectEncoding: boolean) {
  let decodedKey = key;
  try {
    decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    // Preserve malformed query parameters while still checking their literal key.
  }
  const parameter = (prefix === '' && !key.startsWith('-')) || /[?&#;]/.test(prefix);
  return (
    isCredentialAttributeKey(decodedKey, parameter ? 'params' : undefined) ||
    (parameter && (/^code$/i.test(decodedKey) || looksLikeSecret(raw))) ||
    (inspectEncoding && hasEncodedCredential(raw))
  );
}

// Inspect encoded query values under otherwise harmless names. Never substitute
// a decoded URL into the trace, and bound decoding of nested redirects.
function hasEncodedCredential(raw: string): boolean {
  if (raw.includes('?') && sanitizeCredentialText(raw, false) !== raw) {
    return true;
  }
  for (let depth = 0; /%[\da-f]{2}/i.test(raw); depth++) {
    if (depth >= 3) {
      return true;
    }
    try {
      raw = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      return true;
    }
    if (sanitizeCredentialText(raw, false) !== raw) {
      return true;
    }
  }
  return false;
}

// Keep adjacent quoted and escaped fragments in the same shell argument.
const SHELL_EXPANSION = /[$\x60]|[<>]\(/;
const COMMAND_WORDS = /[;&|\r\n]+|(?:[^;&|\s"'\\]|\\[\s\S]|"(?:[^"\\]|\\[\s\S])*"?|'[^']*'?)+/g;

// Join literal shell fragments for classification only. Never evaluate shell syntax.
function unquoteShellWord(word: string) {
  return word.replace(/['"\\]/g, '');
}

function containsCurl(text: string, plain = unquoteShellWord(text)) {
  return /\bcurl\b/i.test(text) || /\bcurl\b/i.test(plain);
}

// These programs take search patterns or paths as operands. Treat unknown
// programs conservatively since they may launch curl (e.g. timeout or sudo).
const FILE_COMMAND = /(?:^|[/\\])(?:rg|ag|[ef]?grep|findstr|ls)(?:\.exe)?$/i;
const COMMAND_PREFIX =
  /^(?:\w+=[\s\S]*|-i|--ignore-environment|--|(?:.*[/\\])?(?:env|command|exec|git))$/;

function classifyExecutable(word: string, arg = unquoteShellWord(word)) {
  if (COMMAND_PREFIX.test(arg)) {
    return 'start';
  }
  return FILE_COMMAND.test(arg) || FILE_COMMAND.test(word) ? 'operands' : 'unknown';
}

const PROPERTY_OPTIONS = new Set(['-D', '-P', '--define', '--project-prop', '--system-prop']);

function isCredentialProperty(assignment: string) {
  const field = /^\s*([^\s=]+)=/.exec(assignment)?.[1];
  return field !== undefined && isCredentialAttributeKey(field);
}

function credentialOption(arg: string, curl: boolean, property: boolean): string | undefined {
  if (property && isCredentialProperty(arg)) {
    return '';
  }
  if (curl) {
    // curl permits short options without operands before the credential flag.
    const flag =
      /^(?:-[#0-46:aBfgGiIjJklLMnNOpqRsSvVZ]*[uUEb]|--(?:(?:proxy-)?(?:user|pass|cert|tlspassword)|oauth2-bearer|cookie)(?:=|$))/.exec(
        arg,
      )?.[0];
    if (flag) {
      return flag;
    }
  }
  for (const option of arg.matchAll(/(?:^|(?<=[\s=]))(--?[A-Za-z][\w.-]*)(=|(?=\s|$))/g)) {
    if (
      PROPERTY_OPTIONS.has(option[1]) &&
      isCredentialProperty(arg.slice(option.index + option[0].length))
    ) {
      return '';
    }
    if (isCredentialAttributeKey(option[1])) {
      // A nested shell script can be a single argument. Withhold it in full.
      return option.index === 0 ? option[1] + option[2] : '';
    }
  }
  return undefined;
}

function argumentRedactor(context?: AttributeContext, native = false) {
  let mode: 'start' | 'unknown' | 'operands' | 'curl' | 'expanded' =
    context === 'operands' || context === 'curl' ? context : 'start';
  let maskNext = false;
  let property = false;
  return (word: unknown) => {
    // In native argv, even a standalone shell operator can be a literal
    // operand. Never let it clear an active credential context.
    if (
      typeof word === 'string' &&
      /^[;&|\r\n]+$/.test(word) &&
      (!native || (!maskNext && mode !== 'expanded' && mode !== 'curl'))
    ) {
      mode = 'start';
      maskNext = false;
      property = false;
      return;
    }
    if (maskNext || mode === 'expanded') {
      maskNext = false;
      return '<redacted>';
    }
    if (typeof word !== 'string') {
      return;
    }
    const arg = unquoteShellWord(word);
    if (mode === 'start') {
      mode = classifyExecutable(word, arg);
    }
    if (containsCurl(word, arg)) {
      // A quoted shell program can hide both the option and its operand in one word.
      if (/\s/.test(arg) && arg.includes('-')) {
        return '<redacted>';
      }
      if (mode !== 'operands') {
        mode = 'curl';
      }
    }
    if (mode === 'curl' && SHELL_EXPANSION.test(arg)) {
      mode = 'expanded';
      return '<redacted>';
    }
    const flag = credentialOption(arg, mode === 'curl', property);
    property = PROPERTY_OPTIONS.has(arg);
    if (flag === undefined) {
      return;
    }
    if (arg !== flag || flag.endsWith('=')) {
      return flag + '<redacted>';
    }
    maskNext = true;
  };
}

function hasCredentialNamedPayload(value: string): boolean {
  // MIME continuations start with a space or tab. Never cross the empty
  // line separating a part's headers from its body.
  for (const [header] of value.matchAll(
    /^content-disposition:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/gim,
  )) {
    const unfolded = header.replace(/\r?\n[ \t]+/g, ' ');
    for (const [, quoted, unquoted] of unfolded.matchAll(
      /\bname\s*=\s*(?:["']([^"']*)["']|([^\s;]+))/gi,
    )) {
      if (isCredentialAttributeKey(quoted ?? unquoted)) {
        return true;
      }
    }
  }
  // Never cross another '<'. Quoted attributes can contain '>' and span lines.
  for (const match of value.matchAll(/<((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/g)) {
    const tag = match[1];
    // An adjacent type parameter such as Promise<Session> can coexist
    // with JSX. Real elements also expose their name on the closing tag.
    if (/[\w$]/.test(value[match.index - 1] ?? '') && !/[=/:]/.test(tag)) {
      continue;
    }
    if (['redacted', 'REDACTED_API_KEY', 'REDACTED_AWS_KEY'].includes(tag)) {
      continue;
    }
    const name = tag.match(/^\/?(?:[\w.-]+:)?([A-Za-z_][A-Za-z\d_.-]*)\b/)?.[1];
    if (name && isCredentialAttributeKey(name)) {
      return true;
    }
    for (const [, field] of tag.matchAll(/\b(?:name|key)\s*=\s*["']([^"']*)["']/gi)) {
      if (isCredentialAttributeKey(field)) {
        return true;
      }
    }
  }
  return false;
}

// Stop at an unambiguous terminator. Guessing wrong can consume the next
// credential's name and opening quote while leaving its value in the trace.
function credentialLiteralEnd(value: string, start: number, delimiter: string): number {
  for (let i = start + delimiter.length; i < value.length; i++) {
    if (value[i] === '\\') {
      if (
        delimiter[0] === "'" &&
        value.startsWith(delimiter, i + 1) &&
        !/\w/.test(value[i + 1 + delimiter.length] ?? '')
      ) {
        // TOML literal strings treat a backslash as data. Other formats can
        // use it to escape a quote. Withhold both possible interpretations.
        return -1;
      }
      i++;
    } else if (delimiter === '`' && value.startsWith('${', i)) {
      return -1; // Interpolations can contain nested literals, including backticks.
    } else if (value.startsWith(delimiter, i)) {
      if (delimiter !== '`' && delimiter.length === 1 && value[i + 1] === delimiter) {
        i++; // Doubled quotes in configuration values.
      } else {
        return i + delimiter.length;
      }
    }
  }
  // A truncated ordinary quoted field can be masked through the end.
  return delimiter === '"' || delimiter === "'" ? value.length : -1;
}

const SOURCE_LITERALS =
  /(?<!\\)"""(?:\\[\s\S]|(?!""")[^\\])*"{3,5}|'''[\s\S]*?'{3,5}|(?<!\\)(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1|(?<!\\)`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?(?:\*\/|$)|(?<!:)\/\/[^\r\n\u2028\u2029]*|#[^\r\n]*|[()]/g;

// A label such as "password=" can look like an assignment starting at its
// closing quote. Never let a mask starting inside one literal or comment
// consume the next field. Advance the independent cursor only once per token.
function literalBoundaryCheck(value: string) {
  const spans = value.matchAll(SOURCE_LITERALS);
  let span = spans.next();
  return (start: number, end: number) => {
    while (!span.done) {
      const limit = span.value.index + span.value[0].length;
      if (limit > start) {
        return span.value.index < start && limit < end;
      }
      span = spans.next();
    }
    return false;
  };
}

// In JavaScript, # can introduce a private field and regex literals may
// contain arbitrary braces or comment markers. Tokenize without evaluating
// the source. Only use this alternate reading to withhold, never to export.
function javascriptPropertyText(value: string): string {
  if (!/[[{]/.test(value) || !/[#\\/]|\[\s*[\d.(+-]/.test(value)) {
    return value;
  }
  let text = '';
  let copied = 0;
  let remaining = MAX_STRUCTURED_ATTRIBUTE_NODES;
  const replace = (start: number, end: number, spelling: string) => {
    text += value.slice(copied, start) + spelling;
    copied = end;
  };
  try {
    const tokens = tokenizer(value, {
      ecmaVersion: 'latest',
      // Preserve property qualifiers across comments immediately after
      // the colon. Acorn keeps // inside quoted URLs intact.
      onComment: (_block, _comment, start, end) => replace(start, end, ' '),
    });
    for (const token of tokens) {
      if (--remaining < 0) {
        return '<redacted>';
      }
      const literal = 'value' in token ? token.value : undefined;
      let spelling: string;
      if (token.type === tokTypes.regexp) {
        spelling = '0';
      } else if (token.type === tokTypes.privateId) {
        spelling = value.slice(token.start + 1, token.end);
      } else if (typeof literal === 'string' && token.type === tokTypes.string) {
        spelling = JSON.stringify(literal);
      } else if (
        typeof literal === 'string' &&
        token.type === tokTypes.template &&
        /^[\w.$-]+$/.test(literal)
      ) {
        spelling = literal;
      } else if (token.type === tokTypes.num) {
        // Only the qualifier matters here. Normalize numeric literals so even
        // BigInt and exponent spellings can be skipped as property indices.
        spelling = '0';
      } else {
        continue;
      }
      replace(token.start, token.end, spelling);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      return '<redacted>';
    }
    // Trace fields also contain fragments and non-JavaScript configuration.
  }
  return text + value.slice(copied);
}

function redactCredentialLiterals(value: string): string {
  if (!/[:="'`]/.test(value)) {
    return value;
  }
  if (hasCredentialTable(value)) {
    return '<redacted>';
  }
  return maskAssignedLiterals(value);
}

function checkCredentialAssignments(value: string): string {
  const masked = maskAssignedLiterals(value, true);
  if (!/\/[*/]|[()[{]/.test(masked)) {
    return masked;
  }
  // Comments and grouping can split a static key, assignment, or template tag.
  // Skip quoted paths and globs so they cannot hide subsequent assignments.
  // Only use this alternate reading to decide whether to withhold the field.
  const source = javascriptPropertyText(masked);
  if (source === '<redacted>') {
    return source;
  }
  const joined = source
    .replace(SOURCE_LITERALS, (token) => (/^[()/]/.test(token) ? ' ' : token))
    .replace(/\[\s*(?:[+-]\s*)?["'`]?\d+["'`]?\s*\]/g, '');
  if (
    joined !== masked &&
    (hasCredentialTable(joined) || maskAssignedLiterals(joined, true) !== joined)
  ) {
    return '<redacted>';
  }
  return masked;
}

function literalKeySegment(key: string): string {
  // Resolve static TOML and JavaScript key spellings before classification.
  // Do this only within a key, never across a comment or value delimiter.
  return key
    .replace(/\\(?:\r\n|[\r\n\u2028\u2029])/g, '')
    .replace(
      /\\(?:x([\da-fA-F]{2})|(?:u|U0000)([\da-fA-F]{4})|u\{0*([\da-fA-F]{1,4})\})/g,
      (_, byte, code, point) => String.fromCharCode(Number.parseInt(byte ?? code ?? point, 16)),
    );
}

// Check TOML table paths and static object properties without interpreting their values.
function hasCredentialTable(value: string): boolean {
  if (!/[:=]/.test(value) || !/\{|^[ \t\uFEFF]*\[|[:=][\s(]*\[|\b(?:values?|kty)\b/im.test(value)) {
    return false;
  }
  // TOML literal strings and JavaScript disagree about escaped apostrophes.
  // Check both readings so neither can hide a neighboring property.
  return (
    hasCredentialPath(value) ||
    (value.includes("\\'") && hasCredentialPath(value.replace(/\\'/g, '_')))
  );
}

// A name/value header or parameter can put the credential label and its
// payload in either order. Withhold the dump without guessing row boundaries.
function hasCredentialLabel(names: string): boolean {
  if (!/\bvalues?[:=]/i.test(names)) {
    return false;
  }
  for (const [, label] of names.matchAll(/\b(?:name|key)[:=]\s*([\w.\\-]+)/gi)) {
    if (isCredentialAttributeKey(label, 'headers')) {
      return true;
    }
  }
  return false;
}

// In source text a private parameter may precede its JWK type. Scan normalized
// names twice and withhold ambiguous records without interpreting their values.
function hasPrivateJwk(names: string): boolean {
  if (!names.includes('kty')) {
    return false;
  }
  const fields = new Set<string>();
  for (const [, type] of names.matchAll(/\bkty[:=]\s*(\w+)/g)) {
    for (const field of PRIVATE_JWK_FIELDS.get(type) ?? []) {
      fields.add(field);
    }
  }
  for (const [, field] of names.matchAll(/\b(\w+)[:=]/g)) {
    if (fields.has(field)) {
      return true;
    }
  }
  return false;
}

function hasCredentialPath(value: string): boolean {
  // Ignore structural characters in strings and comments. A multiline
  // description can contain an apparent table header or closing brace.
  const names = value
    .replace(
      /#[^\r\n]*|(?<!\\)"""(?:\\[\s\S]|(?!""")[^\\])*"{3,5}|'''[\s\S]*?'{3,5}|(?<!\\)"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\\r?\n|\\\r|[^'\r\n])*'|(?<!\\)`(?:\\[\s\S]|[^`\\])*`|\\u(?:\{[\da-fA-F]+\}|[\da-fA-F]{4})/g,
      (token) => {
        if (token.startsWith('#')) {
          return '';
        }
        const width = token.startsWith('"""') || token.startsWith("'''") ? 3 : 1;
        const key = token.startsWith('\\') ? token : token.slice(width, -width);
        return literalKeySegment(key).replace(/[^\w.\\-]/g, '_') || '_';
      },
    )
    .replace(/(?:\?\?|\|\||&&|\+)=/g, '=')
    .replace(/(\S)\s+([.:=])/g, '$1$2')
    .replace(/\.[ \t]+/g, '.')
    .replace(/\[\s*([\w$.\\-]+)\s*\](?=[ \t]*[[.:=])/g, '.$1');
  if (hasCredentialLabel(names) || hasPrivateJwk(names)) {
    return true;
  }
  // A header resets the prefix. Inline tables and arrays inherit it.
  const entries =
    /^[ \t]*\[\[?([\w.\\\t -]+)\]\]?[ \t]*$|(?<![\w$.\\-])([\w$.\\-]+)[:=][\s(]*([[{]?)|([[\]{}])/gm;
  const parents: string[] = [];
  let path = '';
  let remaining = MAX_STRUCTURED_ATTRIBUTE_BYTES;
  for (const [, header, key, open, bracket] of names.trimStart().matchAll(entries)) {
    if (header !== undefined) {
      if (parents.length) {
        continue; // A complete array element such as ["label"] is not a header.
      }
      path = header.replace(/[ \t]/g, '');
      if (isCredentialAttributeKey(path)) {
        return true;
      }
    } else if (key !== undefined) {
      // Bound the work of checking long or deeply nested paths across rows.
      remaining -= path.length;
      const qualified = path ? path + '.' + key : key;
      // Standalone credential names already have scalar redaction below.
      if (
        remaining < 0 ||
        (path && isCredentialAttributeKey(qualified) && !isCredentialAttributeKey(key))
      ) {
        return true;
      }
      if (open) {
        parents.push(path);
        path = qualified;
      }
    } else if (bracket === '{' || bracket === '[') {
      parents.push(path);
    } else {
      path = parents.pop() ?? '';
    }
  }
  return false;
}

function isAmbiguousAssignment(
  value: string,
  start: number,
  requireMasked: boolean,
  prefix: string,
): boolean {
  if (requireMasked) {
    // Require a complete scalar. A redacted prefix can precede a function
    // argument, another shell word fragment or part of a compound expression.
    if (!value.startsWith('<redacted>', start)) {
      return true;
    }
    const end = start + '<redacted>'.length;
    if ((prefix === '"' || prefix === "'") && value[end] === prefix) {
      return end + 1 < value.length && !/\s/.test(value[end + 1]); // Quoted shell header.
    }
    // Keep separated assignments, options and trailing command names.
    const complete = /$|;|&(?!&)|\s+(?:[-\w.:/]+[ \t]*=|--?[A-Za-z]|[A-Za-z]\w*$|$)/y;
    complete.lastIndex = end;
    return !complete.test(value);
  }
  if (value[start] === '{') {
    // Only a flat brace-delimited ODBC value can use the scalar masker.
    // A TOML inline table can contain nested or quoted closing braces.
    const flat = /\{(?:}}|[^{}"'\r\n])*}(?=[ \t]*(?:;|$))/y;
    flat.lastIndex = start;
    return !flat.test(value);
  }
  return (
    value[start] === '[' ||
    value[start] === '(' ||
    value.startsWith('/*', start) ||
    value.startsWith('//', start)
  );
}

// Scalar masking can leave escaped word fragments or literals in expressions intact.
function hasAssignmentExpression(value: string): boolean {
  return (
    /\\[\s#;,&]|(?:\?\?|\|\|)(?!=)|(?:&&|[?+])[\s(]*["'`]/.test(value) ||
    (value.includes('(') && /["'`]|\(\s/.test(value)) ||
    (value.includes('?') && /:[\s(]*["'`]/.test(value))
  );
}

function maskAssignedLiterals(value: string, requireMaskedScalars = false): string {
  // Treat identifier escapes and continued lines as part of their token. Keep
  // offsets into the original text so only the assigned value gets replaced.
  const tokens = value.replace(
    /\\(?:u(?:[\da-fA-F]{4}|\{[\da-fA-F]+\})|\r\n|[\n\r\u2028\u2029])/g,
    (escape) => '_'.repeat(escape.length),
  );
  // Consume each segment once, including in a long dotted name with no assignment.
  // Follow dotted TOML keys and static JavaScript property access.
  const segments =
    /((?<!\\)"(?:\\.|[^"\\\r\n])*"|'[^'\r\n]*'|`[^`\r\n]*`(?=\s*\])|(?<![\w$-])[\w$-]+)(\s*(?:\]\s*)?([.:]|(?:\+|\?\?|\|\||&&)?=|\[(?=\s*["'`])|\/[*/])\s*)/g;
  const templateTag = /[\w$]+(?:\s*\.\s*[\w$]+)*\s*(?:\.\s*)?(?=`|\/[*/]|\[|\()/y;
  // Whitespace alone does not end a value. Accept a clear delimiter,
  // another assignment or a single trailing word, never an unknown expression.
  const boundary =
    /\s*(?:$|;|[,)\]}]+(?=$|[\s;]))|&[\w.%+[\]-]+=(?![=>])|\s+(?:(?:\/\/|["'\w])[\w."'\\:/\t -]*=(?![=>])|[A-Za-z]\w*$)/y;
  const delimiters = ['"""', "'''", '"', "'", '`'];
  const hasTemplate = value.includes('`');
  const hasExpression = hasAssignmentExpression(value);
  const crossesBoundary = literalBoundaryCheck(value);
  const parts: string[] = [];
  let next = -1;
  let qualified = false;
  let result = '';
  let copied = 0;
  for (let match = segments.exec(tokens); match; match = segments.exec(tokens)) {
    if (match.index !== next) {
      parts.length = 0;
      qualified = false;
    }
    const [, token, separator, operator] = match;
    if (operator === '//' && value[match.index - 1] === '=' && /[\r\n]/.test(separator)) {
      continue; // A .npmrc scalar can precede a //registry line.
    }
    const raw = value.slice(match.index, match.index + token.length);
    const key = raw.replace(/^["'`]|["'`]$/g, '');
    parts.push(literalKeySegment(key));
    qualified ||= key !== token || (operator === '.' && separator !== '.');
    if (operator === '.' || operator === '[') {
      next = segments.lastIndex;
      continue;
    }
    if (!isCredentialAttributeKey(parts.join('.'))) {
      continue;
    }
    if (match.index < copied || operator.startsWith('/')) {
      return '<redacted>';
    }
    // A simple tag such as String.raw can precede a JavaScript template.
    templateTag.lastIndex = segments.lastIndex;
    const start =
      hasTemplate && templateTag.test(tokens) ? templateTag.lastIndex : segments.lastIndex;
    const delimiter = delimiters.find((candidate) => value.startsWith(candidate, start));
    if (!delimiter) {
      if (
        operator.length > 1 ||
        hasExpression ||
        isAmbiguousAssignment(
          value,
          start,
          qualified || requireMaskedScalars,
          value[match.index - 1],
        )
      ) {
        return '<redacted>';
      }
      continue; // Unquoted scalars have format-specific delimiters.
    }
    const end = credentialLiteralEnd(value, start, delimiter);
    boundary.lastIndex = end;
    if (end === -1 || crossesBoundary(start, end) || !boundary.test(value)) {
      return '<redacted>';
    }
    // Include a template tag in the value. Otherwise scalar masking can
    // mistake the tag and template for separate assignments.
    result += value.slice(copied, segments.lastIndex) + delimiter + '<redacted>' + delimiter;
    copied = end;
    // Continue looking for keys from the previous operator. A conflicting
    // interpretation of an earlier quote can make two assignments overlap.
  }
  return result + value.slice(copied);
}

function redactQuotedCredentials(value: string): string {
  return value
    .replace(
      /(["'])([A-Za-z_][\w.-]*)([ \t]*:[ \t]*)(?:\\.|(?!\1)[^\\\r\n])*(?:\1|$)/gi,
      (match, quote: string, key: string, separator: string) =>
        isCredentialAttributeKey(key) ? `${quote}${key}${separator}<redacted>${quote}` : match,
    )
    .replace(
      /(^|[\s;])([A-Za-z_][A-Za-z\d_.-]*)(\s*=\s*)\{(?:}}|[^}])*(?:}|$)/gi,
      (match, prefix: string, key: string, separator: string) =>
        isCredentialAttributeKey(key) ? `${prefix}${key}${separator}<redacted>` : match,
    )
    .replace(
      /(["'])([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*[:=]\s*)(["'])(?:\\(?:[\s\S]|$)|\4\4|(?!\4)[^\\])*(?:\4|$)/g,
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

function sanitizeAttributeByKey(
  key: string,
  value: unknown,
  source?: Record<string, unknown>,
): unknown {
  try {
    if (isCredentialAttributeKey(key) || typeof value === 'function' || ArrayBuffer.isView(value)) {
      return '<redacted>';
    }
    if (value instanceof Date) {
      return new Date(Date.prototype.getTime.call(value));
    }
    const context = attributeContext(key, source);
    if (context === 'omit') {
      return '<redacted>';
    }
    if (typeof value === 'string') {
      return sanitizeSerializedAttribute(value, context, key);
    }
    if (Array.isArray(value) || isRecord(value)) {
      return sanitizeStructuredAttribute(value, context, key);
    }
    return value;
  } catch {
    return '<redacted>';
  }
}

function attributeContext(key: string, source?: Record<string, unknown>): AttributeContext {
  const container = credentialContainer(key);
  if (container) {
    return container;
  }
  const args = /^(.*\.)?(?:argv|args|arguments|command_args)$/i.exec(key);
  if (!args || !source) {
    return;
  }
  // Commands and argument lists can be separate siblings, including process.*
  // attributes. curl takes precedence when different aliases conflict.
  let context: AttributeContext;
  const fields = ['command', 'cmd', 'program', 'executable', 'executable.path', 'executable.name'];
  for (const field of fields) {
    const value = source[(args[1] ?? '') + field];
    if (value == null) {
      continue;
    }
    const words = Array.isArray(value) ? value : [value];
    let budget = MAX_STRUCTURED_ATTRIBUTE_BYTES;
    if (words.length > MAX_STRUCTURED_ATTRIBUTE_NODES) {
      return 'omit';
    }
    let tail = '';
    for (const word of words) {
      if (typeof word !== 'string' || word.length > budget || word.includes('<redacted>')) {
        return 'omit';
      }
      budget -= word.length;
      tail = word;
      if (containsCurl(word)) {
        context = 'curl';
      } else if (context !== 'curl' && classifyExecutable(word) === 'operands') {
        context = 'operands';
        break;
      }
    }
    // The operand for a trailing credential option may start the sibling list.
    const last = unquoteShellWord(tail).trimEnd().split(/\s+/).pop();
    if (last && credentialOption(last, context === 'curl', false) === last) {
      return 'omit';
    }
  }
  return context;
}

function isCredentialParameter(source: StructuredValue, key: string, context?: Container) {
  if (Array.isArray(source)) {
    const option = source[Number(key) - 1];
    if (typeof option !== 'string') {
      return false;
    }
    if (context && Number(key) % 2 === 1 && /^[\w.[\]-]+$/.test(option)) {
      return isCredentialAttributeKey(option, context);
    }
    return /^--?[A-Za-z][A-Za-z\d_.-]*$/.test(option) && isCredentialAttributeKey(option);
  }
  if (/^values?$/i.test(key)) {
    return Object.entries(source).some(
      ([field, name]) =>
        /^(name|key)$/i.test(field) &&
        typeof name === 'string' &&
        isCredentialAttributeKey(name, context),
    );
  }
  return (
    typeof source.kty === 'string' && PRIVATE_JWK_FIELDS.get(source.kty)?.includes(key) === true
  );
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

type StructuredValue = Record<string, unknown> | unknown[];

function isCredentialEntry(
  source: StructuredValue,
  key: string,
  entry: unknown,
  prefix: string,
  context: Container,
): boolean {
  const headerLabel =
    context === 'headers' &&
    /^key$/i.test(key) &&
    typeof entry === 'string' &&
    isCredentialHeader(entry, '') &&
    Object.keys(source).some((field) => /^values?$/i.test(field));
  return (
    (!headerLabel &&
      (isCredentialAttributeKey(key, context) ||
        (prefix !== '' && isCredentialAttributeKey(prefix + key, context)))) ||
    isCredentialParameter(source, key, context)
  );
}

function sanitizeStructuredAttribute(
  value: StructuredValue,
  context?: AttributeContext,
  parent = '',
) {
  const budget = { remaining: MAX_STRUCTURED_ATTRIBUTE_NODES };
  let characters = MAX_STRUCTURED_ATTRIBUTE_BYTES;

  function charge(nodes: number, size = 0, entry?: unknown) {
    budget.remaining -= nodes;
    characters -= size + (typeof entry === 'string' ? entry.length : 0);
    if (budget.remaining < 0 || characters < 0) {
      throw new RangeError('Trace attribute exceeds sanitization limits');
    }
  }

  function copyValue(
    value: unknown,
    context: AttributeContext,
    depth: number,
    parent: string,
  ): unknown {
    if (typeof value === 'function' || ArrayBuffer.isView(value)) {
      return '<redacted>';
    }
    if (typeof value === 'string') {
      return sanitizeSerializedAttribute(value, context, parent);
    }
    if (value instanceof Date) {
      return new Date(Date.prototype.getTime.call(value));
    }
    if (losslessJson.isRawJSON?.(value)) {
      const { rawJSON } = value as { rawJSON: string };
      charge(0, rawJSON.length);
      return rawJSON.startsWith('"') ? '<redacted>' : value;
    }
    if (Array.isArray(value) || isRecord(value)) {
      return copy(value, context, depth, parent);
    }
    return typeof value === 'bigint' ? String(value) : value;
  }

  function copy(
    source: StructuredValue,
    context: AttributeContext,
    depth: number,
    parent: string,
  ): StructuredValue | string {
    if (
      context === 'omit' ||
      depth > MAX_STRUCTURED_ATTRIBUTE_DEPTH ||
      typeof (source as Record<string, unknown>).toJSON === 'function' ||
      isJwe(source, budget)
    ) {
      return '<redacted>';
    }
    // Charge sparse array holes before allocating the copy.
    const array = Array.isArray(source);
    charge(array ? source.length : 0);
    const target = array ? new Array<unknown>(source.length) : {};
    const inherited = context === 'operands' || context === 'curl' ? undefined : context;
    const redactArgument = array ? argumentRedactor(context, true) : undefined;
    const prefix = parent && !array ? parent + '.' : '';
    for (const [key, value] of structuredAttributeEntries(source)) {
      // Keep the immediate qualifier across arrays and serialized objects.
      // Account for repeated prefixes in the same inspection budget.
      charge(1, prefix.length + key.length, value);
      const entry = redactArgument?.(value) ?? value;
      const nested = attributeContext(key, array ? undefined : source) ?? inherited;
      const sensitive =
        nested === 'omit' || isCredentialEntry(source, key, entry, prefix, inherited);
      const qualifier = array ? parent : key;
      Object.defineProperty(target, sanitizeSerializedAttribute(key), {
        configurable: true,
        enumerable: true,
        value: sensitive ? '<redacted>' : copyValue(entry, nested, depth + 1, qualifier),
        writable: true,
      });
    }
    return target;
  }

  try {
    const root = copy(value, context, 0, parent);
    return Buffer.byteLength(JSON.stringify(root), 'utf8') <= MAX_STRUCTURED_ATTRIBUTE_BYTES
      ? root
      : '<redacted>';
  } catch {
    // A malformed or oversized value must not discard other spans in the batch.
    return '<redacted>';
  }
}

// Check siblings in their original record before flattening and prefixing attribute names.
function* flattenedAttributes(
  source: Record<string, unknown>,
  linkage?: Set<string>,
): Generator<[string, unknown]> {
  try {
    const fields = Object.fromEntries(structuredAttributeEntries(source));
    const encrypted = isJwe(fields, { remaining: MAX_STRUCTURED_ATTRIBUTE_NODES });
    for (const [key, value] of Object.entries(fields)) {
      const sensitive = encrypted ? !linkage?.has(key) : isCredentialParameter(fields, key);
      yield [key, sensitive ? '<redacted>' : value];
    }
  } catch {
    // An unreadable envelope cannot be safely flattened.
  }
}

function* structuredAttributeEntries(
  value: Record<string, unknown> | unknown[],
): Generator<[string, unknown]> {
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      try {
        yield [key, Reflect.get(value, key)];
      } catch {
        yield [key, '<redacted>'];
      }
    }
  }
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
