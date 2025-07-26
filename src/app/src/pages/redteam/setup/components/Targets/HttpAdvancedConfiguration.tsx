import React from 'react';

import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import UploadIcon from '@mui/icons-material/Upload';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import type { ProviderOptions } from '@promptfoo/types';
import 'prismjs/components/prism-clike';

// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

import Editor from 'react-simple-code-editor';
import { convertStringKeyToPem, validatePrivateKey } from '../../utils/crypto';

interface HttpAdvancedConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  defaultRequestTransform?: string;
}

const HttpAdvancedConfiguration: React.FC<HttpAdvancedConfigurationProps> = ({
  selectedTarget,
  defaultRequestTransform,
  updateCustomTarget,
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
                value={selectedTarget.config.transformRequest || defaultRequestTransform || ''}
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

        <Accordion defaultExpanded={!!selectedTarget.config.tokenEstimation?.enabled}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="h6">Token Estimation</Typography>
              <Typography variant="body2" color="text.secondary">
                Enable approximate token counting for cost tracking
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Enable word-based token estimation for APIs that don't return token usage information.
              See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/http/#token-estimation"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs
              </a>{' '}
              for more information.
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={!!selectedTarget.config.tokenEstimation?.enabled}
                  onChange={(event) => {
                    if (event.target.checked) {
                      updateCustomTarget('tokenEstimation', {
                        enabled: true,
                        multiplier: selectedTarget.config.tokenEstimation?.multiplier ?? 1.3,
                      });
                    } else {
                      updateCustomTarget('tokenEstimation', { enabled: false });
                    }
                  }}
                />
              }
              label="Enable token estimation"
            />
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
            <Typography variant="body1" sx={{ mb: 3 }}>
              Configure signature-based authentication for secure API calls. Your private key is
              never sent to Promptfoo and will always be stored locally on your system. See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/http/#digital-signature-authentication"
                target="_blank"
              >
                docs
              </a>{' '}
              for more information.
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedTarget.config.signatureAuth?.enabled}
                    onChange={(event) => {
                      if (event.target.checked) {
                        updateCustomTarget('signatureAuth', {
                          enabled: true,
                          certificateType:
                            selectedTarget.config.signatureAuth?.certificateType || 'pem',
                          keyInputType:
                            selectedTarget.config.signatureAuth?.keyInputType || 'upload',
                        });
                      } else {
                        updateCustomTarget('signatureAuth', undefined);
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
                    Certificate Type
                  </Typography>
                  <FormControl fullWidth>
                    <Select
                      value={selectedTarget.config.signatureAuth?.certificateType || 'pem'}
                      onChange={(e) => {
                        const certType = e.target.value;
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config.signatureAuth,
                          certificateType: certType,
                          // Clear all type-specific fields when changing certificate type
                          keyInputType: certType === 'pem' ? 'upload' : undefined,
                          privateKey: undefined,
                          privateKeyPath: undefined,
                          keystorePath: undefined,
                          keystorePassword: undefined,
                          keyAlias: undefined,
                          pfxPath: undefined,
                          pfxPassword: undefined,
                          certPath: undefined,
                          keyPath: undefined,
                          pfxMode: undefined,
                          type: certType,
                        });
                      }}
                      displayEmpty
                    >
                      <MenuItem value="pem">PEM</MenuItem>
                      <MenuItem value="jks">JKS</MenuItem>
                      <MenuItem value="pfx">PFX/PKCS#12</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {selectedTarget.config.signatureAuth?.certificateType === 'pem' && (
                  <Box>
                    <Typography variant="subtitle1" gutterBottom>
                      PEM Key Input Method
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
                )}

                {selectedTarget.config.signatureAuth?.certificateType === 'pem' &&
                  selectedTarget.config.signatureAuth?.keyInputType === 'upload' && (
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
                                  type: 'pem',
                                  privateKey: content,
                                  privateKeyPath: undefined,
                                  keystorePath: undefined,
                                  keystorePassword: undefined,
                                  keyAlias: undefined,
                                  pfxPath: undefined,
                                  pfxPassword: undefined,
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

                {selectedTarget.config.signatureAuth?.certificateType === 'pem' &&
                  selectedTarget.config.signatureAuth?.keyInputType === 'path' && (
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
                            type: 'pem',
                            privateKeyPath: e.target.value,
                            privateKey: undefined,
                            keystorePath: undefined,
                            keystorePassword: undefined,
                            keyAlias: undefined,
                            pfxPath: undefined,
                            pfxPassword: undefined,
                          });
                        }}
                      />
                    </Paper>
                  )}

                {selectedTarget.config.signatureAuth?.certificateType === 'pem' &&
                  selectedTarget.config.signatureAuth?.keyInputType === 'base64' && (
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
                              type: 'pem',
                              privateKey: e.target.value,
                              privateKeyPath: undefined,
                              keystorePath: undefined,
                              keystorePassword: undefined,
                              keyAlias: undefined,
                              pfxPath: undefined,
                              pfxPassword: undefined,
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
                                const formattedKey = await convertStringKeyToPem(inputKey);
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  type: 'pem',
                                  privateKey: formattedKey,
                                  privateKeyPath: undefined,
                                  keystorePath: undefined,
                                  keystorePassword: undefined,
                                  keyAlias: undefined,
                                  pfxPath: undefined,
                                  pfxPassword: undefined,
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

                {selectedTarget.config.signatureAuth?.certificateType === 'jks' && (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={3}>
                      <Typography gutterBottom color="text.secondary">
                        Configure Java KeyStore (JKS) settings for signature authentication
                      </Typography>

                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Keystore File
                        </Typography>
                        <TextField
                          fullWidth
                          placeholder="/path/to/keystore.jks"
                          value={selectedTarget.config.signatureAuth?.keystorePath || ''}
                          onChange={(e) => {
                            updateCustomTarget('signatureAuth', {
                              ...selectedTarget.config.signatureAuth,
                              type: 'jks',
                              keystorePath: e.target.value,
                              privateKey: undefined,
                              privateKeyPath: undefined,
                              pfxPath: undefined,
                              pfxPassword: undefined,
                            });
                          }}
                          label="Keystore Path"
                          helperText="Enter full path to your JKS keystore file"
                        />
                      </Box>

                      <TextField
                        fullWidth
                        type="password"
                        label="Keystore Password"
                        placeholder="Enter keystore password"
                        value={selectedTarget.config.signatureAuth?.keystorePassword || ''}
                        onChange={(e) => {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            keystorePassword: e.target.value,
                          });
                        }}
                        helperText="Password for the JKS keystore. Can also be set via PROMPTFOO_JKS_PASSWORD environment variable."
                      />

                      <TextField
                        fullWidth
                        label="Key Alias"
                        placeholder="client"
                        value={selectedTarget.config.signatureAuth?.keyAlias || ''}
                        onChange={(e) => {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            keyAlias: e.target.value,
                          });
                        }}
                        helperText="Alias of the key to use from the keystore. If not specified, the first available key will be used."
                      />
                    </Stack>
                  </Paper>
                )}

                {selectedTarget.config.signatureAuth?.certificateType === 'pfx' && (
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={3}>
                      <Typography gutterBottom color="text.secondary">
                        Configure PFX (PKCS#12) certificate settings for signature authentication
                      </Typography>

                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Certificate Format
                        </Typography>
                        <RadioGroup
                          value={selectedTarget.config.signatureAuth?.pfxMode || 'pfx'}
                          onChange={(e) => {
                            const mode = e.target.value;
                            updateCustomTarget('signatureAuth', {
                              ...selectedTarget.config.signatureAuth,
                              pfxMode: mode,
                              // Clear fields based on mode
                              ...(mode === 'pfx'
                                ? {
                                    certPath: undefined,
                                    keyPath: undefined,
                                  }
                                : {
                                    pfxPath: undefined,
                                    pfxPassword: undefined,
                                  }),
                            });
                          }}
                          row
                        >
                          <FormControlLabel value="pfx" control={<Radio />} label="PFX/P12 File" />
                          <FormControlLabel
                            value="separate"
                            control={<Radio />}
                            label="Separate CRT/KEY Files"
                          />
                        </RadioGroup>
                      </Box>

                      {(!selectedTarget.config.signatureAuth?.pfxMode ||
                        selectedTarget.config.signatureAuth?.pfxMode === 'pfx') && (
                        <>
                          <Box>
                            <Typography variant="subtitle2" gutterBottom>
                              PFX/P12 Certificate File
                            </Typography>
                            <TextField
                              fullWidth
                              placeholder="/path/to/certificate.pfx"
                              value={selectedTarget.config.signatureAuth?.pfxPath || ''}
                              onChange={(e) => {
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  type: 'pfx',
                                  pfxPath: e.target.value,
                                  privateKey: undefined,
                                  privateKeyPath: undefined,
                                  keystorePath: undefined,
                                  keystorePassword: undefined,
                                  keyAlias: undefined,
                                  certPath: undefined,
                                  keyPath: undefined,
                                });
                              }}
                              label="PFX File Path"
                              helperText="Enter full path to your PFX/P12 certificate file"
                            />
                          </Box>

                          <TextField
                            fullWidth
                            type="password"
                            label="PFX Password"
                            placeholder="Enter PFX password"
                            value={selectedTarget.config.signatureAuth?.pfxPassword || ''}
                            onChange={(e) => {
                              updateCustomTarget('signatureAuth', {
                                ...selectedTarget.config.signatureAuth,
                                pfxPassword: e.target.value,
                              });
                            }}
                            helperText="Password for the PFX certificate file. Can also be set via PROMPTFOO_PFX_PASSWORD environment variable."
                          />
                        </>
                      )}

                      {selectedTarget.config.signatureAuth?.pfxMode === 'separate' && (
                        <>
                          <Box>
                            <Typography variant="subtitle2" gutterBottom>
                              Certificate File (CRT)
                            </Typography>
                            <TextField
                              fullWidth
                              placeholder="/path/to/certificate.crt"
                              value={selectedTarget.config.signatureAuth?.certPath || ''}
                              onChange={(e) => {
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  type: 'pfx',
                                  certPath: e.target.value,
                                  privateKey: undefined,
                                  privateKeyPath: undefined,
                                  keystorePath: undefined,
                                  keystorePassword: undefined,
                                  keyAlias: undefined,
                                  pfxPath: undefined,
                                  pfxPassword: undefined,
                                });
                              }}
                              label="Certificate File Path"
                              helperText="Enter full path to your certificate file"
                            />
                          </Box>

                          <Box>
                            <Typography variant="subtitle2" gutterBottom>
                              Private Key File (KEY)
                            </Typography>
                            <TextField
                              fullWidth
                              placeholder="/path/to/private.key"
                              value={selectedTarget.config.signatureAuth?.keyPath || ''}
                              onChange={(e) => {
                                updateCustomTarget('signatureAuth', {
                                  ...selectedTarget.config.signatureAuth,
                                  keyPath: e.target.value,
                                });
                              }}
                              label="Private Key File Path"
                              helperText="Enter full path to your private key file"
                            />
                          </Box>
                        </>
                      )}
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
      </Box>
    </Box>
  );
};

export default HttpAdvancedConfiguration;
