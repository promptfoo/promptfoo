import React from 'react';
import Editor from 'react-simple-code-editor';
import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import UploadIcon from '@mui/icons-material/Upload';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { FormControl, FormControlLabel, RadioGroup, Radio } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormGroup from '@mui/material/FormGroup';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import dedent from 'dedent';
import 'prismjs/components/prism-clike';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';
import type { ProviderOptions } from '../../types';
import { convertStringKeyToPem, validatePrivateKey } from '../../utils/crypto';
import ProviderResponse from './ProviderResponse';
import 'prismjs/themes/prism.css';

// adjust the import path as needed

interface TestTargetConfigurationProps {
  testingTarget: boolean;
  handleTestTarget: () => void;
  selectedTarget: ProviderOptions;
  testResult: any;
  requiresTransformResponse: (target: ProviderOptions) => boolean;
  updateCustomTarget: (field: string, value: any) => void;
  hasTestedTarget: boolean;
  defaultRequestTransform?: string;
}

const TestTargetConfiguration: React.FC<TestTargetConfigurationProps> = ({
  testingTarget,
  handleTestTarget,
  selectedTarget,
  testResult,
  requiresTransformResponse,
  updateCustomTarget,
  defaultRequestTransform,
}) => {
  const theme = useTheme();
  const { showToast } = useToast();
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
                  placeholder={dedent`Optional: Transform the API response before using it. Format as either:

                      1. A JavaScript object path: \`json.choices[0].message.content\`
                      2. A function that receives response data: \`(json, text) => json.choices[0].message.content || text\`

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

              <Stack spacing={2}>
                <FormControl>
                  <RadioGroup
                    value={selectedTarget.config.sessionSource || 'server'}
                    onChange={(e) => {
                      updateCustomTarget('sessionSource', e.target.value);
                      if (e.target.value === 'client') {
                        updateCustomTarget('sessionParser', undefined);
                      }
                    }}
                  >
                    <FormControlLabel
                      value="server"
                      control={<Radio />}
                      label="Server-generated Session ID"
                    />
                    <FormControlLabel
                      value="client"
                      control={<Radio />}
                      label="Client-generated Session ID"
                    />
                  </RadioGroup>
                </FormControl>

                {selectedTarget.config.sessionSource === 'server' ||
                selectedTarget.config.sessionSource == null ? (
                  <TextField
                    fullWidth
                    label="Session Parser"
                    value={selectedTarget.config.sessionParser}
                    placeholder="Optional: Enter a Javascript expression to extract the session ID"
                    onChange={(e) => updateCustomTarget('sessionParser', e.target.value)}
                    margin="normal"
                    InputLabelProps={{
                      shrink: true,
                    }}
                  />
                ) : (
                  <Alert severity="info">
                    A UUID will be created for each conversation and stored in the `sessionId`
                    variable. Add {'{{'}sessionId{'}}'} in the header or body of the request above.
                  </Alert>
                )}
              </Stack>
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
              <Typography gutterBottom color="info">
                <strong>
                  Your private key is never sent to PromptFoo and will always be stored locally on
                  your system.
                </strong>{' '}
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!selectedTarget.config.signatureAuth?.enabled}
                      onChange={(event) => {
                        if (event.target.checked) {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            enabled: true,
                            keyInputType:
                              selectedTarget.config.signatureAuth?.keyInputType || 'upload',
                          });
                        } else {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            enabled: false,
                          });
                        }
                      }}
                    />
                  }
                  label="Enable signature authentication"
                />
              </FormGroup>
              {selectedTarget.config.signatureAuth?.enabled && (
                <Stack spacing={4}>
                  <Box>
                    <Typography variant="subtitle1" gutterBottom>
                      Key Input Method
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          bgcolor:
                            selectedTarget.config.signatureAuth?.keyInputType === 'upload'
                              ? 'action.selected'
                              : 'background.paper',
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                        onClick={() =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            keyInputType: 'upload',
                          })
                        }
                      >
                        <UploadIcon
                          color={
                            selectedTarget.config.signatureAuth?.keyInputType === 'upload'
                              ? 'primary'
                              : 'action'
                          }
                          sx={{ mb: 1 }}
                        />
                        <Typography variant="body1" gutterBottom>
                          Upload Key
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Upload PEM file
                        </Typography>
                      </Paper>

                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          bgcolor:
                            selectedTarget.config.signatureAuth?.keyInputType === 'path'
                              ? 'action.selected'
                              : 'background.paper',
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                        onClick={() =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            keyInputType: 'path',
                          })
                        }
                      >
                        <InsertDriveFileIcon
                          color={
                            selectedTarget.config.signatureAuth?.keyInputType === 'path'
                              ? 'primary'
                              : 'action'
                          }
                          sx={{ mb: 1 }}
                        />
                        <Typography variant="body1" gutterBottom>
                          File Path
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Specify key location
                        </Typography>
                      </Paper>

                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          bgcolor:
                            selectedTarget.config.signatureAuth?.keyInputType === 'base64'
                              ? 'action.selected'
                              : 'background.paper',
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                        onClick={() =>
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            keyInputType: 'base64',
                          })
                        }
                      >
                        <KeyIcon
                          color={
                            selectedTarget.config.signatureAuth?.keyInputType === 'base64'
                              ? 'primary'
                              : 'action'
                          }
                          sx={{ mb: 1 }}
                        />
                        <Typography variant="body1" gutterBottom>
                          Base64 Key String
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Paste encoded key
                        </Typography>
                      </Paper>
                    </Box>
                  </Box>

                  {selectedTarget.config.signatureAuth?.keyInputType === 'upload' && (
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <input
                        type="file"
                        accept=".pem,.key"
                        style={{ display: 'none' }}
                        id="private-key-upload"
                        onClick={(e) => {
                          (e.target as HTMLInputElement).value = '';
                        }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              try {
                                const content = event.target?.result as string;
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  privateKey: content,
                                  privateKeyPath: undefined,
                                });
                                await validatePrivateKey(content);
                                showToast('Private key validated successfully', 'success');
                              } catch (error) {
                                console.warn(
                                  'Key was loaded but could not be successfully validated:',
                                  error,
                                );
                                showToast(
                                  `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
                                  'warning',
                                );
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                      <Box sx={{ textAlign: 'center' }}>
                        {selectedTarget.config.signatureAuth?.privateKey ? (
                          <>
                            <Typography color="success.main" gutterBottom>
                              Key file loaded successfully
                            </Typography>
                            <Button
                              variant="outlined"
                              color="error"
                              startIcon={<ClearIcon />}
                              onClick={() =>
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  privateKey: undefined,
                                  privateKeyPath: undefined,
                                })
                              }
                            >
                              Remove Key
                            </Button>
                          </>
                        ) : (
                          <>
                            <Typography gutterBottom color="text.secondary">
                              Upload your PEM format private key
                            </Typography>
                            <label htmlFor="private-key-upload">
                              <Button
                                variant="outlined"
                                component="span"
                                startIcon={<VpnKeyIcon />}
                              >
                                Choose File
                              </Button>
                            </label>
                          </>
                        )}
                      </Box>
                    </Paper>
                  )}

                  {selectedTarget.config.signatureAuth?.keyInputType === 'path' && (
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <Typography gutterBottom color="text.secondary">
                        Specify the path on disk to your PEM format private key file
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="/path/to/private_key.pem"
                        value={selectedTarget.config.signatureAuth?.privateKeyPath || ''}
                        onChange={(e) => {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            privateKeyPath: e.target.value,
                            privateKey: undefined,
                          });
                        }}
                      />
                    </Paper>
                  )}

                  {selectedTarget.config.signatureAuth?.keyInputType === 'base64' && (
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          placeholder="-----BEGIN PRIVATE KEY-----&#10;Base64 encoded key content in PEM format&#10;-----END PRIVATE KEY-----"
                          value={selectedTarget.config.signatureAuth?.privateKey || ''}
                          onChange={(e) => {
                            updateCustomTarget('signatureAuth', {
                              ...selectedTarget.config.signatureAuth,
                              privateKey: e.target.value,
                              privateKeyPath: undefined,
                            });
                          }}
                        />
                        <Box sx={{ textAlign: 'center' }}>
                          <Button
                            variant="outlined"
                            startIcon={<CheckCircleIcon />}
                            onClick={async () => {
                              try {
                                const inputKey =
                                  selectedTarget.config.signatureAuth?.privateKey || '';
                                const formattedKey = convertStringKeyToPem(inputKey);
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  privateKey: formattedKey,
                                  privateKeyPath: undefined,
                                });
                                await validatePrivateKey(formattedKey);
                                showToast('Private key validated successfully', 'success');
                              } catch (error) {
                                console.warn(
                                  'Key was loaded but could not be successfully validated:',
                                  error,
                                );
                                showToast(
                                  `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
                                  'warning',
                                );
                              }
                            }}
                          >
                            Format & Validate
                          </Button>
                        </Box>
                      </Stack>
                    </Paper>
                  )}

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
              )}
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

                      () => true                     // Default: accept all responses - Javascript function
                      status >= 200 && status < 300  // Accept only 2xx codes - Javascript expression
                      (status) => status < 500       // Accept anything but server errors - Javascript function`}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    minHeight: '106px',
                  }}
                />
              </Box>
            </AccordionDetails>
          </Accordion>
          <Accordion defaultExpanded={!!selectedTarget.delay}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box>
                <Typography variant="h6">Delay</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure the delay between requests
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Add a delay (ms) between requests to simulate a real user. See{' '}
                <a href="https://www.promptfoo.dev/docs/providers/http/#delay" target="_blank">
                  docs
                </a>{' '}
                for more details.
              </Typography>
              <Box>
                <TextField
                  value={selectedTarget.delay || ''}
                  onChange={(e) => updateCustomTarget('delay', Number(e.target.value))}
                />
                <br />
                <Typography variant="caption">Delay in milliseconds (default: 0)</Typography>
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
          disabled={
            testingTarget ||
            (!selectedTarget.config.url && !selectedTarget.config.request) ||
            (selectedTarget.config.signatureAuth?.enabled &&
              !selectedTarget.config.signatureAuth.privateKey &&
              !selectedTarget.config.signatureAuth.privateKeyPath)
          }
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
            </>
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
                      <pre> - {testResult.unalignedProviderResult.outputs.join('\n - ')}</pre>
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
