import React from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Separator } from '@app/components/ui/separator';
import { Spinner } from '@app/components/ui/spinner';
import { cn } from '@app/lib/utils';
import ChatMessages from '@app/pages/eval/components/ChatMessages';
import { callApi } from '@app/utils/api';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Info,
  Play,
  Send,
} from 'lucide-react';
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
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);

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
        setDetailsExpanded(!data.success);
        onTestComplete?.(data.success);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setTestResult({
          success: false,
          message:
            errorData.message || errorData.error || `Test failed with status: ${response.status}`,
          reason: errorData.error || errorData.reason,
          details: errorData.details,
        });
        setDetailsExpanded(true);
        onTestComplete?.(false);
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      setDetailsExpanded(true);
      onTestComplete?.(false);
    } finally {
      setIsTestRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stateful Configuration Section */}
      <div>
        <p className="mb-0.5 text-sm font-medium">Does your system maintain conversation state?</p>
        <p className="mb-3 text-sm text-muted-foreground">
          This determines whether your application remembers context from previous messages in a
          conversation.
        </p>

        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
            <input
              type="radio"
              name="stateful"
              value="true"
              checked={String(selectedTarget.config.stateful ?? false) === 'true'}
              onChange={(e) => {
                updateCustomTarget('stateful', e.target.value === 'true');
                setTestResult(null);
              }}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm">Yes - my system is stateful</p>
              <p className="text-xs text-muted-foreground">
                The system maintains conversation history and context across messages
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
            <input
              type="radio"
              name="stateful"
              value="false"
              checked={String(selectedTarget.config.stateful ?? false) === 'false'}
              onChange={(e) => {
                updateCustomTarget('stateful', e.target.value === 'true');
                setTestResult(null);
              }}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm">No - my system is not stateful</p>
              <p className="text-xs text-muted-foreground">
                The full conversation history must be sent with every request
              </p>
            </div>
          </label>
        </div>

        {/* Info alert when system is not stateful */}
        {selectedTarget.config.stateful === false && (
          <Alert variant="info" className="mt-3">
            <Info className="size-4" />
            <AlertContent>
              <AlertDescription className="text-sm">
                Since your system doesn't maintain conversation history, the full context will be
                included in each request during multi-turn testing. Session management configuration
                is not needed for non-stateful systems.
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </div>

      {/* Only show session management options if the system is stateful */}
      {selectedTarget.config.stateful !== false && (
        <>
          <Separator />

          {/* Session Management Section */}
          <div>
            <p className="mb-0.5 text-sm font-medium">How does your target manage sessions?</p>
            <p className="mb-3 text-sm text-muted-foreground">
              Choose whether session IDs are created by your server or generated by the client.
            </p>

            <div className="space-y-1">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
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
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm">Server-generated Session ID</p>
                  <p className="text-xs text-muted-foreground">
                    Your server creates and returns session IDs (e.g., in cookies, headers, or
                    response body)
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
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
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm">Client-generated Session ID</p>
                  <p className="text-xs text-muted-foreground">
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
                <Label htmlFor="session-parser" className="text-sm font-medium">
                  Session ID Extraction
                </Label>
                <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
                  Specify how to extract the session ID from the server response. Leave empty if the
                  session ID is automatically handled (e.g., via cookies).
                </p>
                <Input
                  id="session-parser"
                  value={selectedTarget.config.sessionParser || ''}
                  placeholder="e.g., data.headers['session-id'] or JSON.parse(data.body).sessionId"
                  onChange={(e) => {
                    updateCustomTarget('sessionParser', e.target.value);
                    setTestResult(null);
                  }}
                  className="font-mono text-xs"
                />
              </div>

              <Alert variant="info">
                <Info className="size-4" />
                <AlertContent>
                  <AlertDescription className="text-sm">
                    <p className="mb-1.5 font-medium">Common patterns:</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      <li>
                        <strong>Header:</strong>{' '}
                        <code className="font-mono text-xs">data.headers['x-session-id']</code>
                      </li>
                      <li>
                        <strong>Cookie:</strong>{' '}
                        <code className="font-mono text-xs">
                          data.headers['set-cookie']?.match(/sessionId=([^;]+)/)?.[1]
                        </code>
                      </li>
                      <li>
                        <strong>JSON body:</strong>{' '}
                        <code className="font-mono text-xs">JSON.parse(data.body).session.id</code>
                      </li>
                    </ul>
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </>
          ) : (
            <Alert variant="info">
              <Info className="size-4" />
              <AlertContent>
                <AlertDescription className="text-sm">
                  <p className="mb-2 font-medium">Client-generated sessions enabled</p>
                  <p className="mb-2">
                    A unique UUID will be generated for each conversation and stored in the{' '}
                    <code className="rounded bg-muted px-1 font-mono text-xs">sessionId</code>{' '}
                    variable. Include{' '}
                    <code className="rounded bg-muted px-1 font-mono text-xs">
                      {'{{sessionId}}'}
                    </code>{' '}
                    in your request headers or body where needed.
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Header:</span>{' '}
                      <code className="font-mono text-xs">X-Session-ID: {'{{sessionId}}'}</code>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Body:</span>{' '}
                      <code className="font-mono text-xs">
                        {'{"session_id": "{{sessionId}}", "message": "{{prompt}}"}'}
                      </code>
                    </p>
                  </div>
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {/* Session Test Section */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Send className="size-3.5 text-primary" />
                <span className="text-sm font-medium">Test Session Configuration</span>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Validate your session configuration by sending two test requests. The first
                establishes a session with test data, and the second verifies the session persists
                across requests.
              </p>

              <Button
                onClick={runSessionTest}
                disabled={isTestRunning || !selectedTarget.config.url}
                size="sm"
                className="mb-3"
              >
                {isTestRunning ? (
                  <Spinner className="mr-1.5 size-3.5" />
                ) : (
                  <Play className="mr-1.5 size-3.5" />
                )}
                {isTestRunning ? 'Testing...' : 'Test Session'}
              </Button>

              {!selectedTarget.config.url && (
                <Alert variant="warning" className="mb-3">
                  <AlertCircle className="size-4" />
                  <AlertContent>
                    <AlertDescription className="text-sm">
                      Please configure the target URL in the endpoint configuration before testing
                      sessions.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}

              {testResult && (
                <div className="space-y-3">
                  {/* Result Alert */}
                  <Alert variant={testResult.success ? 'success' : 'destructive'}>
                    {testResult.success ? (
                      <CheckCircle className="size-4" />
                    ) : (
                      <AlertCircle className="size-4" />
                    )}
                    <AlertContent>
                      <AlertDescription className="text-sm">
                        <p className="font-medium">
                          {testResult.success ? 'Session Test Passed' : 'Session Test Failed'}
                        </p>
                        <p className="mt-1">{testResult.message}</p>
                      </AlertDescription>
                    </AlertContent>
                  </Alert>

                  {/* Details Collapsible */}
                  {testResult.details && (
                    <Collapsible
                      open={detailsExpanded}
                      onOpenChange={setDetailsExpanded}
                      className="rounded-lg border border-border"
                    >
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted data-[state=open]:rounded-b-none">
                        <span className="text-sm font-medium">Session Test Details</span>
                        <ChevronDown
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            detailsExpanded && 'rotate-180',
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-3 border-t border-border p-3">
                          {/* Troubleshooting - only show on failure */}
                          {!testResult.success && (
                            <Alert variant="warning">
                              <AlertTriangle className="size-4" />
                              <AlertContent>
                                <AlertDescription className="text-sm">
                                  <p className="mb-1.5 font-medium">Troubleshooting</p>
                                  <ul className="m-0 list-disc space-y-0.5 pl-4">
                                    <li>
                                      Verify your session configuration matches your target's
                                      requirements
                                    </li>
                                    <li>
                                      For server sessions: Check the session parser extracts the
                                      correct ID
                                    </li>
                                    <li>
                                      For client sessions: Ensure {'{{sessionId}}'} is in the right
                                      place
                                    </li>
                                    <li>Confirm your target supports stateful conversations</li>
                                  </ul>
                                </AlertDescription>
                              </AlertContent>
                            </Alert>
                          )}

                          {/* Conversation Flow */}
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Conversation Flow</Label>
                            <div className="rounded-md border border-border bg-muted/30 p-3">
                              <ChatMessages
                                messages={(() => {
                                  const messages: Message[] = [];

                                  if (testResult.details?.request1?.prompt) {
                                    messages.push({
                                      role: 'user',
                                      content: testResult.details.request1.prompt,
                                    });
                                  }

                                  if (testResult.details?.response1) {
                                    const content =
                                      typeof testResult.details.response1 === 'string'
                                        ? testResult.details.response1
                                        : JSON.stringify(testResult.details.response1, null, 2);
                                    messages.push({
                                      role: 'assistant',
                                      content,
                                    });
                                  }

                                  if (testResult.details?.request2?.prompt) {
                                    messages.push({
                                      role: 'user',
                                      content: testResult.details.request2.prompt,
                                    });
                                  }

                                  if (testResult.details?.response2) {
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
                            </div>
                          </div>

                          {/* Test Result Explanation */}
                          {testResult.reason && (
                            <Alert variant={testResult.success ? 'success' : 'warning'}>
                              {testResult.success ? (
                                <CheckCircle className="size-4" />
                              ) : (
                                <AlertTriangle className="size-4" />
                              )}
                              <AlertContent>
                                <AlertDescription className="text-sm">
                                  <strong>{testResult.success ? 'Success:' : 'Issue:'}</strong>{' '}
                                  {testResult.reason}
                                </AlertDescription>
                              </AlertContent>
                            </Alert>
                          )}

                          {/* Session Configuration Info - at bottom */}
                          <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
                            <Label className="text-sm font-medium">Session Details</Label>
                            <div className="grid gap-1.5 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Session ID:</span>
                                <code className="rounded bg-muted px-2 py-0.5 text-xs">
                                  {testResult.details.sessionId || 'None'}
                                </code>
                              </div>
                              {testResult.details.sessionSource && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Session Source:</span>
                                  <span className="font-medium">
                                    {testResult.details.sessionSource}
                                  </span>
                                </div>
                              )}
                              {testResult.details.hasSessionIdTemplate !== undefined && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">
                                    {'{{sessionId}}'} template:
                                  </span>
                                  <span className="font-medium">
                                    {testResult.details.hasSessionIdTemplate
                                      ? 'Found'
                                      : 'Not found'}
                                  </span>
                                </div>
                              )}
                              {testResult.details.hasSessionParser !== undefined && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Session Parser:</span>
                                  <span className="font-medium">
                                    {testResult.details.hasSessionParser
                                      ? 'Configured'
                                      : 'Not configured'}
                                  </span>
                                </div>
                              )}
                              {testResult.details.sessionParser && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-muted-foreground">Parser Expression:</span>
                                  <code className="rounded bg-muted px-2 py-1 text-xs">
                                    {testResult.details.sessionParser}
                                  </code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Documentation link - always visible */}
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
  );
};

export default SessionsTab;
