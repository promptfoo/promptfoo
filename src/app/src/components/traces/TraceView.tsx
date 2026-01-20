import { useCallback } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { SpanData } from '@promptfoo/tracing/store';
import { Download } from 'lucide-react';
import TraceTimeline from './TraceTimeline';

export interface Trace {
  traceId: string;
  testCaseId?: string | number;
  spans?: Partial<SpanData>[];
}

interface TraceViewProps {
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  traces?: Trace[];
}

export default function TraceView({
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  traces = [],
}: TraceViewProps) {
  // Validate props BEFORE hooks to comply with Rules of Hooks
  if (!evaluationId) {
    return null;
  }

  if (traces.length === 0) {
    return (
      <div className="p-2">
        <p className="text-sm text-muted-foreground">No traces available for this evaluation</p>
      </div>
    );
  }

  // Hooks after early returns (evaluationId is guaranteed to exist here)
  const handleExportTraces = useCallback(
    (tracesToExport: Trace[]) => {
      const exportData = {
        evaluationId,
        testCaseId,
        exportedAt: new Date().toISOString(),
        traces: tracesToExport,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `traces-${evaluationId}${testCaseId ? `-${testCaseId}` : ''}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [evaluationId, testCaseId],
  );

  // Filter traces with try-direct-match then fallback approach
  const isComposedId = (id: unknown): id is string =>
    typeof id === 'string' && /^\d+-\d+$/.test(id);

  const matchesIndices = (id: unknown, ti?: number, pi?: number) => {
    if (!isComposedId(id) || ti === undefined || pi === undefined) {
      return false;
    }
    const [a, b] = id.split('-');
    return Number.parseInt(a, 10) === ti && Number.parseInt(b, 10) === pi;
  };

  // biome-ignore lint/suspicious/noExplicitAny: FIXME: We are getting confused between Trace and TraceData somewhere in here
  let filteredTraces: any[] = traces;

  if (traces.length > 0) {
    if (testCaseId) {
      // Try direct testCaseId match first
      const directMatches = traces.filter((trace) => trace.testCaseId === testCaseId);

      if (directMatches.length > 0) {
        filteredTraces = directMatches;
      } else if (testIndex !== undefined && promptIndex !== undefined) {
        // Fallback: try index-based matching on composed trace.testCaseId
        filteredTraces = traces.filter((trace) =>
          matchesIndices(trace.testCaseId, testIndex, promptIndex),
        );
      } else {
        // No direct match and no indices for fallback
        filteredTraces = [];
      }
    } else if (testIndex !== undefined && promptIndex !== undefined) {
      // No testCaseId but indices provided - try index-based filtering
      filteredTraces = traces.filter((trace) =>
        matchesIndices(trace.testCaseId, testIndex, promptIndex),
      );
    }
    // If no testCaseId and no indices, show all traces for the evaluation
  }

  if (filteredTraces.length === 0 && (testCaseId || testIndex !== undefined)) {
    return (
      <div className="p-2">
        <p className="text-sm text-muted-foreground">No traces available for this test case</p>
      </div>
    );
  }

  // If we have traces but no spans, show a helpful message
  const hasAnySpans = filteredTraces.some((trace) => trace.spans && trace.spans.length > 0);

  if (!hasAnySpans) {
    return (
      <div className="p-2">
        <Alert variant="info">
          <AlertContent>
            <AlertTitle>No spans received</AlertTitle>
            <AlertDescription>
              <p>Traces were created but no spans were received. Make sure your provider is:</p>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Configured to send traces to the OTLP endpoint (http://localhost:4318)</li>
                <li>Creating spans within the trace context</li>
                <li>Properly exporting spans before the evaluation completes</li>
              </ul>
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" onClick={() => handleExportTraces(filteredTraces)}>
          <Download className="size-4 mr-2" />
          Export Traces
        </Button>
      </div>
      {filteredTraces.map((trace, index) => (
        <div
          key={`trace-${trace.traceId}-${index}`}
          className={index < filteredTraces.length - 1 ? 'mb-6' : ''}
        >
          <TraceTimeline trace={trace} />
        </div>
      ))}
    </div>
  );
}
