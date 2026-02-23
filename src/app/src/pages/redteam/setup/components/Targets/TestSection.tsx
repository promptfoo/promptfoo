import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { AlertCircle, CheckCircle, ChevronDown, Info, Play, Send } from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface ProviderResponseData {
  metadata?: {
    http?: { headers?: Record<string, string> };
    finalRequestBody?: string;
  };
  raw?: unknown;
  output?: unknown;
  sessionId?: string;
  error?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  providerResponse?: ProviderResponseData;
  transformedRequest?: string | Record<string, unknown>;
  changes_needed?: boolean;
  changes_needed_suggestions?: string[];
}

interface TestSectionProps {
  selectedTarget: ProviderOptions;
  isTestRunning: boolean;
  testResult: TestResult | null;
  handleTestTarget: () => void;
  disabled: boolean;
  detailsExpanded: boolean;
  onDetailsExpandedChange: (expanded: boolean) => void;
}

interface CodeBlockProps {
  label: string;
  children: React.ReactNode;
  maxHeight?: string;
}

function getAlertVariant(
  changesNeeded?: boolean,
  success?: boolean,
): 'warning' | 'success' | 'destructive' {
  if (changesNeeded) {
    return 'warning';
  }
  if (success) {
    return 'success';
  }
  return 'destructive';
}

function getAlertTitle(changesNeeded?: boolean, success?: boolean): string {
  if (changesNeeded) {
    return 'Configuration Changes Needed';
  }
  if (success) {
    return 'Test Passed';
  }
  return 'Test Failed';
}

function getFinalOutputText(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(output, null, 2) || 'No parsed response';
}

function getBodyContent(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}

function formatRenderedBody(rendered: string | Record<string, unknown> | undefined | null): string {
  if (!rendered) {
    return '';
  }
  return typeof rendered === 'string' ? rendered : JSON.stringify(rendered, null, 2);
}

function formatRawResponse(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return JSON.stringify(raw, null, 2);
}

const CodeBlock: React.FC<CodeBlockProps> = ({ label, children, maxHeight = '200px' }) => (
  <div className="min-w-0 space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div
      className="overflow-auto rounded-md border border-border bg-white p-2 dark:bg-zinc-950"
      style={{ maxHeight }}
    >
      <pre className="m-0 overflow-hidden text-wrap break-all font-mono text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  </div>
);

const TestSection: React.FC<TestSectionProps> = ({
  selectedTarget,
  isTestRunning,
  testResult,
  handleTestTarget,
  disabled,
  detailsExpanded,
  onDetailsExpandedChange,
}) => {
  const responseHeaders = testResult?.providerResponse?.metadata?.http?.headers;

  const testButtonIcon = isTestRunning ? (
    <Spinner className="mr-1.5 size-3.5" />
  ) : (
    <Play className="mr-1.5 size-3.5" />
  );
  const testButtonText = isTestRunning ? 'Testing...' : 'Test Target';
  const showNoConfigWarning = !selectedTarget.config.url && !selectedTarget.config.request;

  const alertVariant = getAlertVariant(testResult?.changes_needed, testResult?.success);
  const alertTitle = getAlertTitle(testResult?.changes_needed, testResult?.success);
  const alertIcon =
    testResult?.success && !testResult?.changes_needed ? (
      <CheckCircle className="size-4" />
    ) : (
      <AlertCircle className="size-4" />
    );

  const showResultAlert = testResult?.success || testResult?.changes_needed;
  const hasSuggestions = (testResult?.changes_needed_suggestions?.length ?? 0) > 0;

  const renderedBodySource =
    testResult?.providerResponse?.metadata?.finalRequestBody || testResult?.transformedRequest;
  const renderedBodyContent = formatRenderedBody(
    renderedBodySource as string | Record<string, unknown> | undefined,
  );

  const rawResponseContent = formatRawResponse(testResult?.providerResponse?.raw);
  const finalOutputText = getFinalOutputText(testResult?.providerResponse?.output);
  const bodyContent = getBodyContent(selectedTarget.config.body);

  const hasHeaders = Boolean(
    selectedTarget.config.headers && Object.keys(selectedTarget.config.headers).length > 0,
  );
  const showBody = Boolean(
    selectedTarget.config.body &&
      !testResult?.providerResponse?.metadata?.finalRequestBody &&
      !testResult?.transformedRequest,
  );
  const showRenderedBody = Boolean(renderedBodySource);
  const hasResponseRaw = testResult?.providerResponse?.raw !== undefined;
  const showResponseHeaders = Boolean(responseHeaders && Object.keys(responseHeaders).length > 0);
  const noResponseError = testResult?.providerResponse?.error || 'No response from provider';
  const hasProviderResponse = Boolean(
    testResult?.providerResponse && testResult.providerResponse.raw !== undefined,
  );
  const chevronClass = cn(
    'size-4 text-muted-foreground transition-transform',
    detailsExpanded && 'rotate-180',
  );

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Send className="size-3.5 text-primary" />
          <span className="text-sm font-medium">Test Target Configuration</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Validate your target configuration by sending a test request to your endpoint. This will
          verify that your authentication, headers, and request transformation settings are working
          correctly.
        </p>

        <Button
          onClick={handleTestTarget}
          disabled={isTestRunning || disabled}
          size="sm"
          className="mb-3"
        >
          {testButtonIcon}
          {testButtonText}
        </Button>

        {showNoConfigWarning && (
          <Alert variant="warning" className="mb-3">
            <AlertCircle className="size-4" />
            <AlertContent>
              <AlertDescription className="text-sm">
                Please configure the target URL or request before testing.
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {testResult && (
          <div className="space-y-3">
            {/* Result Alert */}
            {showResultAlert && (
              <Alert variant={alertVariant}>
                {alertIcon}
                <AlertContent>
                  <AlertDescription className="text-sm">
                    <p className="font-medium">{alertTitle}</p>
                    <p className="mt-1">{testResult.message}</p>

                    {hasSuggestions && (
                      <div className="mt-2 rounded-md bg-background/50 p-2">
                        <p className="mb-1.5 font-medium">Suggested Changes</p>
                        <ul className="m-0 list-disc space-y-0.5 pl-4">
                          {testResult.changes_needed_suggestions!.map(
                            (suggestion: string, index: number) => (
                              <li key={index}>{suggestion}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {/* Request and Response Details */}
            <Collapsible
              open={detailsExpanded}
              onOpenChange={onDetailsExpandedChange}
              className="rounded-lg border border-border"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted data-[state=open]:rounded-b-none">
                <span className="text-sm font-medium">Request & Response Details</span>
                <ChevronDown className={chevronClass} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border p-3">
                  {/* Request and Response Side by Side */}
                  <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
                    {/* Request Details */}
                    <div className="flex min-w-0 flex-1 flex-col space-y-1.5">
                      <Label className="text-sm font-medium">Request</Label>
                      <div className="min-w-0 flex-1 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        {selectedTarget.config.url && (
                          <>
                            <CodeBlock label="URL">{selectedTarget.config.url}</CodeBlock>
                            <CodeBlock label="Method">
                              {selectedTarget.config.method || 'POST'}
                            </CodeBlock>
                          </>
                        )}

                        {hasHeaders && (
                          <CodeBlock label="Headers">
                            {JSON.stringify(selectedTarget.config.headers, null, 2)}
                          </CodeBlock>
                        )}

                        {showBody && (
                          <CodeBlock label="Body" maxHeight="300px">
                            {bodyContent}
                          </CodeBlock>
                        )}

                        {selectedTarget.config.request && (
                          <CodeBlock label="Raw Request" maxHeight="300px">
                            {selectedTarget.config.request}
                          </CodeBlock>
                        )}

                        {/* Show rendered body with template variables resolved */}
                        {showRenderedBody && (
                          <CodeBlock label="Rendered Body">{renderedBodyContent}</CodeBlock>
                        )}
                      </div>
                    </div>

                    {/* Response Details */}
                    <div className="flex min-w-0 flex-1 flex-col space-y-1.5">
                      <Label className="text-sm font-medium">Response</Label>
                      <div className="min-w-0 flex-1 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        {hasResponseRaw ? (
                          <>
                            {showResponseHeaders && (
                              <CodeBlock label="Headers">
                                {JSON.stringify(responseHeaders, null, 2)}
                              </CodeBlock>
                            )}

                            <CodeBlock label="Raw Response">{rawResponseContent}</CodeBlock>

                            {testResult.providerResponse?.sessionId && (
                              <CodeBlock label="Session ID">
                                {testResult.providerResponse.sessionId}
                              </CodeBlock>
                            )}
                          </>
                        ) : (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
                            <p className="text-sm text-destructive">{noResponseError}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Final Response */}
                  {hasProviderResponse && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-sm font-medium">Final Response</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-3.5 cursor-help text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="text-sm">
                            This is what promptfoo will use for evaluation. Configure the response
                            parser if this isn't the plain text output from your API.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="overflow-hidden rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="max-h-50 overflow-auto">
                          <pre className="m-0 overflow-hidden text-wrap break-all font-mono text-xs leading-relaxed">
                            {finalOutputText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestSection;
