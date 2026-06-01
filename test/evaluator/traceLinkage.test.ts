import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTraceId, getTraceLinkage } from '../../src/evaluator';
import logger from '../../src/logger';

const TRACE_ID = 'a'.repeat(32);
const SPAN_ID = 'b'.repeat(16);
// Well-formed W3C v00 traceparent (4 parts) and a forward-compatible 5+ part variant.
const TP_V00 = `00-${TRACE_ID}-${SPAN_ID}-01`;
const TP_FUTURE = `01-${TRACE_ID}-${SPAN_ID}-01-extra-field`;
const TP_EMPTY_ID = `00--${SPAN_ID}-01`;

describe('getTraceId', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns undefined when no trace context or traceparent is present', () => {
    expect(getTraceId(undefined)).toBeUndefined();
    expect(getTraceId(null)).toBeUndefined();
    expect(getTraceId({})).toBeUndefined();
    expect(getTraceId({ evaluationId: 'eval-x' })).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('extracts the trace id from a well-formed v00 traceparent (4 parts)', () => {
    expect(getTraceId({ traceparent: TP_V00 })).toBe(TRACE_ID);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('accepts forward-compatible traceparents with more than 4 parts', () => {
    // W3C allows future versions to append fields after flags; still read trace-id at index 1.
    expect(getTraceId({ traceparent: TP_FUTURE })).toBe(TRACE_ID);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops linkage and warns for malformed traceparents with fewer than 4 parts', () => {
    expect(getTraceId({ traceparent: `00-${TRACE_ID}-01` })).toBeUndefined();
    expect(getTraceId({ traceparent: 'garbage' })).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('Malformed traceparent');
  });

  it('returns an empty id verbatim when the traceparent has 4 parts but an empty id', () => {
    // Downstream getTraceLinkage treats the falsy value as "no trace id" so it never surfaces.
    expect(getTraceId({ traceparent: TP_EMPTY_ID })).toBe('');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('getTraceLinkage', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns an empty object when there is no trace context', () => {
    expect(getTraceLinkage(undefined)).toEqual({});
    expect(getTraceLinkage(null, 'eval-fallback')).toEqual({});
  });

  it('pairs the trace id and evaluation id from the context', () => {
    const linkage = getTraceLinkage({ traceparent: TP_V00, evaluationId: 'eval-1' });
    expect(linkage).toEqual({ traceId: TRACE_ID, evaluationId: 'eval-1' });
  });

  it('falls back to the eval id when the context lacks an evaluation id', () => {
    const linkage = getTraceLinkage({ traceparent: TP_V00 }, 'eval-fallback');
    expect(linkage).toEqual({ traceId: TRACE_ID, evaluationId: 'eval-fallback' });
  });

  it('emits evaluationId without traceId when the traceparent is malformed', () => {
    // A trace context exists (the row was traced) but the trace id could not be parsed.
    const linkage = getTraceLinkage({ traceparent: 'malformed', evaluationId: 'eval-2' });
    expect(linkage).toEqual({ evaluationId: 'eval-2' });
  });

  it('omits both fields when a traced context has neither a parseable id nor an eval id', () => {
    expect(getTraceLinkage({ traceparent: 'malformed' })).toEqual({});
  });
});
