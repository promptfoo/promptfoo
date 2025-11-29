import React, { useEffect, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type { ProviderOptions } from '../../types';

export interface TestResult {
  success: boolean;
  message: string;
  providerResponse?: any;
  transformedRequest?: string | Record<string, any>;
  changes_needed?: boolean;
  changes_needed_suggestions?: string[];
  configuration_change_suggestion?: Record<string, any>;
}

interface TestSectionProps {
  selectedTarget: ProviderOptions;
  isTestRunning: boolean;
  testResult: TestResult | null;
  handleTestTarget: () => void;
  disabled: boolean;
  onApplyConfigSuggestion?: (field: string, value: any) => void;
}

const TestSection: React.FC<TestSectionProps> = ({
  selectedTarget,
  isTestRunning,
  testResult,
  handleTestTarget,
  disabled,
  onApplyConfigSuggestion,
}) => {
  const responseHeaders = testResult?.providerResponse?.metadata?.http?.headers;
  const [appliedFields, setAppliedFields] = useState<Set<string>>(new Set());

  // Reset applied fields when test result changes (new test run)
  useEffect(() => {
    setAppliedFields(new Set());
  }, [testResult]);

  const handleApplySuggestion = (field: string, value: any) => {
    if (onApplyConfigSuggestion) {
      onApplyConfigSuggestion(field, value);
      setAppliedFields((prev) => new Set(prev).add(field));
    }
  };

  const handleApplyAll = () => {
    if (onApplyConfigSuggestion && testResult?.configuration_change_suggestion) {
      Object.entries(testResult.configuration_change_suggestion).forEach(([field, value]) => {
        onApplyConfigSuggestion(field, value);
      });
      setAppliedFields(new Set(Object.keys(testResult.configuration_change_suggestion)));
    }
  };

  return (
    <Paper elevation={1} sx={{ mt: 3, p: 3, backgroundColor: 'background.default' }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
        Test Target Configuration
      </Typography>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Validate your target configuration by sending a test request to your endpoint. This will
        verify that your authentication, headers, and request transformation settings are working
        correctly.
      </Typography>

      <Button
        variant="contained"
        onClick={handleTestTarget}
        disabled={isTestRunning || disabled}
        startIcon={isTestRunning ? <CircularProgress size={20} /> : <PlayArrowIcon />}
        sx={{ mb: 2 }}
      >
        {isTestRunning ? 'Testing...' : 'Test Target'}
      </Button>

      {!selectedTarget.config.url && !selectedTarget.config.request && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Please configure the target URL or request before testing.
        </Alert>
      )}

      {testResult && (
        <>
          {(testResult.success || testResult.changes_needed) && (
            <Alert
              severity={
                testResult.changes_needed ? 'warning' : testResult.success ? 'success' : 'error'
              }
              icon={
                testResult.changes_needed ? (
                  <ErrorIcon />
                ) : testResult.success ? (
                  <CheckCircleIcon />
                ) : (
                  <ErrorIcon />
                )
              }
              sx={{ mt: 2 }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                {testResult.changes_needed
                  ? 'Configuration Changes Needed'
                  : testResult.success
                    ? 'Test Passed'
                    : 'Test Failed'}
              </Typography>
              <Typography variant="body2">{testResult.message}</Typography>

              {/* Display configuration suggestions if available */}
              {testResult.changes_needed_suggestions &&
                testResult.changes_needed_suggestions.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Suggested Changes:
                    </Typography>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {testResult.changes_needed_suggestions.map(
                        (suggestion: string, index: number) => (
                          <li key={index}>
                            <Typography variant="body2">{suggestion}</Typography>
                          </li>
                        ),
                      )}
                    </ul>
                  </Box>
                )}

              {/* Display configuration change suggestions with apply buttons */}
              {testResult.configuration_change_suggestion &&
                Object.keys(testResult.configuration_change_suggestion).length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Configuration Changes:
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Object.entries(testResult.configuration_change_suggestion).map(
                        ([field, value]) => {
                          const isApplied = appliedFields.has(field);
                          return (
                            <Box
                              key={field}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1,
                                backgroundColor: isApplied
                                  ? 'rgba(76, 175, 80, 0.1)'
                                  : 'rgba(255, 255, 255, 0.5)',
                                borderRadius: 1,
                                gap: 2,
                                border: isApplied ? '1px solid rgba(76, 175, 80, 0.3)' : 'none',
                                transition: 'all 0.3s ease',
                              }}
                            >
                              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                  {field}:
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {typeof value === 'string'
                                    ? value
                                    : JSON.stringify(value, null, 2)}
                                </Typography>
                              </Box>
                              {onApplyConfigSuggestion && (
                                <Button
                                  size="small"
                                  variant={isApplied ? 'outlined' : 'outlined'}
                                  color={isApplied ? 'success' : 'primary'}
                                  onClick={
                                    isApplied
                                      ? handleTestTarget
                                      : () => handleApplySuggestion(field, value)
                                  }
                                  startIcon={isApplied ? <PlayArrowIcon /> : undefined}
                                >
                                  {isApplied ? 'Test' : 'Apply'}
                                </Button>
                              )}
                            </Box>
                          );
                        },
                      )}
                    </Box>
                    {onApplyConfigSuggestion &&
                      testResult.configuration_change_suggestion &&
                      Object.keys(testResult.configuration_change_suggestion).length > 1 && (
                        <Button
                          size="small"
                          variant="contained"
                          color={
                            appliedFields.size ===
                            Object.keys(testResult.configuration_change_suggestion).length
                              ? 'success'
                              : 'primary'
                          }
                          sx={{ mt: 1 }}
                          startIcon={
                            appliedFields.size ===
                            Object.keys(testResult.configuration_change_suggestion).length ? (
                              <PlayArrowIcon />
                            ) : undefined
                          }
                          onClick={() => {
                            if (
                              testResult.configuration_change_suggestion &&
                              appliedFields.size ===
                                Object.keys(testResult.configuration_change_suggestion).length
                            ) {
                              handleTestTarget();
                            } else {
                              handleApplyAll();
                            }
                          }}
                        >
                          {testResult.configuration_change_suggestion &&
                          appliedFields.size ===
                            Object.keys(testResult.configuration_change_suggestion).length
                            ? 'Test'
                            : 'Apply All'}
                        </Button>
                      )}
                  </Box>
                )}
            </Alert>
          )}

          {/* Request and Response Details */}
          <details
            style={{ marginTop: '16px' }}
            open={testResult.changes_needed || testResult.success === false}
          >
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              <Typography variant="caption" component="span">
                View request and response details
              </Typography>
            </summary>

            {/* Request and Response Details Side by Side */}
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                gap: 2,
                flexDirection: { xs: 'column', md: 'row' },
              }}
            >
              {/* Request Details */}
              <Box sx={{ flex: 1 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    borderRadius: 1,
                    height: '100%',
                    overflow: 'auto',
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Request Details
                  </Typography>

                  {/* URL and Method */}
                  {selectedTarget.config.url && (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        URL:
                      </Typography>
                      <Box sx={{ mb: 2 }}>
                        <pre
                          style={{
                            margin: '4px 0',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {selectedTarget.config.url}
                        </pre>
                      </Box>

                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Method:
                      </Typography>
                      <Box sx={{ mb: 2 }}>
                        <pre style={{ margin: '4px 0', fontSize: '12px' }}>
                          {selectedTarget.config.method || 'POST'}
                        </pre>
                      </Box>
                    </>
                  )}

                  {/* Headers */}
                  {selectedTarget.config.headers &&
                    Object.keys(selectedTarget.config.headers).length > 0 && (
                      <>
                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                          Request Headers:
                        </Typography>
                        <Box sx={{ mb: 2, maxHeight: '200px', overflow: 'auto' }}>
                          <pre style={{ margin: '4px 0', fontSize: '12px' }}>
                            {JSON.stringify(selectedTarget.config.headers, null, 2)}
                          </pre>
                        </Box>
                      </>
                    )}

                  {/* Request Body */}
                  {selectedTarget.config.body && !testResult?.transformedRequest && (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Request Body:
                      </Typography>
                      <Box sx={{ mb: 2, maxHeight: '300px', overflow: 'auto' }}>
                        <pre
                          style={{
                            margin: '4px 0',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {typeof selectedTarget.config.body === 'string'
                            ? selectedTarget.config.body
                            : JSON.stringify(selectedTarget.config.body, null, 2)}
                        </pre>
                      </Box>
                    </>
                  )}

                  {/* Raw Request */}
                  {selectedTarget.config.request && (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Raw Request:
                      </Typography>
                      <Box sx={{ mb: 2, maxHeight: '300px', overflow: 'auto' }}>
                        <pre
                          style={{
                            margin: '4px 0',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {selectedTarget.config.request}
                        </pre>
                      </Box>
                    </>
                  )}

                  {/* Transformed Request */}
                  {testResult?.transformedRequest && (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Request Body:
                      </Typography>
                      <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                        <pre
                          style={{
                            margin: '4px 0',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {typeof testResult.transformedRequest === 'string'
                            ? testResult.transformedRequest
                            : JSON.stringify(testResult.transformedRequest, null, 2)}
                        </pre>
                      </Box>
                    </>
                  )}
                </Paper>
              </Box>

              {/* Response Details */}
              <Box sx={{ flex: 1 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    backgroundColor: 'rgba(0,0,0,0.03)',
                    borderRadius: 1,
                    height: '100%',
                    overflow: 'auto',
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Response Details
                  </Typography>

                  {testResult.providerResponse && testResult.providerResponse.raw !== undefined ? (
                    <>
                      {/* Response Headers */}
                      {responseHeaders && Object.keys(responseHeaders).length > 0 && (
                        <>
                          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                            Response Headers:
                          </Typography>
                          <Box sx={{ mb: 2, maxHeight: '200px', overflow: 'auto' }}>
                            <pre
                              style={{
                                margin: '4px 0',
                                fontSize: '12px',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {JSON.stringify(responseHeaders, null, 2)}
                            </pre>
                          </Box>
                        </>
                      )}

                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        Raw Response:
                      </Typography>
                      <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                        <pre
                          style={{
                            margin: '4px 0',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {typeof testResult.providerResponse?.raw === 'string'
                            ? testResult.providerResponse?.raw
                            : JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                        </pre>
                      </Box>

                      {testResult.providerResponse?.sessionId && (
                        <>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 'bold', display: 'block', mt: 2 }}
                          >
                            Session ID:
                          </Typography>
                          <Box sx={{ maxHeight: '100px', overflow: 'auto' }}>
                            <pre style={{ margin: '4px 0', fontSize: '12px' }}>
                              {testResult.providerResponse.sessionId}
                            </pre>
                          </Box>
                        </>
                      )}
                    </>
                  ) : (
                    <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {testResult.providerResponse?.error || 'No response from provider'}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>
            </Box>
            {testResult.providerResponse && testResult.providerResponse.raw !== undefined && (
              <Paper
                elevation={0}
                sx={{
                  mt: 2,
                  p: 2,
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  borderRadius: 1,
                  overflow: 'auto',
                }}
              >
                <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Final Response
                  </Typography>
                  <Tooltip
                    title="This is what promptfoo will use for evaluation. Configure the response parser if this isn't the plain text output from your API."
                    placement="top"
                  >
                    <InfoOutlinedIcon
                      sx={{ fontSize: '1rem', color: 'text.secondary', cursor: 'help' }}
                    />
                  </Tooltip>
                </Box>
                <Box sx={{ maxHeight: '200px', overflow: 'auto' }}>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {typeof testResult.providerResponse?.output === 'string'
                      ? testResult.providerResponse?.output
                      : JSON.stringify(testResult.providerResponse?.output, null, 2) ||
                        'No parsed response'}
                  </pre>
                </Box>
              </Paper>
            )}
          </details>
        </>
      )}
    </Paper>
  );
};

export default TestSection;
