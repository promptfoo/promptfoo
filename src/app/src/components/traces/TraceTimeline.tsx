import { useMemo, useState } from 'react';

import { Card } from '@app/components/ui/card';
import { Collapsible, CollapsibleContent } from '@app/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatDuration, formatTimestamp, getSpanStatus } from './utils';
import type { TraceData, TraceSpan } from '@promptfoo/types';

// Use TraceSpan from base types
type SpanData = TraceSpan;

interface TraceTimelineProps {
  trace: TraceData;
}

interface ProcessedSpan extends SpanData {
  duration: number;
  relativeStart: number;
  depth: number;
  children: ProcessedSpan[];
}

export default function TraceTimeline({ trace }: TraceTimelineProps) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const processedSpans = useMemo(() => {
    if (!trace.spans || trace.spans.length === 0) {
      return { spans: [], minTime: 0, maxTime: 0, totalDuration: 0 };
    }

    // Sort spans by start time
    const sortedSpans = [...trace.spans].sort((a, b) => a.startTime - b.startTime);

    // Find min and max times
    const minTime = sortedSpans[0].startTime;
    const maxTime = sortedSpans.reduce((max, span) => {
      const spanEnd = span.endTime || span.startTime;
      return spanEnd > max ? spanEnd : max;
    }, minTime);

    const totalDuration = maxTime - minTime;

    // Build span hierarchy
    const spanMap = new Map<string, ProcessedSpan>();
    const rootSpans: ProcessedSpan[] = [];

    // First pass: create all spans
    sortedSpans.forEach((span) => {
      const duration = span.endTime ? span.endTime - span.startTime : 0;
      const processedSpan: ProcessedSpan = {
        ...span,
        duration,
        relativeStart: span.startTime - minTime,
        depth: 0,
        children: [],
      };
      spanMap.set(span.spanId, processedSpan);
    });

    // Second pass: build hierarchy
    spanMap.forEach((span) => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        const parent = spanMap.get(span.parentSpanId)!;
        parent.children.push(span);
      } else {
        rootSpans.push(span);
      }
    });

    // Calculate depths
    const calculateDepth = (span: ProcessedSpan, depth: number) => {
      span.depth = depth;
      span.children.forEach((child) => calculateDepth(child, depth + 1));
    };

    rootSpans.forEach((span) => calculateDepth(span, 0));

    // Flatten spans for rendering
    const flattenSpans = (spans: ProcessedSpan[]): ProcessedSpan[] => {
      const result: ProcessedSpan[] = [];
      const addSpan = (span: ProcessedSpan) => {
        result.push(span);
        span.children.forEach(addSpan);
      };
      spans.forEach(addSpan);
      return result;
    };

    return {
      spans: flattenSpans(rootSpans),
      minTime,
      maxTime,
      totalDuration,
    };
  }, [trace]);

  if (!trace.spans || trace.spans.length === 0) {
    return (
      <div className="p-2">
        <p className="text-sm text-muted-foreground">No trace data available</p>
      </div>
    );
  }

  const { spans, totalDuration } = processedSpans;

  return (
    <div className="pt-4">
      <p className="text-sm text-muted-foreground mb-2">Trace ID: {trace.traceId}</p>
      <p className="text-sm text-muted-foreground mb-6">
        Total Duration: {formatDuration(totalDuration)}
      </p>

      <Card className="p-4 overflow-auto">
        {spans.map((span, index) => {
          const status = getSpanStatus(span.statusCode);
          const isExpanded = expandedSpans.has(span.spanId);
          const hasAttributes = span.attributes && Object.keys(span.attributes).length > 0;

          // Original temporal timeline approach - both position AND width based on time
          const spanDurationPercent = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 0;
          const spanStartPercent =
            totalDuration > 0 ? (span.relativeStart / totalDuration) * 100 : 0;

          return (
            <Collapsible
              key={`${span.spanId}-${index}`}
              open={isExpanded}
              onOpenChange={() => toggleSpan(span.spanId)}
              className="mb-2"
            >
              <div className="flex items-center min-h-10 relative">
                {/* Expand/collapse button */}
                <button
                  type="button"
                  onClick={() => toggleSpan(span.spanId)}
                  className={cn(
                    'mr-1 p-1 rounded hover:bg-muted transition-colors',
                    !hasAttributes && 'invisible',
                  )}
                >
                  {isExpanded ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </button>

                {/* Span name with indentation */}
                <div
                  className="w-[28%] pr-4 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ paddingLeft: span.depth * 16 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-mono">{span.name}</span>
                    </TooltipTrigger>
                    <TooltipContent>{span.name}</TooltipContent>
                  </Tooltip>
                </div>

                {/* Timeline bar */}
                <div className="flex-1 relative h-6 bg-muted/50 rounded">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'absolute h-full rounded flex items-center px-2 overflow-hidden',
                          hasAttributes && 'cursor-pointer',
                          status.bgClass,
                        )}
                        style={{
                          left: `${spanStartPercent}%`,
                          width: `${Math.max(spanDurationPercent, 0.5)}%`,
                        }}
                        onClick={() => hasAttributes && toggleSpan(span.spanId)}
                      >
                        <span className="text-xs text-white whitespace-nowrap overflow-hidden text-ellipsis">
                          {formatDuration(span.duration)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="text-xs">Duration: {formatDuration(span.duration)}</p>
                        <p className="text-xs">Start: {formatTimestamp(span.startTime)}</p>
                        {span.endTime && (
                          <p className="text-xs">End: {formatTimestamp(span.endTime)}</p>
                        )}
                        {hasAttributes && (
                          <p className="text-xs italic">Click expand to view attributes</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Expandable attributes panel */}
              <CollapsibleContent>
                <div className="ml-10 mt-2 mb-4 p-4 bg-muted/50 rounded border-l-[3px] border-primary">
                  <h4 className="text-sm font-semibold mb-2">Span Details</h4>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Span ID</p>
                      <p className="text-sm font-mono text-[11px]">{span.spanId}</p>
                    </div>
                    {span.parentSpanId && (
                      <div>
                        <p className="text-xs text-muted-foreground">Parent Span ID</p>
                        <p className="text-sm font-mono text-[11px]">{span.parentSpanId}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Start Time</p>
                      <p className="text-xs">{formatTimestamp(span.startTime)}</p>
                    </div>
                    {span.endTime && (
                      <div>
                        <p className="text-xs text-muted-foreground">End Time</p>
                        <p className="text-xs">{formatTimestamp(span.endTime)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-xs">{formatDuration(span.duration)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className={cn('text-xs', status.textClass)}>{status.label}</p>
                    </div>
                  </div>

                  {hasAttributes && (
                    <>
                      <h4 className="text-sm font-semibold mb-2">Attributes</h4>
                      <div className="bg-background rounded p-2 max-h-[300px] overflow-auto">
                        {Object.entries(span.attributes!).map(([key, value], attrIndex, arr) => (
                          <div
                            key={key}
                            className={cn(
                              'flex gap-2 py-1',
                              attrIndex < arr.length - 1 && 'border-b border-border',
                            )}
                          >
                            <span className="font-mono text-[11px] text-primary min-w-[200px] break-all">
                              {key}
                            </span>
                            <span className="font-mono text-[11px] break-all whitespace-pre-wrap">
                              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </Card>
    </div>
  );
}
