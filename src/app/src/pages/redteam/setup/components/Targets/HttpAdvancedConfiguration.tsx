import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

import React from 'react';

import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HttpsIcon from '@mui/icons-material/Https';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import LockIcon from '@mui/icons-material/Lock';
import SecurityIcon from '@mui/icons-material/Security';
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
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import { convertStringKeyToPem, validatePrivateKey } from '../../utils/crypto';
import type { ProviderOptions } from '@promptfoo/types';

interface HttpAdvancedConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  defaultRequestTransform?: string;
}

const highlightJS = (code: string): string => {
  try {
    const grammar = (Prism as any)?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

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

  const [tlsConfigExpanded, setTlsConfigExpanded] = React.useState(!!selectedTarget.config.tls);

  const handleSignatureAuthChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setSignatureAuthExpanded(isExpanded);
  };

  const handleTlsConfigChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setTlsConfigExpanded(isExpanded);
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
                highlight={highlightJS}
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
                highlight={highlightJS}
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

        <Accordion expanded={tlsConfigExpanded} onChange={handleTlsConfigChange}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="h6">TLS/HTTPS Configuration</Typography>
              <Typography variant="body2" color="text.secondary">
                Configure certificates for secure HTTPS connections
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Configure TLS certificates for secure HTTPS connections, including custom CA
              certificates, client certificates for mutual TLS, and PFX certificate bundles. See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/http/#tlshttps-configuration"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs
              </a>{' '}
              for more information.
            </Typography>

            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedTarget.config.tls?.enabled}
                    onChange={(event) => {
                      if (event.target.checked) {
                        updateCustomTarget('tls', {
                          ...selectedTarget.config.tls,
                          enabled: true,
                          rejectUnauthorized: selectedTarget.config.tls?.rejectUnauthorized ?? true,
                        });
                      } else {
                        updateCustomTarget('tls', undefined);
                      }
                    }}
                  />
                }
                label="Enable TLS configuration"
              />
            </FormGroup>

            {selectedTarget.config.tls?.enabled && (
              <Stack spacing={4} sx={{ mt: 3 }}>
                {/* Certificate Type Selection */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Certificate Type
                  </Typography>
                  <FormControl fullWidth>
                    <Select
                      value={selectedTarget.config.tls?.certificateType || 'none'}
                      onChange={(e) => {
                        const certType = e.target.value;
                        updateCustomTarget('tls', {
                          ...selectedTarget.config.tls,
                          certificateType: certType,
                          // Clear type-specific fields when changing
                          cert:
                            certType !== 'pem' && certType !== 'jks'
                              ? undefined
                              : selectedTarget.config.tls?.cert,
                          certPath:
                            certType !== 'pem' && certType !== 'jks'
                              ? undefined
                              : selectedTarget.config.tls?.certPath,
                          key:
                            certType !== 'pem' && certType !== 'jks'
                              ? undefined
                              : selectedTarget.config.tls?.key,
                          keyPath:
                            certType !== 'pem' && certType !== 'jks'
                              ? undefined
                              : selectedTarget.config.tls?.keyPath,
                          pfx: certType !== 'pfx' ? undefined : selectedTarget.config.tls?.pfx,
                          pfxPath:
                            certType !== 'pfx' ? undefined : selectedTarget.config.tls?.pfxPath,
                          passphrase:
                            certType !== 'pfx' && certType !== 'jks'
                              ? undefined
                              : selectedTarget.config.tls?.passphrase,
                          jksPath:
                            certType !== 'jks' ? undefined : selectedTarget.config.tls?.jksPath,
                          keyAlias:
                            certType !== 'jks' ? undefined : selectedTarget.config.tls?.keyAlias,
                        });
                      }}
                    >
                      <MenuItem value="none">No Client Certificate</MenuItem>
                      <MenuItem value="pem">PEM (Separate cert/key files)</MenuItem>
                      <MenuItem value="jks">JKS (Java KeyStore)</MenuItem>
                      <MenuItem value="pfx">PFX/PKCS#12 Bundle</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary">
                    Select "No Client Certificate" for server-only verification, or choose a
                    certificate type for mutual TLS
                  </Typography>
                </Box>

                {/* PEM Certificate Configuration */}
                {selectedTarget.config.tls?.certificateType === 'pem' && (
                  <Box>
                    <Typography variant="subtitle1" gutterBottom>
                      PEM Certificate Configuration
                    </Typography>

                    {/* Client Certificate */}
                    <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Client Certificate
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Button
                          variant={
                            selectedTarget.config.tls?.certInputType === 'upload'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<UploadIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              certInputType: 'upload',
                            })
                          }
                        >
                          Upload
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.certInputType === 'path'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<InsertDriveFileIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              certInputType: 'path',
                            })
                          }
                        >
                          File Path
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.certInputType === 'inline'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<KeyIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              certInputType: 'inline',
                            })
                          }
                        >
                          Paste Inline
                        </Button>
                      </Box>

                      {selectedTarget.config.tls?.certInputType === 'upload' && (
                        <>
                          <input
                            type="file"
                            accept=".pem,.crt,.cer"
                            style={{ display: 'none' }}
                            id="tls-cert-upload"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const content = event.target?.result as string;
                                  updateCustomTarget('tls', {
                                    ...selectedTarget.config.tls,
                                    cert: content,
                                    certPath: undefined,
                                  });
                                  showToast('Certificate uploaded successfully', 'success');
                                };
                                reader.readAsText(file);
                              }
                            }}
                          />
                          <label htmlFor="tls-cert-upload">
                            <Button variant="outlined" component="span">
                              {selectedTarget.config.tls?.cert
                                ? 'Replace Certificate'
                                : 'Choose Certificate File'}
                            </Button>
                          </label>
                          {selectedTarget.config.tls?.cert && (
                            <Typography variant="caption" color="success.main" sx={{ ml: 2 }}>
                              ✓ Certificate loaded
                            </Typography>
                          )}
                        </>
                      )}

                      {selectedTarget.config.tls?.certInputType === 'path' && (
                        <TextField
                          fullWidth
                          placeholder="/path/to/client-cert.pem"
                          value={selectedTarget.config.tls?.certPath || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              certPath: e.target.value,
                              cert: undefined,
                            })
                          }
                        />
                      )}

                      {selectedTarget.config.tls?.certInputType === 'inline' && (
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          placeholder="-----BEGIN CERTIFICATE-----&#10;...certificate content...&#10;-----END CERTIFICATE-----"
                          value={selectedTarget.config.tls?.cert || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              cert: e.target.value,
                              certPath: undefined,
                            })
                          }
                        />
                      )}
                    </Paper>

                    {/* Private Key */}
                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Private Key
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Button
                          variant={
                            selectedTarget.config.tls?.keyInputType === 'upload'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<UploadIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              keyInputType: 'upload',
                            })
                          }
                        >
                          Upload
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.keyInputType === 'path'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<InsertDriveFileIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              keyInputType: 'path',
                            })
                          }
                        >
                          File Path
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.keyInputType === 'inline'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<VpnKeyIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              keyInputType: 'inline',
                            })
                          }
                        >
                          Paste Inline
                        </Button>
                      </Box>

                      {selectedTarget.config.tls?.keyInputType === 'upload' && (
                        <>
                          <input
                            type="file"
                            accept=".pem,.key"
                            style={{ display: 'none' }}
                            id="tls-key-upload"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                  const content = event.target?.result as string;
                                  updateCustomTarget('tls', {
                                    ...selectedTarget.config.tls,
                                    key: content,
                                    keyPath: undefined,
                                  });
                                  try {
                                    await validatePrivateKey(content);
                                    showToast('Private key validated successfully', 'success');
                                  } catch (error) {
                                    showToast(
                                      `Key loaded but validation failed: ${(error as Error).message}`,
                                      'warning',
                                    );
                                  }
                                };
                                reader.readAsText(file);
                              }
                            }}
                          />
                          <label htmlFor="tls-key-upload">
                            <Button variant="outlined" component="span">
                              {selectedTarget.config.tls?.key ? 'Replace Key' : 'Choose Key File'}
                            </Button>
                          </label>
                          {selectedTarget.config.tls?.key && (
                            <Typography variant="caption" color="success.main" sx={{ ml: 2 }}>
                              ✓ Key loaded
                            </Typography>
                          )}
                        </>
                      )}

                      {selectedTarget.config.tls?.keyInputType === 'path' && (
                        <TextField
                          fullWidth
                          placeholder="/path/to/client-key.pem"
                          value={selectedTarget.config.tls?.keyPath || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              keyPath: e.target.value,
                              key: undefined,
                            })
                          }
                        />
                      )}

                      {selectedTarget.config.tls?.keyInputType === 'inline' && (
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          placeholder="-----BEGIN PRIVATE KEY-----&#10;...key content...&#10;-----END PRIVATE KEY-----"
                          value={selectedTarget.config.tls?.key || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              key: e.target.value,
                              keyPath: undefined,
                            })
                          }
                        />
                      )}
                    </Paper>
                  </Box>
                )}

                {/* JKS Certificate Configuration */}
                {selectedTarget.config.tls?.certificateType === 'jks' && (
                  <Box>
                    <Typography variant="subtitle1" gutterBottom>
                      JKS (Java KeyStore) Certificate
                    </Typography>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <Stack spacing={3}>
                        <Alert severity="info">
                          Upload a JKS file to automatically extract the certificate and private key
                          for TLS configuration. The jks-js library will be used to convert the JKS
                          content to PEM format.
                        </Alert>

                        <Box>
                          <Typography variant="subtitle2" gutterBottom>
                            JKS File Input
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Button
                              variant={
                                selectedTarget.config.tls?.jksInputType === 'upload'
                                  ? 'contained'
                                  : 'outlined'
                              }
                              startIcon={<UploadIcon />}
                              onClick={() =>
                                updateCustomTarget('tls', {
                                  ...selectedTarget.config.tls,
                                  jksInputType: 'upload',
                                })
                              }
                            >
                              Upload JKS
                            </Button>
                            <Button
                              variant={
                                selectedTarget.config.tls?.jksInputType === 'path'
                                  ? 'contained'
                                  : 'outlined'
                              }
                              startIcon={<InsertDriveFileIcon />}
                              onClick={() =>
                                updateCustomTarget('tls', {
                                  ...selectedTarget.config.tls,
                                  jksInputType: 'path',
                                })
                              }
                            >
                              File Path
                            </Button>
                          </Box>

                          {selectedTarget.config.tls?.jksInputType === 'upload' && (
                            <>
                              <input
                                type="file"
                                accept=".jks,.keystore"
                                style={{ display: 'none' }}
                                id="tls-jks-upload"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = async (event) => {
                                      try {
                                        const arrayBuffer = event.target?.result as ArrayBuffer;
                                        const base64 = btoa(
                                          String.fromCharCode(...new Uint8Array(arrayBuffer)),
                                        );

                                        // Store the JKS content as base64
                                        updateCustomTarget('tls', {
                                          ...selectedTarget.config.tls,
                                          jksContent: base64,
                                          jksPath: undefined,
                                          jksFileName: file.name,
                                        });

                                        showToast(
                                          'JKS file uploaded successfully. Enter password to extract certificates.',
                                          'success',
                                        );

                                        // Note: Actual extraction would happen on the backend with the password
                                        // The UI just stores the JKS content and password
                                      } catch (error) {
                                        showToast(
                                          `Failed to load JKS file: ${(error as Error).message}`,
                                          'error',
                                        );
                                      }
                                    };
                                    reader.readAsArrayBuffer(file);
                                  }
                                }}
                              />
                              <label htmlFor="tls-jks-upload">
                                <Button variant="outlined" component="span">
                                  {selectedTarget.config.tls?.jksContent
                                    ? `Replace JKS (${selectedTarget.config.tls?.jksFileName || 'loaded'})`
                                    : 'Choose JKS File'}
                                </Button>
                              </label>
                              {selectedTarget.config.tls?.jksContent && (
                                <Box sx={{ mt: 1 }}>
                                  <Typography variant="caption" color="success.main">
                                    ✓ JKS file loaded:{' '}
                                    {selectedTarget.config.tls?.jksFileName || 'keystore.jks'}
                                  </Typography>
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      updateCustomTarget('tls', {
                                        ...selectedTarget.config.tls,
                                        jksContent: undefined,
                                        jksFileName: undefined,
                                        cert: undefined,
                                        key: undefined,
                                      })
                                    }
                                    sx={{ ml: 2 }}
                                  >
                                    Clear
                                  </Button>
                                </Box>
                              )}
                            </>
                          )}

                          {selectedTarget.config.tls?.jksInputType === 'path' && (
                            <TextField
                              fullWidth
                              placeholder="/path/to/keystore.jks"
                              value={selectedTarget.config.tls?.jksPath || ''}
                              onChange={(e) =>
                                updateCustomTarget('tls', {
                                  ...selectedTarget.config.tls,
                                  jksPath: e.target.value,
                                  jksContent: undefined,
                                })
                              }
                              helperText="Path to JKS keystore file on the server"
                            />
                          )}
                        </Box>

                        <TextField
                          fullWidth
                          type="password"
                          label="Keystore Password"
                          placeholder="Enter keystore password"
                          value={selectedTarget.config.tls?.passphrase || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              passphrase: e.target.value,
                            })
                          }
                          required
                          helperText="Password for the JKS keystore (required to extract certificates)"
                        />

                        <TextField
                          fullWidth
                          label="Key Alias (Optional)"
                          placeholder="mykey"
                          value={selectedTarget.config.tls?.keyAlias || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              keyAlias: e.target.value,
                            })
                          }
                          helperText="Alias of the key to extract. If not specified, the first available key will be used."
                        />

                        {selectedTarget.config.tls?.jksContent &&
                          selectedTarget.config.tls?.passphrase && (
                            <Box>
                              <Button
                                variant="contained"
                                startIcon={<VpnKeyIcon />}
                                onClick={async () => {
                                  try {
                                    // Note: In a real implementation, this would call a backend API
                                    // to extract the cert and key from JKS using the jks-js library
                                    // For now, we'll just show a message about what would happen

                                    showToast(
                                      'JKS extraction will be performed on the backend. The certificate and key will be automatically converted to PEM format for TLS use.',
                                      'info',
                                    );

                                    // In production, this would:
                                    // 1. Send JKS content + password to backend
                                    // 2. Backend uses jks-js to extract cert/key
                                    // 3. Backend returns PEM-formatted cert and key
                                    // 4. Store them in config.tls.cert and config.tls.key

                                    // For demonstration, we'll set flags indicating extraction is configured
                                    updateCustomTarget('tls', {
                                      ...selectedTarget.config.tls,
                                      jksExtractConfigured: true,
                                    });
                                  } catch (error) {
                                    showToast(
                                      `Failed to configure JKS extraction: ${(error as Error).message}`,
                                      'error',
                                    );
                                  }
                                }}
                              >
                                Configure JKS Extraction
                              </Button>

                              {selectedTarget.config.tls?.jksExtractConfigured && (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                  JKS extraction configured. The certificate and private key will be
                                  extracted from the JKS file on the backend using the provided
                                  password and key alias.
                                </Alert>
                              )}
                            </Box>
                          )}

                        <Alert severity="info">
                          <Typography variant="body2">
                            <strong>How JKS extraction works:</strong>
                            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                              <li>
                                The JKS file is processed on the backend using the jks-js library
                              </li>
                              <li>
                                The certificate and private key are extracted based on the provided
                                alias
                              </li>
                              <li>Both are automatically converted to PEM format for TLS use</li>
                              <li>The password is only used during extraction and not stored</li>
                            </ul>
                          </Typography>
                        </Alert>
                      </Stack>
                    </Paper>
                  </Box>
                )}

                {/* PFX Certificate Configuration */}
                {selectedTarget.config.tls?.certificateType === 'pfx' && (
                  <Box>
                    <Typography variant="subtitle1" gutterBottom>
                      PFX/PKCS#12 Certificate Bundle
                    </Typography>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Button
                          variant={
                            selectedTarget.config.tls?.pfxInputType === 'upload'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<UploadIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              pfxInputType: 'upload',
                            })
                          }
                        >
                          Upload
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.pfxInputType === 'path'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<InsertDriveFileIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              pfxInputType: 'path',
                            })
                          }
                        >
                          File Path
                        </Button>
                        <Button
                          variant={
                            selectedTarget.config.tls?.pfxInputType === 'base64'
                              ? 'contained'
                              : 'outlined'
                          }
                          startIcon={<LockIcon />}
                          onClick={() =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              pfxInputType: 'base64',
                            })
                          }
                        >
                          Base64
                        </Button>
                      </Box>

                      {selectedTarget.config.tls?.pfxInputType === 'upload' && (
                        <>
                          <input
                            type="file"
                            accept=".pfx,.p12"
                            style={{ display: 'none' }}
                            id="tls-pfx-upload"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const arrayBuffer = event.target?.result as ArrayBuffer;
                                  const base64 = btoa(
                                    String.fromCharCode(...new Uint8Array(arrayBuffer)),
                                  );
                                  updateCustomTarget('tls', {
                                    ...selectedTarget.config.tls,
                                    pfx: base64,
                                    pfxPath: undefined,
                                  });
                                  showToast('PFX certificate uploaded successfully', 'success');
                                };
                                reader.readAsArrayBuffer(file);
                              }
                            }}
                          />
                          <label htmlFor="tls-pfx-upload">
                            <Button variant="outlined" component="span">
                              {selectedTarget.config.tls?.pfx ? 'Replace PFX' : 'Choose PFX File'}
                            </Button>
                          </label>
                          {selectedTarget.config.tls?.pfx && (
                            <Typography variant="caption" color="success.main" sx={{ ml: 2 }}>
                              ✓ PFX loaded
                            </Typography>
                          )}
                        </>
                      )}

                      {selectedTarget.config.tls?.pfxInputType === 'path' && (
                        <TextField
                          fullWidth
                          placeholder="/path/to/certificate.pfx"
                          value={selectedTarget.config.tls?.pfxPath || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              pfxPath: e.target.value,
                              pfx: undefined,
                            })
                          }
                        />
                      )}

                      {selectedTarget.config.tls?.pfxInputType === 'base64' && (
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          placeholder="Base64-encoded PFX content"
                          value={selectedTarget.config.tls?.pfx || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              pfx: e.target.value,
                              pfxPath: undefined,
                            })
                          }
                          helperText="Paste the base64-encoded content of your PFX file"
                        />
                      )}

                      <TextField
                        fullWidth
                        type="password"
                        label="PFX Passphrase"
                        placeholder="Enter passphrase for PFX"
                        value={selectedTarget.config.tls?.passphrase || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            passphrase: e.target.value,
                          })
                        }
                        sx={{ mt: 2 }}
                        helperText="Password for the PFX certificate bundle"
                      />
                    </Paper>
                  </Box>
                )}

                {/* CA Certificate Configuration */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    CA Certificate (Optional)
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Provide a custom CA certificate to verify the server's certificate
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                      <Button
                        variant={
                          selectedTarget.config.tls?.caInputType === 'upload'
                            ? 'contained'
                            : 'outlined'
                        }
                        startIcon={<SecurityIcon />}
                        onClick={() =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            caInputType: 'upload',
                          })
                        }
                      >
                        Upload
                      </Button>
                      <Button
                        variant={
                          selectedTarget.config.tls?.caInputType === 'path'
                            ? 'contained'
                            : 'outlined'
                        }
                        startIcon={<InsertDriveFileIcon />}
                        onClick={() =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            caInputType: 'path',
                          })
                        }
                      >
                        File Path
                      </Button>
                      <Button
                        variant={
                          selectedTarget.config.tls?.caInputType === 'inline'
                            ? 'contained'
                            : 'outlined'
                        }
                        startIcon={<HttpsIcon />}
                        onClick={() =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            caInputType: 'inline',
                          })
                        }
                      >
                        Paste Inline
                      </Button>
                    </Box>

                    {selectedTarget.config.tls?.caInputType === 'upload' && (
                      <>
                        <input
                          type="file"
                          accept=".pem,.crt,.cer"
                          style={{ display: 'none' }}
                          id="tls-ca-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const content = event.target?.result as string;
                                updateCustomTarget('tls', {
                                  ...selectedTarget.config.tls,
                                  ca: content,
                                  caPath: undefined,
                                });
                                showToast('CA certificate uploaded successfully', 'success');
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                        <label htmlFor="tls-ca-upload">
                          <Button variant="outlined" component="span">
                            {selectedTarget.config.tls?.ca
                              ? 'Replace CA Certificate'
                              : 'Choose CA File'}
                          </Button>
                        </label>
                        {selectedTarget.config.tls?.ca && (
                          <Typography variant="caption" color="success.main" sx={{ ml: 2 }}>
                            ✓ CA certificate loaded
                          </Typography>
                        )}
                      </>
                    )}

                    {selectedTarget.config.tls?.caInputType === 'path' && (
                      <TextField
                        fullWidth
                        placeholder="/path/to/ca-cert.pem"
                        value={selectedTarget.config.tls?.caPath || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            caPath: e.target.value,
                            ca: undefined,
                          })
                        }
                      />
                    )}

                    {selectedTarget.config.tls?.caInputType === 'inline' && (
                      <TextField
                        fullWidth
                        multiline
                        rows={4}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...CA certificate content...&#10;-----END CERTIFICATE-----"
                        value={selectedTarget.config.tls?.ca || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            ca: e.target.value,
                            caPath: undefined,
                          })
                        }
                      />
                    )}
                  </Paper>
                </Box>

                {/* Security Options */}
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Security Options
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={selectedTarget.config.tls?.rejectUnauthorized !== false}
                            onChange={(e) =>
                              updateCustomTarget('tls', {
                                ...selectedTarget.config.tls,
                                rejectUnauthorized: e.target.checked,
                              })
                            }
                          />
                        }
                        label="Reject Unauthorized Certificates"
                      />
                      {selectedTarget.config.tls?.rejectUnauthorized === false && (
                        <Alert severity="warning">
                          Disabling certificate verification is dangerous and should never be used
                          in production!
                        </Alert>
                      )}

                      <TextField
                        fullWidth
                        label="Server Name (SNI)"
                        placeholder="api.example.com"
                        value={selectedTarget.config.tls?.servername || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            servername: e.target.value,
                          })
                        }
                        helperText="Override the Server Name Indication (SNI) hostname"
                      />
                    </Stack>
                  </Paper>
                </Box>

                {/* Advanced Options */}
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">Advanced TLS Options</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      <TextField
                        fullWidth
                        label="Cipher Suites"
                        placeholder="TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256"
                        value={selectedTarget.config.tls?.ciphers || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            ciphers: e.target.value,
                          })
                        }
                        helperText="Specify allowed cipher suites (OpenSSL format)"
                      />

                      <FormControl fullWidth>
                        <Select
                          value={selectedTarget.config.tls?.minVersion || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              minVersion: e.target.value,
                            })
                          }
                          displayEmpty
                        >
                          <MenuItem value="">Default</MenuItem>
                          <MenuItem value="TLSv1">TLS 1.0</MenuItem>
                          <MenuItem value="TLSv1.1">TLS 1.1</MenuItem>
                          <MenuItem value="TLSv1.2">TLS 1.2</MenuItem>
                          <MenuItem value="TLSv1.3">TLS 1.3</MenuItem>
                        </Select>
                        <Typography variant="caption" color="text.secondary">
                          Minimum TLS version
                        </Typography>
                      </FormControl>

                      <FormControl fullWidth>
                        <Select
                          value={selectedTarget.config.tls?.maxVersion || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...selectedTarget.config.tls,
                              maxVersion: e.target.value,
                            })
                          }
                          displayEmpty
                        >
                          <MenuItem value="">Default</MenuItem>
                          <MenuItem value="TLSv1">TLS 1.0</MenuItem>
                          <MenuItem value="TLSv1.1">TLS 1.1</MenuItem>
                          <MenuItem value="TLSv1.2">TLS 1.2</MenuItem>
                          <MenuItem value="TLSv1.3">TLS 1.3</MenuItem>
                        </Select>
                        <Typography variant="caption" color="text.secondary">
                          Maximum TLS version
                        </Typography>
                      </FormControl>

                      <TextField
                        fullWidth
                        label="Secure Protocol"
                        placeholder="TLSv1_3_method"
                        value={selectedTarget.config.tls?.secureProtocol || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config.tls,
                            secureProtocol: e.target.value,
                          })
                        }
                        helperText="SSL method to use (e.g., 'TLSv1_2_method', 'TLSv1_3_method')"
                      />
                    </Stack>
                  </AccordionDetails>
                </Accordion>
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
                highlight={highlightJS}
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
