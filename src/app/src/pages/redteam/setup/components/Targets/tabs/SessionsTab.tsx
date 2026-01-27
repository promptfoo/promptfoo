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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Separator } from '@app/components/ui/separator';
import { Spinner } from '@app/components/ui/spinner';
import { Textarea } from '@app/components/ui/textarea';
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
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import VariableSelectionDialog from './VariableSelectionDialog';
import type { Message } from '@app/pages/eval/components/ChatMessages';

import type { HttpProviderOptions } from '../../../types';

interface SessionEndpointConfigProps {
  session?: {
    url?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string;
    responseParser?: string;
  };
  onUpdate: (session: SessionEndpointConfigProps['session']) => void;
}

const SessionEndpointConfig: React.FC<SessionEndpointConfigProps> = ({ session, onUpdate }) => {
  const [headers, setHeaders] = React.useState<Array<{ key: string; value: string }>>(
    session?.headers
      ? Object.entries(session.headers).map(([key, value]) => ({ key, value }))
      : [{ key: '', value: '' }],
  );

  const updateSession = (field: string, value: unknown) => {
    onUpdate({
      ...session,
      [field]: value,
    });
  };

  const updateHeaders = (newHeaders: Array<{ key: string; value: string }>) => {
    setHeaders(newHeaders);
    const headersObj = newHeaders.reduce(
      (acc, { key, value }) => {
        if (key.trim()) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );
    updateSession('headers', Object.keys(headersObj).length > 0 ? headersObj : undefined);
  };

  const addHeader = () => {
    updateHeaders([...headers, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    updateHeaders(newHeaders.length > 0 ? newHeaders : [{ key: '', value: '' }]);
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    updateHeaders(newHeaders);
  };

  return (
    <div className="space-y-4">
      <Alert variant="info">
        <Info className="size-4" />
        <AlertContent>
          <AlertDescription className="text-sm">
            <p className="mb-2 font-medium">Session Endpoint Configuration</p>
            <p>
              Configure a separate endpoint that will be called to obtain session IDs before making
              API requests. The session ID will be available as{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{'{{sessionId}}'}</code> in
              your main request.
            </p>
          </AlertDescription>
        </AlertContent>
      </Alert>

      {/* Session Endpoint URL */}
      <div>
        <Label htmlFor="session-url" className="text-sm font-medium">
          Session Endpoint URL
        </Label>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          The URL of the endpoint that returns session IDs
        </p>
        <Input
          id="session-url"
          value={session?.url || ''}
          placeholder="https://api.example.com/auth/session"
          onChange={(e) => updateSession('url', e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      {/* Session Endpoint Method */}
      <div>
        <Label htmlFor="session-method" className="text-sm font-medium">
          HTTP Method
        </Label>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          The HTTP method to use when calling the session endpoint
        </p>
        <Select
          value={session?.method || 'POST'}
          onValueChange={(value) => updateSession('method', value)}
        >
          <SelectTrigger id="session-method" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Session Endpoint Headers */}
      <div>
        <Label className="text-sm font-medium">Headers</Label>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          Headers to send with the session endpoint request. Template variables like{' '}
          <code className="font-mono text-xs">{'{{api_key}}'}</code> are supported.
        </p>
        <div className="space-y-2">
          {headers.map((header, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={header.key}
                onChange={(e) => updateHeader(index, 'key', e.target.value)}
                placeholder="Header name"
                className="flex-1 font-mono text-xs"
              />
              <Input
                value={header.value}
                onChange={(e) => updateHeader(index, 'value', e.target.value)}
                placeholder="Header value"
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHeader(index)}
                className="shrink-0"
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addHeader} className="mt-1">
            <Plus className="mr-1.5 size-3.5" />
            Add Header
          </Button>
        </div>
      </div>

      {/* Session Endpoint Body (only for POST) */}
      {(session?.method || 'POST') === 'POST' && (
        <div>
          <Label htmlFor="session-body" className="text-sm font-medium">
            Request Body
          </Label>
          <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
            JSON body to send with the session endpoint request. Template variables are supported.
          </p>
          <Textarea
            id="session-body"
            value={
              typeof session?.body === 'string'
                ? session.body
                : session?.body
                  ? JSON.stringify(session.body, null, 2)
                  : ''
            }
            placeholder={'{\n  "client_id": "{{client_id}}"\n}'}
            onChange={(e) => {
              const value = e.target.value;
              try {
                const parsed = JSON.parse(value);
                updateSession('body', parsed);
              } catch {
                updateSession('body', value);
              }
            }}
            className="min-h-[100px] font-mono text-xs"
          />
        </div>
      )}

      {/* Response Parser */}
      <div>
        <Label htmlFor="session-response-parser" className="text-sm font-medium">
          Session ID Extraction
        </Label>
        <p className="mb-2 mt-0.5 text-sm text-muted-foreground">
          Specify how to extract the session ID from the session endpoint response
        </p>
        <Input
          id="session-response-parser"
          value={session?.responseParser || ''}
          placeholder="e.g., data.body.sessionId or data.headers['x-session-id']"
          onChange={(e) => updateSession('responseParser', e.target.value)}
          className="font-mono text-xs"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Common patterns: <code className="rounded bg-muted px-1">data.body.sessionId</code>,{' '}
          <code className="rounded bg-muted px-1">data.body.session.id</code>,{' '}
          <code className="rounded bg-muted px-1">data.headers['x-session-token']</code>
        </p>
      </div>

      {/* Usage hint */}
      <Alert variant="info">
        <Info className="size-4" />
        <AlertContent>
          <AlertDescription className="text-sm">
            <p className="mb-1.5 font-medium">How to use the session ID:</p>
            <p className="mb-2">
              Once configured, the session ID will be automatically fetched and made available as{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{'{{sessionId}}'}</code> in
              your main API request.
            </p>
            <div className="space-y-1 text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Header:</span>{' '}
                <code className="font-mono text-xs">X-Session: {'{{sessionId}}'}</code>
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
    </div>
  );
};

interface SessionsTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  onTestComplete?: (success: boolean) => void;
}

interface SessionRequest {
  prompt?: string;
}

interface TestResult {
  success: boolean;
  message: string;
  reason?: string;
  error?: string;
  details?: {
    sessionId?: string;
    request1?: SessionRequest;
    response1?: unknown;
    request2?: SessionRequest;
    response2?: unknown;
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
  const [showVariableDialog, setShowVariableDialog] = React.useState(false);
  const [selectedMainVariable, setSelectedMainVariable] = React.useState<string>('');

  // Get input variables from the provider config
  const inputVariables = selectedTarget.inputs ? Object.keys(selectedTarget.inputs) : [];
  const hasMultipleInputs = inputVariables.length > 0;

  const handleTestSessionClick = () => {
    if (hasMultipleInputs) {
      // Pre-select first variable if none selected
      if (!selectedMainVariable && inputVariables.length > 0) {
        setSelectedMainVariable(inputVariables[0]);
      }
      setShowVariableDialog(true);
    } else {
      runSessionTest();
    }
  };

  const handleDialogConfirm = () => {
    setShowVariableDialog(false);
    runSessionTest(selectedMainVariable);
  };

  const runSessionTest = async (mainInputVariable?: string) => {
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
            sessionSource: selectedTarget.config?.sessionSource,
            sessionParser: selectedTarget.config?.sessionParser,
          },
          // Pass the main input variable for multi-input configurations
          mainInputVariable,
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
              checked={String(selectedTarget.config?.stateful ?? false) === 'true'}
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
              checked={String(selectedTarget.config?.stateful ?? false) === 'false'}
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
        {selectedTarget.config?.stateful === false && (
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
      {selectedTarget.config?.stateful !== false && (
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
                    selectedTarget.config?.sessionSource === 'server' ||
                    !selectedTarget.config?.sessionSource
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
                  checked={selectedTarget.config?.sessionSource === 'client'}
                  onChange={(e) => {
                    updateCustomTarget('sessionSource', e.target.value);
                    if (e.target.value === 'client') {
                      updateCustomTarget('sessionParser', undefined);
                      updateCustomTarget('session', undefined);
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
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                <input
                  type="radio"
                  name="sessionSource"
                  value="endpoint"
                  checked={selectedTarget.config?.sessionSource === 'endpoint'}
                  onChange={(e) => {
                    updateCustomTarget('sessionSource', e.target.value);
                    updateCustomTarget('sessionParser', undefined);
                    // Initialize session endpoint config if not present
                    if (!selectedTarget.config?.session) {
                      updateCustomTarget('session', {
                        url: '',
                        method: 'POST',
                        responseParser: '',
                      });
                    }
                    setTestResult(null);
                  }}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm">Separate Session Endpoint</p>
                  <p className="text-xs text-muted-foreground">
                    Call a separate endpoint to get session IDs before making API requests
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Server-generated session ID configuration */}
          {(selectedTarget.config?.sessionSource === 'server' ||
            selectedTarget.config?.sessionSource == null) && (
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
                  value={(selectedTarget.config?.sessionParser as string) || ''}
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
          )}

          {/* Client-generated session ID configuration */}
          {selectedTarget.config?.sessionSource === 'client' && (
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

          {/* Session endpoint configuration */}
          {selectedTarget.config?.sessionSource === 'endpoint' && (
            <SessionEndpointConfig
              session={selectedTarget.config?.session as SessionEndpointConfigProps['session']}
              onUpdate={(session) => {
                updateCustomTarget('session', session);
                setTestResult(null);
              }}
            />
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
                onClick={handleTestSessionClick}
                disabled={isTestRunning || !selectedTarget.config?.url}
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

              {!selectedTarget.config?.url && (
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

      <VariableSelectionDialog
        open={showVariableDialog}
        onOpenChange={setShowVariableDialog}
        variables={inputVariables}
        variableDescriptions={selectedTarget.inputs}
        selectedVariable={selectedMainVariable}
        onSelectedVariableChange={setSelectedMainVariable}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
};

export default SessionsTab;
