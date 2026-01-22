import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import TraceView, { type Trace } from '../../../components/traces/TraceView';

interface DebuggingPanelProps {
  evaluationId?: string;
  testCaseId?: string;
  evalResultId?: string; // Precise correlation to specific eval result
  testIndex?: number;
  promptIndex?: number;
  traces?: Trace[];
}

export function DebuggingPanel({
  evaluationId,
  testCaseId,
  evalResultId,
  testIndex,
  promptIndex,
  traces = [],
}: DebuggingPanelProps) {
  return (
    <div>
      {evaluationId && (
        <div className="mb-4">
          <h4 className="mb-2 font-medium" aria-label="Trace Timeline">
            Trace Timeline
          </h4>
          <ErrorBoundary
            fallback={
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertContent>
                  <AlertDescription>Error loading traces</AlertDescription>
                </AlertContent>
              </Alert>
            }
          >
            <TraceView
              evaluationId={evaluationId}
              testCaseId={testCaseId}
              evalResultId={evalResultId}
              testIndex={testIndex}
              promptIndex={promptIndex}
              traces={traces}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
