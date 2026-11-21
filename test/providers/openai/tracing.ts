import { trace } from '@opentelemetry/api';
import { vi } from 'vitest';

interface RecordedSpan {
  name: string;
  attributes: Record<string, any>;
  status?: { code: number; message?: string };
  ended: boolean;
}

export function installTracerSpy(): RecordedSpan[] {
  const spans: RecordedSpan[] = [];
  const make = (name: string, attributes: Record<string, any> = {}) => {
    const entry: RecordedSpan = { name, attributes: { ...attributes }, ended: false };
    spans.push(entry);
    return {
      setAttribute: (key: string, value: unknown) => {
        entry.attributes[key] = value;
      },
      setAttributes: (attrs: Record<string, unknown>) => Object.assign(entry.attributes, attrs),
      setStatus: (status: { code: number; message?: string }) => {
        entry.status = status;
      },
      end: () => {
        entry.ended = true;
      },
      recordException: () => undefined,
      addEvent: () => undefined,
      spanContext: () => ({ traceId: 'x', spanId: 'y' }),
      isRecording: () => true,
      updateName: () => undefined,
    };
  };
  vi.spyOn(trace, 'getTracer').mockReturnValue({
    startSpan: (name: string, options?: { attributes?: Record<string, unknown> }) =>
      make(name, options?.attributes),
    startActiveSpan: (...args: any[]) => {
      const name = args[0];
      const options = typeof args[1] === 'object' ? args[1] : undefined;
      const callback = args[args.length - 1];
      return callback(make(name, options?.attributes));
    },
  } as any);
  return spans;
}

export const createAttributeRecordingSpan =
  (attributes: Record<string, unknown>) =>
  (
    _name: string,
    options: { attributes: Record<string, unknown> },
    _context: unknown,
    callback: any,
  ) => {
    Object.assign(attributes, options.attributes);
    return callback({
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    });
  };
