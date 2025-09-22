import React from 'react';

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
import type { ProviderOptions } from '@promptfoo/types';

interface SessionsTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  onTestComplete?: (success: boolean) => void;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    sessionId?: string;
    request1?: any;
    response1?: any;
    request2?: any;
    response2?: any;
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
        const data = await response.json();

        setTestResult({
          success: data.success,
          message: data.message,
          details: data.details,
        });

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

        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
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
              label={
                <Box>
                  <Typography variant="body1">Yes - my system is stateful</Typography>
                  <Typography variant="caption" color="textSecondary">
                    The system maintains conversation history and context across messages
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="false"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">No - my system is not stateful</Typography>
                  <Typography variant="caption" color="textSecondary">
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
          </Alert>
        )}
      </Box>

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
              label={
                <Box>
                  <Typography variant="body1">Server-generated Session ID</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Your server creates and returns session IDs (e.g., in cookies, headers, or
                    response body)
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="client"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">Client-generated Session ID</Typography>
                  <Typography variant="caption" color="textSecondary">
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
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Specify how to extract the session ID from the server response. Leave empty if the
              session ID is automatically handled (e.g., via cookies).
            </Typography>

            <TextField
              fullWidth
              label="Session Parser (Optional)"
              value={selectedTarget.config.sessionParser || ''}
              placeholder="e.g., response.headers['session-id'] or JSON.parse(response.body).sessionId"
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
              • <strong>Header:</strong> <code>response.headers['x-session-id']</code>
              <br />• <strong>Cookie:</strong>{' '}
              <code>response.headers['set-cookie']?.match(/sessionId=([^;]+)/)?.[1]</code>
              <br />• <strong>JSON body:</strong> <code>JSON.parse(response.body).session.id</code>
              <br />• <strong>JWT token:</strong> <code>JSON.parse(response.body).auth_token</code>
            </Typography>
          </Alert>
        </>
      ) : (
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
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
                {JSON.stringify({ session_id: '{{sessionId}}', message: '{{prompt}}' }, null, 2)}
              </code>
            </Typography>
          </Alert>
        </Box>
      )}

      {/* Session Test Section */}
      <Paper elevation={1} sx={{ p: 3, backgroundColor: 'background.default' }}>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
          Test Session Configuration
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Run a quick test to verify that your session configuration is working correctly. This will
          send two requests: first to establish a session with test data, then a second request to
          verify the session persists.
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
            Please configure the target URL in the endpoint configuration before testing sessions.
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

            <Typography variant="body2" sx={{ mb: testResult.details ? 2 : 0 }}>
              {testResult.message}
            </Typography>

            {testResult.details && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                  <strong>Session ID:</strong> {testResult.details.sessionId}
                </Typography>

                {!testResult.success && (
                  <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
                    <Typography variant="caption">
                      <strong>What to check:</strong>
                      <br />• Verify your session configuration matches your target's requirements
                      <br />• For server sessions: Check the session parser extracts the correct ID
                      <br />• For client sessions: Ensure the {'{{sessionId}}'} variable is in the
                      right place
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

                  <Box sx={{ mt: 1, p: 1, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                    <Typography variant="caption" component="div" sx={{ mb: 2 }}>
                      <strong>Request 1:</strong> "{testResult.details.request1?.prompt}"
                      <br />
                      <strong>Response 1:</strong> {JSON.stringify(testResult.details.response1)}
                    </Typography>

                    <Typography variant="caption" component="div">
                      <strong>Request 2:</strong> "{testResult.details.request2?.prompt}"
                      <br />
                      <strong>Response 2:</strong> {JSON.stringify(testResult.details.response2)}
                      <br />
                      <br />
                      {!testResult.success && (
                        <>
                          <strong style={{ color: 'red' }}>Issue:</strong> The second response shows
                          the target did not remember the name "TestUser" from the first request.
                        </>
                      )}
                    </Typography>
                  </Box>
                </details>
              </Box>
            )}
          </Alert>
        )}
      </Paper>

      <Box>
        <Typography variant="caption" color="textSecondary">
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
