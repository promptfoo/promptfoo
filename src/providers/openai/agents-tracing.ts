import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import type { Span, Trace, TracingExporter } from '@openai/agents';

/**
 * OTLP Tracing Exporter for OpenAI Agents
 *
 * Exports traces and spans from openai-agents-js to promptfoo's OTLP receiver
 * in OTLP JSON format over HTTP.
 */
export class OTLPTracingExporter implements TracingExporter {
  private otlpEndpoint: string;
  private evaluationId?: string;
  private testCaseId?: string;

  constructor(
    options: {
      otlpEndpoint?: string;
      evaluationId?: string;
      testCaseId?: string;
    } = {},
  ) {
    this.otlpEndpoint = options.otlpEndpoint || 'http://localhost:4318';
    this.evaluationId = options.evaluationId;
    this.testCaseId = options.testCaseId;
  }

  /**
   * Export traces and spans to OTLP endpoint
   */
  async export(items: (Trace | Span<any>)[], signal?: AbortSignal): Promise<void> {
    if (items.length === 0) {
      logger.debug('[AgentsTracing] No items to export');
      return;
    }

    logger.debug(`[AgentsTracing] Exporting ${items.length} items to OTLP`);

    try {
      const otlpPayload = this.transformToOTLP(items);
      const url = `${this.otlpEndpoint}/v1/traces`;

      logger.debug('[AgentsTracing] Sending OTLP payload', {
        url,
        spanCount: otlpPayload.resourceSpans[0]?.scopeSpans[0]?.spans?.length || 0,
      });

      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(otlpPayload),
        signal,
      });

      if (response.ok) {
        logger.debug('[AgentsTracing] Successfully exported traces to OTLP');
      } else {
        logger.error(
          `[AgentsTracing] OTLP export failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      logger.error('[AgentsTracing] Failed to export traces to OTLP', { error });
    }
  }

  /**
   * Transform openai-agents-js traces/spans to OTLP JSON format
   */
  private transformToOTLP(items: (Trace | Span<any>)[]): any {
    const spans = items
      .filter((item) => item.type === 'trace.span')
      .map((item) => this.spanToOTLP(item as Span<any>));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'promptfoo-agents' } },
              ...(this.evaluationId
                ? [
                    {
                      key: 'evaluation.id',
                      value: { stringValue: this.evaluationId },
                    },
                  ]
                : []),
              ...(this.testCaseId
                ? [{ key: 'test.case.id', value: { stringValue: this.testCaseId } }]
                : []),
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'openai-agents-js',
                version: '0.1.0',
              },
              spans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Convert a single span to OTLP format
   */
  private spanToOTLP(span: Span<any>): any {
    // Parse timestamps - they are ISO strings
    const startTime = span.startedAt ? new Date(span.startedAt).getTime() : Date.now();
    const endTime = span.endedAt ? new Date(span.endedAt).getTime() : undefined;

    // Generate IDs if missing (openai-agents-js sometimes doesn't set them)
    const traceId = span.traceId || this.generateTraceId();
    const spanId = span.spanId || this.generateSpanId();

    return {
      traceId: this.hexToBase64(traceId, 'trace'),
      spanId: this.hexToBase64(spanId, 'span'),
      parentSpanId: span.parentId ? this.hexToBase64(span.parentId, 'span') : undefined,
      name: this.getSpanName(span),
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: String(startTime * 1_000_000), // Convert ms to ns
      endTimeUnixNano: endTime ? String(endTime * 1_000_000) : undefined,
      attributes: this.attributesToOTLP(span.spanData),
      status: this.getSpanStatus(span),
    };
  }

  /**
   * Get span name from span data
   */
  private getSpanName(span: Span<any>): string {
    const data = span.spanData;

    // Try to get a meaningful name from span data
    if ('name' in data && data.name) {
      return data.name as string;
    }

    if (data.type) {
      return `agent.${data.type}`;
    }

    return 'agent.span';
  }

  /**
   * Get span status from span data
   */
  private getSpanStatus(span: Span<any>): any {
    const error = span.error;

    if (error) {
      return {
        code: 2, // STATUS_CODE_ERROR
        message: error.message || String(error),
      };
    }

    return {
      code: 0, // STATUS_CODE_OK
    };
  }

  /**
   * Convert span data to OTLP attributes
   */
  private attributesToOTLP(data: any): any[] {
    const attributes: any[] = [];

    if (!data) {
      return attributes;
    }

    // Convert all data fields to attributes
    for (const [key, value] of Object.entries(data)) {
      // Skip certain fields that are handled separately
      if (key === 'name' || key === 'type') {
        continue;
      }

      attributes.push({
        key: `agent.${key}`,
        value: this.valueToOTLP(value),
      });
    }

    return attributes;
  }

  /**
   * Convert a value to OTLP attribute value format
   */
  private valueToOTLP(value: any): any {
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
          values: value.map((v) => this.valueToOTLP(v)),
        },
      };
    }

    if (typeof value === 'object') {
      // For objects, convert to JSON string
      return { stringValue: JSON.stringify(value) };
    }

    return { stringValue: String(value) };
  }

  /**
   * Convert hex string to base64 for OTLP format
   * Handles openai-agents-js ID format (trace_XXX, span_XXX)
   * @param hex - The hex string to convert
   * @param kind - Whether this is a 'trace' (16 bytes) or 'span' (8 bytes) ID
   */
  private hexToBase64(hex: string, kind: 'trace' | 'span'): string {
    if (!hex) {
      return '';
    }

    try {
      // Strip prefixes if present (trace_, span_, group_)
      let cleanHex = hex.replace(/^(trace_|span_|group_)/, '');

      // Ensure hex is valid length (32 hex chars = 16 bytes for trace, 16 hex chars = 8 bytes for span)
      // If it's longer, truncate. If shorter, pad with zeros.
      const targetLength = kind === 'span' ? 16 : 32;
      if (cleanHex.length > targetLength) {
        cleanHex = cleanHex.substring(0, targetLength);
      } else if (cleanHex.length < targetLength) {
        cleanHex = cleanHex.padEnd(targetLength, '0');
      }

      return Buffer.from(cleanHex, 'hex').toString('base64');
    } catch (error) {
      logger.error(`[AgentsTracing] Failed to convert hex to base64: ${hex}`, { error });
      // Generate a fallback ID with correct length
      const fallbackLen = kind === 'span' ? 16 : 32;
      return Buffer.from(this.generateRandomHex(fallbackLen), 'hex').toString('base64');
    }
  }

  /**
   * Generate a random trace ID (32 hex chars)
   */
  private generateTraceId(): string {
    return this.generateRandomHex(32);
  }

  /**
   * Generate a random span ID (16 hex chars)
   */
  private generateSpanId(): string {
    return this.generateRandomHex(16);
  }

  /**
   * Generate random hex string of specified length
   */
  private generateRandomHex(length: number): string {
    const bytes = Math.ceil(length / 2);
    const buffer = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer.toString('hex').substring(0, length);
  }
}
