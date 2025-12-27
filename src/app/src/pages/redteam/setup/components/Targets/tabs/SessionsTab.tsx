import React from 'react';

import ChatMessages from '@app/pages/eval/components/ChatMessages';
import { callApi } from '@app/utils/api';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
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
    <Stack spacing={3}>
      {/* Stateful Configuration Section */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
          Does your system maintain conversation state?
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This determines whether your application remembers context from previous messages in a
          conversation.
        </Typography>

        <FormControl>
          <RadioGroup
            value={String(selectedTarget.config.stateful ?? false)}
            onChange={(e) => {
              updateCustomTarget('stateful', e.target.value === 'true');
              setTestResult(null); // Clear test results when configuration changes
            }}
          >
            <FormControlLabel
              value="true"
              control={<Radio />}
              sx={{ alignItems: 'flex-start' }}
              label={
                <Box>
                  <Typography variant="body1">Yes - my system is stateful</Typography>
                  <Typography variant="caption" color="text.secondary">
                    The system maintains conversation history and context across messages
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="false"
              sx={{ alignItems: 'flex-start' }}
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">No - my system is not stateful</Typography>
                  <Typography variant="caption" color="text.secondary">
                    The full conversation history must be sent with every request
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Info alert when system is not stateful */}
        {selectedTarget.config.stateful === false && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Non-stateful configuration:</strong> Since your system doesn't maintain
              conversation history, the full context will be included in each request during
              multi-turn testing. This ensures each message contains all necessary information from
              previous turns.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Session management configuration is not needed for non-stateful systems.
            </Typography>
          </Alert>
        )}
      </Box>

      {/* Only show session management options if the system is stateful */}
      {selectedTarget.config.stateful !== false && (
        <>
          <Divider />

          {/* Session Management Section */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
              How does your target manage sessions?
            </Typography>

            <FormControl>
              <RadioGroup
                value={selectedTarget.config.sessionSource || 'server'}
                onChange={(e) => {
                  updateCustomTarget('sessionSource', e.target.value);
                  if (e.target.value === 'client') {
                    updateCustomTarget('sessionParser', undefined);
                  }
                  setTestResult(null); // Clear test results when configuration changes
                }}
              >
                <FormControlLabel
                  value="server"
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start' }}
                  label={
                    <Box>
                      <Typography variant="body1">Server-generated Session ID</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Your server creates and returns session IDs (e.g., in cookies, headers, or
                        response body)
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="client"
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start' }}
                  label={
                    <Box>
                      <Typography variant="body1">Client-generated Session ID</Typography>
                      <Typography variant="caption" color="text.secondary">
                        The client generates session IDs and includes them in requests
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
          </Box>

          {selectedTarget.config.sessionSource === 'server' ||
          selectedTarget.config.sessionSource == null ? (
            <>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Session ID Extraction
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Specify how to extract the session ID from the server response. Leave empty if the
                  session ID is automatically handled (e.g., via cookies).
                </Typography>

                <TextField
                  fullWidth
                  label="Session Parser (Required)"
                  value={selectedTarget.config.sessionParser || ''}
                  placeholder="e.g., data.headers['session-id'] or JSON.parse(data.body).sessionId"
                  onChange={(e) => {
                    updateCustomTarget('sessionParser', e.target.value);
                    setTestResult(null); // Clear test results when configuration changes
                  }}
                  margin="normal"
                  InputLabelProps={{
                    shrink: true,
                  }}
                  helperText="JavaScript expression to extract the session ID from the response"
                />
              </Box>

              <Alert severity="info">
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Common patterns:
                </Typography>
                <Typography variant="body2" component="div">
                  <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
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
                </Typography>
              </Alert>
            </>
          ) : (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Client-generated sessions enabled
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  A unique UUID will be generated for each conversation and stored in the{' '}
                  <code>sessionId</code> variable. Include <code>{'{{sessionId}}'}</code> in your
                  request headers or body where needed.
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Usage examples:</strong>
                </Typography>
                <Typography variant="body2" component="div" color="text.secondary">
                  In your request headers:
                  <br />
                  <code>X-Session-ID: {'{{sessionId}}'}</code>
                  <br />
                  <br />
                  Or in your request body:
                  <br />
                  <code>
                    {JSON.stringify(
                      { session_id: '{{sessionId}}', message: '{{prompt}}' },
                      null,
                      2,
                    )}
                  </code>
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Session Test Section */}
          <Paper
            elevation={1}
            sx={{ p: 3, backgroundColor: 'background.default', overflow: 'auto' }}
          >
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
              Test Session Configuration
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Run a quick test to verify that your session configuration is working correctly. This
              will send two requests: first to establish a session with test data, then a second
              request to verify the session persists.
            </Typography>

            <Button
              variant="contained"
              onClick={runSessionTest}
              disabled={isTestRunning || !selectedTarget.config.url}
              startIcon={isTestRunning ? <CircularProgress size={20} /> : <PlayArrowIcon />}
              sx={{ mb: 2 }}
            >
              {isTestRunning ? 'Testing Session...' : 'Test Session'}
            </Button>

            {!selectedTarget.config.url && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Please configure the target URL in the endpoint configuration before testing
                sessions.
              </Alert>
            )}

            {testResult && (
              <Alert
                severity={testResult.success ? 'success' : 'error'}
                icon={testResult.success ? <CheckCircleIcon /> : <ErrorIcon />}
                sx={{ mt: 2 }}
              >
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  {testResult.success ? 'Session Test Passed' : 'Session Test Failed'}
                </Typography>

                <Typography
                  variant="body2"
                  sx={{ mb: testResult.details ? 2 : 0, overflowWrap: 'anywhere' }}
                >
                  {testResult.message}
                </Typography>

                {testResult.details && (
                  <Box sx={{ mt: 2 }}>
                    {!testResult.success && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="caption">
                          <strong>What to check:</strong>
                          <br />• Verify your session configuration matches your target's
                          requirements
                          <br />• For server sessions: Check the session parser extracts the correct
                          ID
                          <br />• For client sessions: Ensure the {'{{sessionId}}'} variable is in
                          the right place
                          <br />• Confirm your target actually supports stateful conversations
                        </Typography>
                      </Alert>
                    )}

                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
                        <Typography variant="caption" component="span">
                          View detailed test results
                        </Typography>
                      </summary>

                      <Box sx={{ mt: 2 }}>
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
                            severity={testResult.success ? 'success' : 'warning'}
                            sx={{ mt: 2 }}
                          >
                            <Typography variant="caption">
                              <strong>{testResult.success ? 'Success:' : 'Issue:'}</strong>{' '}
                              {testResult.reason}
                            </Typography>
                          </Alert>
                        )}

                        {/* Session ID Info */}
                        <Box
                          sx={{
                            mt: 2,
                            p: 1.5,
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            <strong>Session ID used:</strong>{' '}
                            {testResult.details.sessionId || 'None'}
                          </Typography>
                          {testResult.details.sessionSource && (
                            <>
                              <br />
                              <Typography variant="caption" color="text.secondary">
                                <strong>Session source:</strong> {testResult.details.sessionSource}
                              </Typography>
                            </>
                          )}
                          {testResult.details.hasSessionIdTemplate !== undefined && (
                            <>
                              <br />
                              <Typography variant="caption" color="text.secondary">
                                <strong>{'{{sessionId}}'} template found:</strong>{' '}
                                {testResult.details.hasSessionIdTemplate ? 'Yes' : 'No'}
                              </Typography>
                            </>
                          )}
                          {testResult.details.hasSessionParser !== undefined && (
                            <>
                              <br />
                              <Typography variant="caption" color="text.secondary">
                                <strong>Session parser configured:</strong>{' '}
                                {testResult.details.hasSessionParser ? 'Yes' : 'No'}
                              </Typography>
                            </>
                          )}
                          {testResult.details.sessionParser && (
                            <>
                              <br />
                              <Typography variant="caption" color="text.secondary">
                                <strong>Session parser:</strong>{' '}
                                <code>{testResult.details.sessionParser}</code>
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Box>
                    </details>
                  </Box>
                )}
              </Alert>
            )}
          </Paper>
        </>
      )}

      {/* Documentation link - always visible */}
      <Box>
        <Typography variant="caption" color="text.secondary">
          For more information, see the{' '}
          <a
            href="https://www.promptfoo.dev/docs/providers/http/#session-management"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit' }}
          >
            session management documentation
          </a>
          .
        </Typography>
      </Box>
    </Stack>
  );
};

export default SessionsTab;
