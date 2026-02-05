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
          {isTestRunning ? (
            <Spinner className="mr-1.5 size-3.5" />
          ) : (
            <Play className="mr-1.5 size-3.5" />
          )}
          {isTestRunning ? 'Testing...' : 'Test Target'}
        </Button>

        {!selectedTarget.config.url && !selectedTarget.config.request && (
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
            {(testResult.success || testResult.changes_needed) && (
              <Alert
                variant={
                  testResult.changes_needed
                    ? 'warning'
                    : testResult.success
                      ? 'success'
                      : 'destructive'
                }
              >
                {testResult.changes_needed ? (
                  <AlertCircle className="size-4" />
                ) : testResult.success ? (
                  <CheckCircle className="size-4" />
                ) : (
                  <AlertCircle className="size-4" />
                )}
                <AlertContent>
                  <AlertDescription className="text-sm">
                    <p className="font-medium">
                      {testResult.changes_needed
                        ? 'Configuration Changes Needed'
                        : testResult.success
                          ? 'Test Passed'
                          : 'Test Failed'}
                    </p>
                    <p className="mt-1">{testResult.message}</p>

                    {testResult.changes_needed_suggestions &&
                      testResult.changes_needed_suggestions.length > 0 && (
                        <div className="mt-2 rounded-md bg-background/50 p-2">
                          <p className="mb-1.5 font-medium">Suggested Changes</p>
                          <ul className="m-0 list-disc space-y-0.5 pl-4">
                            {testResult.changes_needed_suggestions.map(
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
                <ChevronDown
                  className={cn(
                    'size-4 text-muted-foreground transition-transform',
                    detailsExpanded && 'rotate-180',
                  )}
                />
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

                        {selectedTarget.config.headers &&
                          Object.keys(selectedTarget.config.headers).length > 0 && (
                            <CodeBlock label="Headers">
                              {JSON.stringify(selectedTarget.config.headers, null, 2)}
                            </CodeBlock>
                          )}

                        {selectedTarget.config.body &&
                          !testResult?.providerResponse?.metadata?.finalRequestBody &&
                          !testResult?.transformedRequest && (
                            <CodeBlock label="Body" maxHeight="300px">
                              {typeof selectedTarget.config.body === 'string'
                                ? selectedTarget.config.body
                                : JSON.stringify(selectedTarget.config.body, null, 2)}
                            </CodeBlock>
                          )}

                        {selectedTarget.config.request && (
                          <CodeBlock label="Raw Request" maxHeight="300px">
                            {selectedTarget.config.request}
                          </CodeBlock>
                        )}

                        {/* Show rendered body with template variables resolved */}
                        {(testResult?.providerResponse?.metadata?.finalRequestBody ||
                          testResult?.transformedRequest) && (
                          <CodeBlock label="Rendered Body">
                            {(() => {
                              const rendered =
                                testResult?.providerResponse?.metadata?.finalRequestBody ||
                                testResult?.transformedRequest;
                              return typeof rendered === 'string'
                                ? rendered
                                : JSON.stringify(rendered, null, 2);
                            })()}
                          </CodeBlock>
                        )}
                      </div>
                    </div>

                    {/* Response Details */}
                    <div className="flex min-w-0 flex-1 flex-col space-y-1.5">
                      <Label className="text-sm font-medium">Response</Label>
                      <div className="min-w-0 flex-1 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                        {testResult.providerResponse?.raw !== undefined ? (
                          <>
                            {responseHeaders && Object.keys(responseHeaders).length > 0 && (
                              <CodeBlock label="Headers">
                                {JSON.stringify(responseHeaders, null, 2)}
                              </CodeBlock>
                            )}

                            <CodeBlock label="Raw Response">
                              {(() => {
                                const raw = testResult.providerResponse?.raw;
                                if (typeof raw === 'string') {
                                  // Try to parse and format as JSON
                                  try {
                                    const parsed = JSON.parse(raw);
                                    return JSON.stringify(parsed, null, 2);
                                  } catch {
                                    // Not valid JSON, return as-is
                                    return raw;
                                  }
                                }
                                return JSON.stringify(raw, null, 2);
                              })()}
                            </CodeBlock>

                            {testResult.providerResponse?.sessionId && (
                              <CodeBlock label="Session ID">
                                {testResult.providerResponse.sessionId}
                              </CodeBlock>
                            )}
                          </>
                        ) : (
                          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
                            <p className="text-sm text-destructive">
                              {testResult.providerResponse?.error || 'No response from provider'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Final Response */}
                  {testResult.providerResponse && testResult.providerResponse.raw !== undefined && (
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
                            {typeof testResult.providerResponse?.output === 'string'
                              ? testResult.providerResponse?.output
                              : JSON.stringify(testResult.providerResponse?.output, null, 2) ||
                                'No parsed response'}
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
