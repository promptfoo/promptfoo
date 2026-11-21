import path from 'path';

import protobuf from 'protobufjs';

let requestType: protobuf.Type | undefined;

/** Encode fixtures through protobufjs independently of the production OTLP encoder. */
export function encodeOTLPRequest(data: Record<string, unknown>): Buffer {
  if (!requestType) {
    const protoDir = path.join(__dirname, '../../src/tracing/proto');
    const root = new protobuf.Root();
    root.resolvePath = (_origin, target) => path.join(protoDir, target);
    root.loadSync('opentelemetry/proto/collector/trace/v1/trace_service.proto');
    requestType = root.lookupType(
      'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
    );
  }
  return Buffer.from(requestType.encode(requestType.create(data)).finish());
}
