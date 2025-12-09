import React from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import UploadIcon from '@mui/icons-material/Upload';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { convertStringKeyToPem, validatePrivateKey } from '../../../utils/crypto';
import type { ProviderOptions } from '@promptfoo/types';

interface DigitalSignatureAuthTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const DigitalSignatureAuthTab: React.FC<DigitalSignatureAuthTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();

  return (
    <>
      <Typography variant="body1" sx={{ mb: 3 }}>
        Configure signature-based authentication for secure API calls. Your private key is never
        sent to Promptfoo and will always be stored locally on your system. See{' '}
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
                    certificateType: selectedTarget.config.signatureAuth?.certificateType || 'pem',
                    keyInputType: selectedTarget.config.signatureAuth?.keyInputType || 'upload',
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
        <Stack spacing={4} sx={{ mt: 3 }}>
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
                        <Button variant="outlined" component="span" startIcon={<VpnKeyIcon />}>
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
                  label="Private Key File Path"
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
                  slotProps={{
                    inputLabel: {
                      shrink: true,
                    },
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
                          const inputKey = selectedTarget.config.signatureAuth?.privateKey || '';
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
              selectedTarget.config.signatureAuth?.signatureDataTemplate || '{{signatureTimestamp}}'
            }
            onChange={(e) =>
              updateCustomTarget('signatureAuth', {
                ...selectedTarget.config.signatureAuth,
                signatureDataTemplate: e.target.value,
              })
            }
            placeholder="Template for generating signature data"
            helperText="Supported variables: {{signatureTimestamp}}. Use \n for newlines"
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
          />
          <BaseNumberInput
            fullWidth
            label="Signature Validity (ms)"
            value={selectedTarget.config.signatureAuth?.signatureValidityMs}
            onChange={(v) =>
              updateCustomTarget('signatureAuth', {
                ...selectedTarget.config.signatureAuth,
                signatureValidityMs: v,
              })
            }
            onBlur={() => {
              if (
                selectedTarget.config.signatureAuth?.signatureValidityMs === undefined ||
                selectedTarget.config.signatureAuth?.signatureValidityMs === ''
              ) {
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config.signatureAuth,
                  signatureValidityMs: 300000,
                });
              }
            }}
            placeholder="How long the signature remains valid"
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
          />

          <BaseNumberInput
            fullWidth
            label="Signature Refresh Buffer (ms)"
            value={selectedTarget.config.signatureAuth?.signatureRefreshBufferMs}
            onChange={(v) =>
              updateCustomTarget('signatureAuth', {
                ...selectedTarget.config.signatureAuth,
                signatureRefreshBufferMs: v,
              })
            }
            placeholder="Buffer time before signature expiry to refresh - defaults to 10% of signature validity"
            slotProps={{
              inputLabel: {
                shrink: true,
              },
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
            slotProps={{
              inputLabel: {
                shrink: true,
              },
            }}
          />
        </Stack>
      )}
    </>
  );
};

export default DigitalSignatureAuthTab;
