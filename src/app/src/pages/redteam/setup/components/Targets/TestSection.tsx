import React from 'react';

import { Alert } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { AlertCircle, CheckCircle, Info, Play } from 'lucide-react';

import type { ProviderOptions } from '../../types';

export interface TestResult {
  success: boolean;
  message: string;
  providerResponse?: any;
  transformedRequest?: string | Record<string, any>;
  changes_needed?: boolean;
  changes_needed_suggestions?: string[];
}

interface TestSectionProps {
  selectedTarget: ProviderOptions;
  isTestRunning: boolean;
  testResult: TestResult | null;
  handleTestTarget: () => void;
  disabled: boolean;
}

const TestSection: React.FC<TestSectionProps> = ({
  selectedTarget,
  isTestRunning,
  testResult,
  handleTestTarget,
  disabled,
}) => {
  const responseHeaders = testResult?.providerResponse?.metadata?.http?.headers;

  return (
    <div className="mt-6 rounded-lg border bg-background p-6">
      <h4 className="mb-4 text-sm font-bold">Test Target Configuration</h4>

      <p className="mb-4 text-sm text-muted-foreground">
        Validate your target configuration by sending a test request to your endpoint. This will
        verify that your authentication, headers, and request transformation settings are working
        correctly.
      </p>

      <Button onClick={handleTestTarget} disabled={isTestRunning || disabled} className="mb-4">
        {isTestRunning ? <Spinner className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
        {isTestRunning ? 'Testing...' : 'Test Target'}
      </Button>

      {!selectedTarget.config.url && !selectedTarget.config.request && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <span>Please configure the target URL or request before testing.</span>
        </Alert>
      )}

      {testResult && (
        <>
          {(testResult.success || testResult.changes_needed) && (
            <Alert
              variant={
                testResult.changes_needed
                  ? 'warning'
                  : testResult.success
                    ? 'success'
                    : 'destructive'
              }
              className="mt-4"
            >
              {testResult.changes_needed ? (
                <AlertCircle className="h-4 w-4" />
              ) : testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <div>
                <p className="mb-1 font-bold">
                  {testResult.changes_needed
                    ? 'Configuration Changes Needed'
                    : testResult.success
                      ? 'Test Passed'
                      : 'Test Failed'}
                </p>
                <p className="text-sm">{testResult.message}</p>

                {/* Display configuration suggestions if available */}
                {testResult.changes_needed_suggestions &&
                  testResult.changes_needed_suggestions.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 font-bold">Suggested Changes:</p>
                      <ul className="m-0 list-disc pl-5">
                        {testResult.changes_needed_suggestions.map(
                          (suggestion: string, index: number) => (
                            <li key={index} className="text-sm">
                              {suggestion}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            </Alert>
          )}

          {/* Request and Response Details */}
          <details
            className="mt-4"
            open={testResult.changes_needed || testResult.success === false}
          >
            <summary className="cursor-pointer select-none text-xs">
              View request and response details
            </summary>

            {/* Request and Response Details Side by Side */}
            <div className="mt-4 flex flex-col gap-4 md:flex-row">
              {/* Request Details */}
              <div className="flex-1">
                <div className="h-full overflow-auto rounded bg-black/5 p-4 dark:bg-white/5">
                  <h5 className="mb-4 text-sm font-bold">Request Details</h5>

                  {/* URL and Method */}
                  {selectedTarget.config.url && (
                    <>
                      <p className="text-xs font-bold">URL:</p>
                      <div className="mb-4">
                        <pre className="my-1 whitespace-pre-wrap break-words text-xs">
                          {selectedTarget.config.url}
                        </pre>
                      </div>

                      <p className="text-xs font-bold">Method:</p>
                      <div className="mb-4">
                        <pre className="my-1 text-xs">{selectedTarget.config.method || 'POST'}</pre>
                      </div>
                    </>
                  )}

                  {/* Headers */}
                  {selectedTarget.config.headers &&
                    Object.keys(selectedTarget.config.headers).length > 0 && (
                      <>
                        <p className="text-xs font-bold">Request Headers:</p>
                        <div className="mb-4 max-h-[200px] overflow-auto">
                          <pre className="my-1 text-xs">
                            {JSON.stringify(selectedTarget.config.headers, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}

                  {/* Request Body */}
                  {selectedTarget.config.body && !testResult?.transformedRequest && (
                    <>
                      <p className="text-xs font-bold">Request Body:</p>
                      <div className="mb-4 max-h-[300px] overflow-auto">
                        <pre className="my-1 whitespace-pre-wrap break-words text-xs">
                          {typeof selectedTarget.config.body === 'string'
                            ? selectedTarget.config.body
                            : JSON.stringify(selectedTarget.config.body, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}

                  {/* Raw Request */}
                  {selectedTarget.config.request && (
                    <>
                      <p className="text-xs font-bold">Raw Request:</p>
                      <div className="mb-4 max-h-[300px] overflow-auto">
                        <pre className="my-1 whitespace-pre-wrap break-words text-xs">
                          {selectedTarget.config.request}
                        </pre>
                      </div>
                    </>
                  )}

                  {/* Transformed Request */}
                  {testResult?.transformedRequest && (
                    <>
                      <p className="text-xs font-bold">Request Body:</p>
                      <div className="max-h-[200px] overflow-auto">
                        <pre className="my-1 whitespace-pre-wrap break-words text-xs">
                          {typeof testResult.transformedRequest === 'string'
                            ? testResult.transformedRequest
                            : JSON.stringify(testResult.transformedRequest, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Response Details */}
              <div className="flex-1">
                <div className="h-full overflow-auto rounded bg-black/5 p-4 dark:bg-white/5">
                  <h5 className="mb-4 text-sm font-bold">Response Details</h5>

                  {testResult.providerResponse && testResult.providerResponse.raw !== undefined ? (
                    <>
                      {/* Response Headers */}
                      {responseHeaders && Object.keys(responseHeaders).length > 0 && (
                        <>
                          <p className="text-xs font-bold">Response Headers:</p>
                          <div className="mb-4 max-h-[200px] overflow-auto">
                            <pre className="my-1 break-all text-xs">
                              {JSON.stringify(responseHeaders, null, 2)}
                            </pre>
                          </div>
                        </>
                      )}

                      <p className="text-xs font-bold">Raw Response:</p>
                      <div className="max-h-[200px] overflow-auto">
                        <pre className="my-1 whitespace-pre-wrap break-all text-xs">
                          {typeof testResult.providerResponse?.raw === 'string'
                            ? testResult.providerResponse?.raw
                            : JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                        </pre>
                      </div>

                      {testResult.providerResponse?.sessionId && (
                        <>
                          <p className="mt-4 block text-xs font-bold">Session ID:</p>
                          <div className="max-h-[100px] overflow-auto">
                            <pre className="my-1 text-xs">
                              {testResult.providerResponse.sessionId}
                            </pre>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="max-h-[200px] overflow-auto">
                      <p className="break-all text-xs text-destructive">
                        {testResult.providerResponse?.error || 'No response from provider'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {testResult.providerResponse && testResult.providerResponse.raw !== undefined && (
              <div className="mt-4 overflow-auto rounded bg-black/5 p-4 dark:bg-white/5">
                <div className="mb-2 flex items-center gap-1">
                  <h5 className="text-sm font-bold">Final Response</h5>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      This is what promptfoo will use for evaluation. Configure the response parser
                      if this isn't the plain text output from your API.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="max-h-[200px] overflow-auto">
                  <pre className="m-0 whitespace-pre-wrap break-all text-xs">
                    {typeof testResult.providerResponse?.output === 'string'
                      ? testResult.providerResponse?.output
                      : JSON.stringify(testResult.providerResponse?.output, null, 2) ||
                        'No parsed response'}
                  </pre>
                </div>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
};

export default TestSection;
