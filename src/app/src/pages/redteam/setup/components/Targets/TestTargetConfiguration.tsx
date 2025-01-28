import React from 'react';
import Editor from 'react-simple-code-editor';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import dedent from 'dedent';
import 'prismjs/components/prism-clike';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';
import type { ProviderOptions } from '../../types';
import 'prismjs/themes/prism.css';

interface TestTargetConfigurationProps {
  testingTarget: boolean;
  hasTestedTarget: boolean;
  handleTestTarget: () => void;
  selectedTarget: ProviderOptions;
  testResult: any;
  requiresTransformResponse: (target: ProviderOptions) => boolean;
  updateCustomTarget: (field: string, value: any) => void;
}

const TestTargetConfiguration: React.FC<TestTargetConfigurationProps> = ({
  testingTarget,
  hasTestedTarget,
  handleTestTarget,
  selectedTarget,
  testResult,
  requiresTransformResponse,
  updateCustomTarget,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const [signatureAuthExpanded, setSignatureAuthExpanded] = React.useState(
    !!selectedTarget.config.signatureAuth,
  );

  const handleSignatureAuthChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setSignatureAuthExpanded(isExpanded);
  };

  return (
    <Box mt={4}>
      {requiresTransformResponse(selectedTarget) && (
        <Box mb={4}>
          <Typography variant="h6" gutterBottom>
            Advanced Configuration
          </Typography>
          <Accordion defaultExpanded={!!selectedTarget.config.transformRequest}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Request Transform</Typography>
                <Typography variant="body2" color="text.secondary">
                  Modify the prompt structure before sending to the API
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Transform the prompt into a specific structure required by your API before sending.
                See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#request-transform"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more information.
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  position: 'relative',
                  backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                }}
              >
                <Editor
                  value={selectedTarget.config.transformRequest || ''}
                  onValueChange={(code) => updateCustomTarget('transformRequest', code)}
                  highlight={(code) => highlight(code, languages.javascript)}
                  padding={10}
                  placeholder={dedent`Optional: A JavaScript expression to transform the prompt before calling the API. Format as:

                      A JSON object with prompt variable: \`{ messages: [{ role: 'user', content: prompt }] }\`
                    `}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '100px',
                  }}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded={!!selectedTarget.config.transformResponse}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Response Transform</Typography>
                <Typography variant="body2" color="text.secondary">
                  Extract the completion from the API response
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Extract specific data from the HTTP response. See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#response-transform"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more information.
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  position: 'relative',
                  backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                }}
              >
                <Editor
                  value={selectedTarget.config.transformResponse || ''}
                  onValueChange={(code) => updateCustomTarget('transformResponse', code)}
                  highlight={(code) => highlight(code, languages.javascript)}
                  padding={10}
                  placeholder={dedent`Optional: A JavaScript expression to parse the response.
                    Simple transform: json.choices[0].message.content

                    With guardrails: { output: json.choices[0].message.content, guardrails: { flagged: context.response.status === 500 } }`}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '100px',
                  }}
                />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded={!!selectedTarget.config.sessionParser}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Sessions</Typography>
                <Typography variant="body2" color="text.secondary">
                  Handle stateful API sessions
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Extract session IDs from HTTP response headers or the body for stateful systems. See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#session-management"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more information.
              </Typography>
              <TextField
                fullWidth
                label="Session"
                value={selectedTarget.config.sessionParser}
                placeholder="Optional: Enter a javascript expression to extract the session Id"
                onChange={(e) => updateCustomTarget('sessionParser', e.target.value)}
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </AccordionDetails>
          </Accordion>

          <Accordion expanded={signatureAuthExpanded} onChange={handleSignatureAuthChange}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Digital Signature Authentication</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sign requests sent to the API
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Configure signature-based authentication for secure API calls. See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#digital-signature-authentication"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more information.
              </Typography>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Switch
                    checked={!!selectedTarget.config.signatureAuth}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateCustomTarget('signatureAuth', {
                          privateKeyPath: '',
                          signatureValidityMs: 300000,
                          signatureDataTemplate: '{{signatureTimestamp}}',
                        });
                      } else {
                        updateCustomTarget('signatureAuth', undefined);
                      }
                    }}
                  />
                  <Typography>Use Signature Authentication</Typography>
                </Stack>

                {selectedTarget.config.signatureAuth && (
                  <>
                    <Stack spacing={4}>
                      <Box>
                        <input
                          type="file"
                          accept=".pem,.key"
                          style={{ display: 'none' }}
                          id="private-key-upload"
                          onClick={(e) => {
                            // Reset value to trigger onChange even if same file selected
                            (e.target as HTMLInputElement).value = '';
                          }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            console.log('Loaded file', file);
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const content = event.target?.result as string;
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  privateKey: content,
                                  privateKeyPath: undefined,
                                });
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                        <label htmlFor="private-key-upload">
                          <Button variant="contained" component="span" startIcon={<VpnKeyIcon />}>
                            Upload Key File
                          </Button>
                        </label>
                        {selectedTarget.config.signatureAuth?.privateKey ? (
                          <>
                            <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                              Key file loaded
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() =>
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  privateKey: undefined,
                                  privateKeyPath: undefined,
                                })
                              }
                              title="Clear private key"
                            >
                              <ClearIcon fontSize="small" />
                            </IconButton>
                          </>
                        ) : (
                          <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                            RSA private key in PEM format (e.g., "-----BEGIN PRIVATE KEY-----")
                          </Typography>
                        )}
                      </Box>
                      <TextField
                        fullWidth
                        label="Signature Data Template"
                        value={
                          selectedTarget.config.signatureAuth?.signatureDataTemplate ||
                          '{{signatureTimestamp}}'
                        }
                        onChange={(e) =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            signatureDataTemplate: e.target.value,
                          })
                        }
                        placeholder="Template for generating signature data"
                        helperText="Supported variables: {{signatureTimestamp}}. Use \n for newlines"
                        InputLabelProps={{
                          shrink: true,
                        }}
                      />
                      <TextField
                        fullWidth
                        label="Signature Validity (ms)"
                        type="number"
                        value={selectedTarget.config.signatureAuth?.signatureValidityMs || '300000'}
                        onChange={(e) =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            signatureValidityMs: Number.parseInt(e.target.value),
                          })
                        }
                        placeholder="How long the signature remains valid"
                        InputLabelProps={{
                          shrink: true,
                        }}
                      />
                      <TextField
                        fullWidth
                        label="Signature Refresh Buffer (ms)"
                        type="number"
                        value={selectedTarget.config.signatureAuth?.signatureRefreshBufferMs}
                        onChange={(e) =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            signatureRefreshBufferMs: Number.parseInt(e.target.value),
                          })
                        }
                        placeholder="Buffer time before signature expiry to refresh - defaults to 10% of signature validity"
                        InputLabelProps={{
                          shrink: true,
                        }}
                      />
                      <TextField
                        fullWidth
                        label="Signature Algorithm"
                        value={selectedTarget.config.signatureAuth?.signatureAlgorithm || 'SHA256'}
                        onChange={(e) =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            signatureAlgorithm: e.target.value,
                          })
                        }
                        placeholder="Signature algorithm (default: SHA256)"
                        InputLabelProps={{
                          shrink: true,
                        }}
                      />
                    </Stack>
                  </>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded={!!selectedTarget.config.validateStatus}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">HTTP Status Code</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure which response codes are considered successful
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Customize which HTTP status codes are treated as successful responses. By default
                accepts 200-299. See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#error-handling"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more details.
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  position: 'relative',
                  backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                }}
              >
                <Editor
                  value={selectedTarget.config.validateStatus || ''}
                  onValueChange={(code) => updateCustomTarget('validateStatus', code)}
                  highlight={(code) => highlight(code, languages.javascript)}
                  padding={10}
                  placeholder={dedent`Customize HTTP status code validation. Examples:

                      () => true                     // Default: accept all responses - javascript function
                      status >= 200 && status < 300  // Accept only 2xx codes - javascript expression
                      (status) => status < 500       // Accept anything but server errors - javascript function`}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '106px',
                  }}
                />
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Test Target Configuration
        </Typography>
        <Button
          variant="contained"
          onClick={handleTestTarget}
          disabled={testingTarget || !selectedTarget.config.url}
          startIcon={testingTarget ? <CircularProgress size={20} /> : null}
          color="primary"
        >
          {testingTarget ? 'Testing...' : 'Test Target'}
        </Button>
      </Stack>

      {!selectedTarget.config.url && !selectedTarget.config.request && (
        <Alert severity="info">
          Please configure the HTTP endpoint above and click "Test Target" to proceed.
        </Alert>
      )}
      {selectedTarget.config.request && (
        <Alert severity="info">
          Automated target testing is not available in raw request mode.
        </Alert>
      )}

      {testResult && (
        <Box mt={2}>
          {testResult.success != null && (
            <Alert severity={testResult.success ? 'success' : 'error'}>{testResult.message}</Alert>
          )}
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
                    <ListItem key={index}>
                      <ListItemIcon>
                        <InfoIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText primary={suggestion} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Box>
          )}
          <Accordion sx={{ mt: 2 }} expanded>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="provider-response-content"
              id="provider-response-header"
            >
              <Typography>Provider Response Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="subtitle2" gutterBottom>
                Headers:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                  mb: 2,
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Header</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(testResult.providerResponse?.metadata?.headers || {}).map(
                      ([key, value]) => (
                        <TableRow key={key}>
                          <TableCell>{key}</TableCell>
                          <TableCell
                            sx={{
                              wordBreak: 'break-all',
                            }}
                          >
                            {value as string}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </Paper>
              <Typography variant="subtitle2" gutterBottom>
                Raw Result:
              </Typography>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {typeof testResult.providerResponse?.raw === 'string'
                    ? testResult.providerResponse?.raw
                    : JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Parsed Result:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {typeof testResult.providerResponse?.output === 'string'
                    ? testResult.providerResponse?.output
                    : JSON.stringify(testResult.providerResponse?.output, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Session ID:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {testResult.providerResponse?.sessionId}
                </pre>
              </Paper>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
};

export default TestTargetConfiguration;
