import express from 'express';
import { getTraceStore, type ParsedTrace, type SpanData } from './store';
import logger from '../logger';

interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values: any[] };
    kvlistValue?: { values: OTLPAttribute[] };
  };
}

interface OTLPSpan {
  traceId: string;  // Base64 encoded
  spanId: string;   // Base64 encoded
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: OTLPAttribute[];
  status?: {
    code: number;
    message?: string;
  };
}

interface OTLPScopeSpan {
  scope?: {
    name: string;
    version?: string;
  };
  spans: OTLPSpan[];
}

interface OTLPResourceSpan {
  resource?: {
    attributes?: OTLPAttribute[];
  };
  scopeSpans: OTLPScopeSpan[];
}

interface OTLPTraceRequest {
  resourceSpans: OTLPResourceSpan[];
}

export class OTLPReceiver {
  private app: express.Application;
  private traceStore = getTraceStore();
  
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  private setupMiddleware(): void {
    // Support both JSON and protobuf (for now, we'll focus on JSON)
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));
  }
  
  private setupRoutes(): void {
    // OTLP HTTP endpoint for traces
    this.app.post('/v1/traces', async (req, res) => {
      try {
        let traces: ParsedTrace[] = [];
        
        if (req.headers['content-type'] === 'application/json') {
          traces = this.parseOTLPJSONRequest(req.body);
        } else if (req.headers['content-type'] === 'application/x-protobuf') {
          // TODO: Implement protobuf parsing in phase 2
          logger.warn('Protobuf format not yet supported, please use JSON');
          res.status(415).json({ error: 'Protobuf format not yet supported' });
          return;
        } else {
          res.status(415).json({ error: 'Unsupported content type' });
          return;
        }
        
        // Group spans by trace ID
        const spansByTrace = new Map<string, SpanData[]>();
        for (const trace of traces) {
          if (!spansByTrace.has(trace.traceId)) {
            spansByTrace.set(trace.traceId, []);
          }
          spansByTrace.get(trace.traceId)!.push(trace.span);
        }
        
        // Store spans for each trace
        for (const [traceId, spans] of spansByTrace) {
          await this.traceStore.addSpans(traceId, spans);
        }
        
        // OTLP success response
        res.status(200).json({ partialSuccess: {} });
      } catch (error) {
        logger.error('Failed to process OTLP traces:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });
    
    // OTLP service info endpoint
    this.app.get('/v1/traces', (req, res) => {
      res.status(200).json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json'], // 'protobuf' will be added in phase 2
      });
    });
  }
  
  private parseOTLPJSONRequest(body: OTLPTraceRequest): ParsedTrace[] {
    const traces: ParsedTrace[] = [];
    
    for (const resourceSpan of body.resourceSpans) {
      // Extract resource attributes if needed
      const resourceAttributes = this.parseAttributes(resourceSpan.resource?.attributes);
      
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          // Convert base64 IDs to hex
          const traceId = this.base64ToHex(span.traceId);
          const spanId = this.base64ToHex(span.spanId);
          const parentSpanId = span.parentSpanId 
            ? this.base64ToHex(span.parentSpanId)
            : undefined;
          
          // Parse attributes
          const attributes = {
            ...resourceAttributes,
            ...this.parseAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
          };
          
          traces.push({
            traceId,
            span: {
              spanId,
              parentSpanId,
              name: span.name,
              startTime: Number(span.startTimeUnixNano) / 1_000_000, // Convert to ms
              endTime: span.endTimeUnixNano ? Number(span.endTimeUnixNano) / 1_000_000 : undefined,
              attributes,
              statusCode: span.status?.code,
              statusMessage: span.status?.message,
            }
          });
        }
      }
    }
    
    return traces;
  }
  
  private parseAttributes(attributes?: OTLPAttribute[]): Record<string, any> {
    if (!attributes) {
      return {};
    }
    
    const result: Record<string, any> = {};
    
    for (const attr of attributes) {
      const value = this.parseAttributeValue(attr.value);
      if (value !== undefined) {
        result[attr.key] = value;
      }
    }
    
    return result;
  }
  
  private parseAttributeValue(value: OTLPAttribute['value']): any {
    if (value.stringValue !== undefined) {
      return value.stringValue;
    }
    if (value.intValue !== undefined) {
      return Number(value.intValue);
    }
    if (value.doubleValue !== undefined) {
      return value.doubleValue;
    }
    if (value.boolValue !== undefined) {
      return value.boolValue;
    }
    if (value.arrayValue?.values) {
      return value.arrayValue.values.map((v) => this.parseAttributeValue(v));
    }
    if (value.kvlistValue?.values) {
      const kvMap: Record<string, any> = {};
      for (const kv of value.kvlistValue.values) {
        kvMap[kv.key] = this.parseAttributeValue(kv.value);
      }
      return kvMap;
    }
    return undefined;
  }
  
  private base64ToHex(base64: string): string {
    try {
      return Buffer.from(base64, 'base64').toString('hex');
    } catch (error) {
      logger.error(`Failed to convert base64 to hex: ${error}`);
      return base64; // Return original if conversion fails
    }
  }
  
  listen(port: number = 4318, host: string = '0.0.0.0'): void {
    this.app.listen(port, host, () => {
      logger.info(`OTLP receiver listening on http://${host}:${port}`);
    });
  }
  
  getApp(): express.Application {
    return this.app;
  }
}

// Singleton instance
let otlpReceiver: OTLPReceiver | null = null;

export function getOTLPReceiver(): OTLPReceiver {
  if (!otlpReceiver) {
    otlpReceiver = new OTLPReceiver();
  }
  return otlpReceiver;
}

export function startOTLPReceiver(port?: number, host?: string): void {
  const receiver = getOTLPReceiver();
  receiver.listen(port, host);
}