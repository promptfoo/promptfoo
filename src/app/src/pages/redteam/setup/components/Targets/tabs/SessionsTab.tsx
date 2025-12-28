import React from 'react';

import { Alert, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Separator } from '@app/components/ui/separator';
import { Spinner } from '@app/components/ui/spinner';
import ChatMessages from '@app/pages/eval/components/ChatMessages';
import { callApi } from '@app/utils/api';
import { AlertTriangle, CheckCircle, Info, Play, XCircle } from 'lucide-react';
import type { Message } from '@app/pages/eval/components/ChatMessages';
import type { ProviderOptions } from '@promptfoo/types';

interface SessionsTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  onTestComplete?: (success: boolean) => void;
}

interface TestResult {
  success: boolean;
  message: string;
  reason?: string;
  error?: string;
  details?: {
    sessionId?: string;
    request1?: any;
    response1?: any;
    request2?: any;
    response2?: any;
    sessionSource?: string;
    hasSessionIdTemplate?: boolean;
    hasSessionParser?: boolean;
    sessionParser?: string;
  };
}

const SessionsTab: React.FC<SessionsTabProps> = ({
  selectedTarget,
  updateCustomTarget,
  onTestComplete,
}) => {
  const [isTestRunning, setIsTestRunning] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  const runSessionTest = async () => {
    setIsTestRunning(true);
    setTestResult(null);

    try {
      // Test session configuration through the backend API
      const response = await callApi('/providers/test-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedTarget,
          sessionConfig: {
            sessionSource: selectedTarget.config.sessionSource,
            sessionParser: selectedTarget.config.sessionParser,
          },
        }),
      });

      if (response.ok) {
        const data: TestResult = await response.json();

        setTestResult(data);

        // Call the callback when test completes
        if (onTestComplete) {
          onTestComplete(data.success);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestResult({
          success: false,
          message:
            errorData.message || errorData.error || `Test failed with status: ${response.status}`,
          reason: errorData.error || errorData.reason,
          details: errorData.details,
        });

        // Call the callback with failure
        if (onTestComplete) {
          onTestComplete(false);
        }
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      // Call the callback with failure
      if (onTestComplete) {
        onTestComplete(false);
      }
    } finally {
      setIsTestRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stateful Configuration Section */}
      <div>
        <p className="mb-4 font-semibold">Does your system maintain conversation state?</p>

        <p className="mb-4 text-sm text-muted-foreground">
          This determines whether your application remembers context from previous messages in a
          conversation.
        </p>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="stateful"
              value="true"
              checked={String(selectedTarget.config.stateful ?? false) === 'true'}
              onChange={(e) => {
                updateCustomTarget('stateful', e.target.value === 'true');
                setTestResult(null);
              }}
              className="mt-1"
            />
            <div>
              <p className="font-medium">Yes - my system is stateful</p>
              <p className="text-sm text-muted-foreground">
                The system maintains conversation history and context across messages
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="stateful"
              value="false"
              checked={String(selectedTarget.config.stateful ?? false) === 'false'}
              onChange={(e) => {
                updateCustomTarget('stateful', e.target.value === 'true');
                setTestResult(null);
              }}
              className="mt-1"
            />
            <div>
              <p className="font-medium">No - my system is not stateful</p>
              <p className="text-sm text-muted-foreground">
                The full conversation history must be sent with every request
              </p>
            </div>
          </label>
        </div>

        {/* Info alert when system is not stateful */}
        {selectedTarget.config.stateful === false && (
          <Alert variant="info" className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold">Non-stateful configuration:</p>
              <p className="mt-1">
                Since your system doesn't maintain conversation history, the full context will be
                included in each request during multi-turn testing. This ensures each message
                contains all necessary information from previous turns.
              </p>
              <p className="mt-2">
                Session management configuration is not needed for non-stateful systems.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Only show session management options if the system is stateful */}
      {selectedTarget.config.stateful !== false && (
        <>
          <Separator />

          {/* Session Management Section */}
          <div>
            <p className="mb-4 font-semibold">How does your target manage sessions?</p>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="sessionSource"
                  value="server"
                  checked={
                    selectedTarget.config.sessionSource === 'server' ||
                    !selectedTarget.config.sessionSource
                  }
                  onChange={(e) => {
                    updateCustomTarget('sessionSource', e.target.value);
                    if (e.target.value === 'client') {
                      updateCustomTarget('sessionParser', undefined);
                    }
                    setTestResult(null);
                  }}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium">Server-generated Session ID</p>
                  <p className="text-sm text-muted-foreground">
                    Your server creates and returns session IDs (e.g., in cookies, headers, or
                    response body)
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="sessionSource"
                  value="client"
                  checked={selectedTarget.config.sessionSource === 'client'}
                  onChange={(e) => {
                    updateCustomTarget('sessionSource', e.target.value);
                    if (e.target.value === 'client') {
                      updateCustomTarget('sessionParser', undefined);
                    }
                    setTestResult(null);
                  }}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium">Client-generated Session ID</p>
                  <p className="text-sm text-muted-foreground">
                    The client generates session IDs and includes them in requests
                  </p>
                </div>
              </label>
            </div>
          </div>

          {selectedTarget.config.sessionSource === 'server' ||
          selectedTarget.config.sessionSource == null ? (
            <>
              <div>
                <p className="mb-2 font-semibold">Session ID Extraction</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Specify how to extract the session ID from the server response. Leave empty if the
                  session ID is automatically handled (e.g., via cookies).
                </p>

                <div className="space-y-2">
                  <Label htmlFor="session-parser">Session Parser (Required)</Label>
                  <Input
                    id="session-parser"
                    value={selectedTarget.config.sessionParser || ''}
                    placeholder="e.g., data.headers['session-id'] or JSON.parse(data.body).sessionId"
                    onChange={(e) => {
                      updateCustomTarget('sessionParser', e.target.value);
                      setTestResult(null);
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    JavaScript expression to extract the session ID from the response
                  </p>
                </div>
              </div>

              <Alert variant="info">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-2 font-semibold">Common patterns:</p>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    <li>
                      <strong>Header:</strong> <code>data.headers['x-session-id']</code>
                    </li>
                    <li>
                      <strong>Cookie:</strong>{' '}
                      <code>data.headers['set-cookie']?.match(/sessionId=([^;]+)/)?.[1]</code>
                    </li>
                    <li>
                      <strong>JSON body:</strong> <code>JSON.parse(data.body).session.id</code>
                    </li>
                    <li>
                      <strong>JWT token:</strong> <code>JSON.parse(data.body).auth_token</code>
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <div>
              <Alert variant="info" className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-2 font-semibold">Client-generated sessions enabled</p>
                  <p className="mb-4">
                    A unique UUID will be generated for each conversation and stored in the{' '}
                    <code className="rounded bg-muted px-1">sessionId</code> variable. Include{' '}
                    <code className="rounded bg-muted px-1">{'{{sessionId}}'}</code> in your request
                    headers or body where needed.
                  </p>

                  <p className="mb-2 text-muted-foreground">
                    <strong>Usage examples:</strong>
                  </p>
                  <div className="text-sm text-muted-foreground">
                    In your request headers:
                    <br />
                    <code className="rounded bg-muted px-1">X-Session-ID: {'{{sessionId}}'}</code>
                    <br />
                    <br />
                    Or in your request body:
                    <br />
                    <code className="rounded bg-muted px-1">
                      {JSON.stringify(
                        { session_id: '{{sessionId}}', message: '{{prompt}}' },
                        null,
                        2,
                      )}
                    </code>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Session Test Section */}
          <div className="rounded-lg border border-border bg-muted/30 p-6">
            <p className="mb-4 font-semibold">Test Session Configuration</p>

            <p className="mb-4 text-sm text-muted-foreground">
              Run a quick test to verify that your session configuration is working correctly. This
              will send two requests: first to establish a session with test data, then a second
              request to verify the session persists.
            </p>

            <Button
              onClick={runSessionTest}
              disabled={isTestRunning || !selectedTarget.config.url}
              className="mb-4"
            >
              {isTestRunning ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Testing Session...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Test Session
                </>
              )}
            </Button>

            {!selectedTarget.config.url && (
              <Alert variant="warning" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Please configure the target URL in the endpoint configuration before testing
                  sessions.
                </AlertDescription>
              </Alert>
            )}

            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'} className="mt-4">
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <p className="mb-2 font-semibold">
                    {testResult.success ? 'Session Test Passed' : 'Session Test Failed'}
                  </p>

                  <p
                    className={testResult.details ? 'mb-4' : ''}
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {testResult.message}
                  </p>

                  {testResult.details && (
                    <div className="mt-4">
                      {!testResult.success && (
                        <Alert variant="warning" className="mb-4">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>What to check:</strong>
                            <br />• Verify your session configuration matches your target's
                            requirements
                            <br />• For server sessions: Check the session parser extracts the
                            correct ID
                            <br />• For client sessions: Ensure the {'{{sessionId}}'} variable is in
                            the right place
                            <br />• Confirm your target actually supports stateful conversations
                          </AlertDescription>
                        </Alert>
                      )}

                      <details className="mt-2">
                        <summary className="cursor-pointer select-none text-sm">
                          View detailed test results
                        </summary>

                        <div className="mt-4">
                          {/* Chat Messages */}
                          <ChatMessages
                            messages={(() => {
                              const messages: Message[] = [];

                              // Add first request
                              if (testResult.details.request1?.prompt) {
                                messages.push({
                                  role: 'user',
                                  content: testResult.details.request1.prompt,
                                });
                              }

                              // Add first response
                              if (testResult.details.response1) {
                                const content =
                                  typeof testResult.details.response1 === 'string'
                                    ? testResult.details.response1
                                    : JSON.stringify(testResult.details.response1, null, 2);
                                messages.push({
                                  role: 'assistant',
                                  content,
                                });
                              }

                              // Add second request
                              if (testResult.details.request2?.prompt) {
                                messages.push({
                                  role: 'user',
                                  content: testResult.details.request2.prompt,
                                });
                              }

                              // Add second response
                              if (testResult.details.response2) {
                                const content =
                                  typeof testResult.details.response2 === 'string'
                                    ? testResult.details.response2
                                    : JSON.stringify(testResult.details.response2, null, 2);
                                messages.push({
                                  role: 'assistant',
                                  content,
                                });
                              }

                              return messages;
                            })()}
                          />

                          {/* Test Result Explanation */}
                          {testResult.reason && (
                            <Alert
                              variant={testResult.success ? 'default' : 'warning'}
                              className="mt-4"
                            >
                              {testResult.success ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <AlertTriangle className="h-4 w-4" />
                              )}
                              <AlertDescription>
                                <strong>{testResult.success ? 'Success:' : 'Issue:'}</strong>{' '}
                                {testResult.reason}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Session ID Info */}
                          <div className="mt-4 rounded-md bg-muted/50 p-3">
                            <p className="text-sm text-muted-foreground">
                              <strong>Session ID used:</strong>{' '}
                              {testResult.details.sessionId || 'None'}
                            </p>
                            {testResult.details.sessionSource && (
                              <p className="text-sm text-muted-foreground">
                                <strong>Session source:</strong> {testResult.details.sessionSource}
                              </p>
                            )}
                            {testResult.details.hasSessionIdTemplate !== undefined && (
                              <p className="text-sm text-muted-foreground">
                                <strong>{'{{sessionId}}'} template found:</strong>{' '}
                                {testResult.details.hasSessionIdTemplate ? 'Yes' : 'No'}
                              </p>
                            )}
                            {testResult.details.hasSessionParser !== undefined && (
                              <p className="text-sm text-muted-foreground">
                                <strong>Session parser configured:</strong>{' '}
                                {testResult.details.hasSessionParser ? 'Yes' : 'No'}
                              </p>
                            )}
                            {testResult.details.sessionParser && (
                              <p className="text-sm text-muted-foreground">
                                <strong>Session parser:</strong>{' '}
                                <code className="rounded bg-muted px-1">
                                  {testResult.details.sessionParser}
                                </code>
                              </p>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}

      {/* Documentation link - always visible */}
      <div>
        <p className="text-sm text-muted-foreground">
          For more information, see the{' '}
          <a
            href="https://www.promptfoo.dev/docs/providers/http/#session-management"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            session management documentation
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default SessionsTab;
