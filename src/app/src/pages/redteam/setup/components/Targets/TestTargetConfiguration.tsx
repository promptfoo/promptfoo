import React from 'react';

import { callApi } from '@app/utils/api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ProviderResponse from './ProviderResponse';
import type { ProviderOptions } from '@promptfoo/types';

interface TestTargetConfigurationProps {
  testingTarget?: boolean;
  handleTestTarget?: () => void;
  selectedTarget: ProviderOptions;
  testResult?: any;
  onTestComplete?: (success: boolean) => void;
}

const TestTargetConfiguration = ({
  testingTarget: testingTargetProp,
  handleTestTarget: handleTestTargetProp,
  selectedTarget,
  testResult: testResultProp,
  onTestComplete,
}: TestTargetConfigurationProps) => {
  const theme = useTheme();

  // Use internal state if props aren't provided
  const [internalTestingTarget, setInternalTestingTarget] = React.useState(false);
  const [internalTestResult, setInternalTestResult] = React.useState<any>(null);
  const [accordionExpanded, setAccordionExpanded] = React.useState(true);
  const [requestDetailsExpanded, setRequestDetailsExpanded] = React.useState(false);

  const testingTarget = testingTargetProp ?? internalTestingTarget;
  const testResult = testResultProp ?? internalTestResult;

  const handleTestTarget =
    handleTestTargetProp ||
    (async () => {
      // Make actual API call to test the provider configuration
      setInternalTestingTarget(true);
      setInternalTestResult(null);

      try {
        const response = await callApi('/providers/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedTarget),
        });

        if (response.ok) {
          const data = await response.json();
          const isSuccess = data.testResult?.success ?? true;
          setInternalTestResult({
            success: isSuccess,
            message: data.testResult?.message ?? 'Target configuration is valid!',
            providerResponse: data.providerResponse || {},
            redteamProviderResult: data.redteamProviderResult,
            unalignedProviderResult: data.unalignedProviderResult,
            suggestions: data.testResult?.suggestions,
            transformedRequest: data.transformedRequest,
          });

          // Call the callback when test completes
          if (onTestComplete) {
            onTestComplete(isSuccess);
          }
        } else {
          const errorData = await response.json();
          setInternalTestResult({
            success: false,
            message: errorData.error || 'Failed to test target configuration',
            providerResponse: errorData.providerResponse || {},
            transformedRequest: errorData.transformedRequest,
          });

          // Call the callback with failure
          if (onTestComplete) {
            onTestComplete(false);
          }
        }
      } catch (error) {
        console.error('Error testing target:', error);
        setInternalTestResult({
          success: false,
          message: error instanceof Error ? error.message : 'Failed to test target configuration',
          providerResponse: {},
        });

        // Call the callback with failure
        if (onTestComplete) {
          onTestComplete(false);
        }
      } finally {
        setInternalTestingTarget(false);
      }
    });

  const getTestButtonTooltip = () => {
    if (testingTarget) {
      return 'Test is currently in progress';
    }
    if (!selectedTarget.config.url && !selectedTarget.config.request) {
      return 'Please configure either URL or request settings above';
    }
    return '';
  };

  const isButtonDisabled =
    testingTarget || (!selectedTarget.config.url && !selectedTarget.config.request);
  const tooltipText = getTestButtonTooltip();

  return (
    <Box mt={4}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Test Target Configuration
      </Typography>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Validate your target configuration by sending a test request to your endpoint. This will
        verify that your authentication, headers, and request transformation settings are working
        correctly before running the full evaluation.
      </Typography>

      <Box mb={2}>
        <Tooltip title={tooltipText} arrow placement="top">
          <Box component="span" sx={{ display: 'inline-block', width: '100%', maxWidth: '400px' }}>
            <Button
              variant="contained"
              onClick={handleTestTarget}
              disabled={isButtonDisabled}
              startIcon={testingTarget ? <CircularProgress size={20} /> : null}
              color="primary"
              fullWidth
              size="large"
            >
              {testingTarget ? 'Testing...' : 'Test Target'}
            </Button>
          </Box>
        </Tooltip>
      </Box>

      {!selectedTarget.config.url && !selectedTarget.config.request && (
        <Alert severity="info">
          Please configure the HTTP endpoint above and click "Test Target" to proceed.
        </Alert>
      )}

      {testResult && (
        <Box mt={2}>
          {!testResult.unalignedProviderResult && testResult.success != null && (
            <>
              <Alert
                severity={
                  testResult.success &&
                  // If it's a redteam test make sure the openAI formmated prompt doesn't include any JSON and it exists
                  (!testResult.redteamProviderResult ||
                    (testResult.redteamProviderResult.output.length > 5 &&
                      !testResult.redteamProviderResult.output.includes('{')))
                    ? 'success'
                    : 'error'
                }
              >
                {testResult.message}
              </Alert>

              {testResult.suggestions && (
                <Box mt={2}>
                  <Typography variant="subtitle1" gutterBottom>
                    Suggestions:
                  </Typography>
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                    }}
                  >
                    <List>
                      {testResult.suggestions.map((suggestion: string, index: number) => (
                        <ListItem
                          sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}
                          key={index}
                        >
                          <InfoIcon sx={{ mt: 0.5 }} color="primary" />
                          <ListItemText sx={{ margin: 0 }} primary={suggestion} />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Box>
              )}
            </>
          )}

          {/* Request Details Accordion */}
          {(selectedTarget.config.url || selectedTarget.config.request) && (
            <Accordion
              sx={{
                mt: 2,
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                overflow: 'hidden',
                '& .MuiAccordionDetails-root': {
                  overflowX: 'hidden',
                  wordBreak: 'break-all',
                },
              }}
              expanded={requestDetailsExpanded}
              onChange={(_, isExpanded) => setRequestDetailsExpanded(isExpanded)}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls="request-details-content"
                id="request-details-header"
              >
                <Typography>Request Details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box>
                  {/* URL and Method */}
                  {selectedTarget.config.url && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        URL:
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          mb: 2,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {selectedTarget.config.url}
                        </pre>
                      </Paper>

                      <Typography variant="subtitle2" gutterBottom>
                        Method:
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          mb: 2,
                        }}
                      >
                        <pre style={{ margin: 0 }}>{selectedTarget.config.method || 'POST'}</pre>
                      </Paper>
                    </>
                  )}

                  {/* Headers */}
                  {selectedTarget.config.headers &&
                    Object.keys(selectedTarget.config.headers).length > 0 && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          Request Headers:
                        </Typography>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                            maxHeight: '200px',
                            overflow: 'auto',
                            mb: 2,
                          }}
                        >
                          <Table
                            size="small"
                            sx={{ tableLayout: 'fixed', width: '100%', minWidth: 0 }}
                          >
                            <TableHead>
                              <TableRow>
                                <TableCell
                                  sx={{
                                    width: '30%',
                                    minWidth: 0,
                                    backgroundColor:
                                      theme.palette.mode === 'dark' ? 'grey.700' : 'grey.200',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  Header
                                </TableCell>
                                <TableCell
                                  sx={{
                                    width: '70%',
                                    minWidth: 0,
                                    backgroundColor:
                                      theme.palette.mode === 'dark' ? 'grey.700' : 'grey.200',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  Value
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(selectedTarget.config.headers).map(([key, value]) => (
                                <TableRow key={key}>
                                  <TableCell sx={{ wordBreak: 'break-word' }}>{key}</TableCell>
                                  <TableCell
                                    sx={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                                  >
                                    {String(value)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Paper>
                      </>
                    )}

                  {/* Request Body */}
                  {selectedTarget.config.body && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        Request Body:
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          maxHeight: '300px',
                          overflow: 'auto',
                          mb: 2,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {typeof selectedTarget.config.body === 'string'
                            ? selectedTarget.config.body
                            : JSON.stringify(selectedTarget.config.body, null, 2)}
                        </pre>
                      </Paper>
                    </>
                  )}

                  {/* Custom Request Function */}
                  {selectedTarget.config.request && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        Custom Request Function:
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          maxHeight: '300px',
                          overflow: 'auto',
                          mb: 2,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {selectedTarget.config.request}
                        </pre>
                      </Paper>
                    </>
                  )}

                  {/* Transformed Prompt - show actual transformed prompt if available */}
                  {testResult?.transformedRequest && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        Transformed Prompt:
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          maxHeight: '200px',
                          overflow: 'auto',
                          mb: 2,
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {typeof testResult.transformedRequest === 'string'
                            ? testResult.transformedRequest
                            : JSON.stringify(testResult.transformedRequest, null, 2)}
                        </pre>
                      </Paper>
                    </>
                  )}

                  {/* Final Request Body - show the actual body sent to the server */}
                  {testResult?.providerResponse?.metadata?.finalRequestBody && (
                    <>
                      <Typography variant="subtitle2" gutterBottom>
                        Final Request Body (sent to server):
                      </Typography>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2,
                          bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                          maxHeight: '300px',
                          overflow: 'auto',
                        }}
                      >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {typeof testResult.providerResponse.metadata.finalRequestBody === 'string'
                            ? testResult.providerResponse.metadata.finalRequestBody
                            : JSON.stringify(
                                testResult.providerResponse.metadata.finalRequestBody,
                                null,
                                2,
                              )}
                        </pre>
                      </Paper>
                    </>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Provider Response Accordion */}
          <Accordion
            sx={{
              mt: 2,
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              overflow: 'hidden',
              '& .MuiAccordionDetails-root': {
                overflowX: 'hidden',
                wordBreak: 'break-all',
              },
            }}
            expanded={accordionExpanded}
            onChange={(_, isExpanded) => setAccordionExpanded(isExpanded)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="provider-response-content"
              id="provider-response-header"
            >
              <Typography>Provider Response Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {/* If It's a unaligned test show the harmful outputs */}
              {testResult.unalignedProviderResult && (
                <>
                  <Box>
                    {testResult.unalignedProviderResult.outputs.length > 0 ? (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        The provider appears to be working properly. Review the harmful outputs
                        below. If you have at least one result, it is working as intended. This
                        should have a harmful intent.
                      </Alert>
                    ) : (
                      <Alert severity="error">
                        We weren't able to get any harmful outputs from the provider. Please review
                        the raw request and response below.
                      </Alert>
                    )}

                    <Typography variant="h6" gutterBottom>
                      Harmful Outputs:
                    </Typography>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        bgcolor: (theme) =>
                          theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                        maxHeight: '200px',
                        overflow: 'auto',
                        mb: 2,
                      }}
                    >
                      <pre>{' - ' + testResult.unalignedProviderResult.outputs.join('\n - ')}</pre>
                    </Paper>
                  </Box>
                  <Typography variant="h6" sx={{ mt: 10 }} gutterBottom>
                    When testing harmful outputs, we also do a raw request to the provider to help
                    troubleshooting. If there are any issues, you can review the raw request and
                    response below:
                  </Typography>
                </>
              )}
              {/* If It's a redteam test show a header since we have two prompts */}
              {testResult.redteamProviderResult && (
                <Typography variant="h6" gutterBottom>
                  Simple String Prompt "hello world"
                </Typography>
              )}
              {/* If It's a redteam test show the second test */}
              <ProviderResponse providerResponse={testResult.providerResponse} />
              {testResult.redteamProviderResult && (
                <>
                  <Typography variant="h6" sx={{ mt: 4 }} gutterBottom>
                    OpenAI Formatted Prompt
                  </Typography>
                  <ProviderResponse providerResponse={testResult.redteamProviderResult} />
                </>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
};

export default TestTargetConfiguration;
