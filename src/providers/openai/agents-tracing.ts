import type { TracingExporter, Trace, Span } from '@openai/agents';
import logger from '../../logger';

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

  constructor(options: {
    otlpEndpoint?: string;
    evaluationId?: string;
    testCaseId?: string;
  } = {}) {
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

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(otlpPayload),
        signal,
      });

      if (!response.ok) {
        logger.error(
          `[AgentsTracing] OTLP export failed: ${response.status} ${response.statusText}`,
        );
      } else {
        logger.debug('[AgentsTracing] Successfully exported traces to OTLP');
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

    return {
      traceId: this.hexToBase64(span.traceId),
      spanId: this.hexToBase64(span.spanId),
      parentSpanId: span.parentId ? this.hexToBase64(span.parentId) : undefined,
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
   */
  private hexToBase64(hex: string): string {
    if (!hex) {
      return '';
    }

    try {
      return Buffer.from(hex, 'hex').toString('base64');
    } catch (error) {
      logger.error(`[AgentsTracing] Failed to convert hex to base64: ${hex}`, { error });
      return hex;
    }
  }
}
