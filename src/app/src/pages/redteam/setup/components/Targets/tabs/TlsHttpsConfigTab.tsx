import React from 'react';

import { useToast } from '@app/hooks/useToast';
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
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { validatePrivateKey } from '../../../utils/crypto';
import SensitiveTextField from './SensitiveTextField';
import type { ProviderOptions } from '@promptfoo/types';

interface TlsHttpsConfigTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const TlsHttpsConfigTab: React.FC<TlsHttpsConfigTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();

  return (
    <>
      <Typography variant="body1" sx={{ mb: 3 }}>
        Configure TLS certificates for secure HTTPS connections, including custom CA certificates,
        client certificates for mutual TLS, and PFX certificate bundles. See{' '}
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
                    pfxPath: certType !== 'pfx' ? undefined : selectedTarget.config.tls?.pfxPath,
                    passphrase:
                      certType !== 'pfx' && certType !== 'jks'
                        ? undefined
                        : selectedTarget.config.tls?.passphrase,
                    jksPath: certType !== 'jks' ? undefined : selectedTarget.config.tls?.jksPath,
                    keyAlias: certType !== 'jks' ? undefined : selectedTarget.config.tls?.keyAlias,
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
              Select "No Client Certificate" for server-only verification, or choose a certificate
              type for mutual TLS
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
                      selectedTarget.config.tls?.certInputType === 'path' ? 'contained' : 'outlined'
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
                      selectedTarget.config.tls?.keyInputType === 'path' ? 'contained' : 'outlined'
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
                    Upload a JKS file to automatically extract the certificate and private key for
                    TLS configuration. The jks-js library will be used to convert the JKS content to
                    PEM format.
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

                  <SensitiveTextField
                    fullWidth
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
                              showToast(
                                'JKS extraction will be performed on the backend. The certificate and key will be automatically converted to PEM format for TLS use.',
                                'info',
                              );

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
                            extracted from the JKS file on the backend using the provided password
                            and key alias.
                          </Alert>
                        )}
                      </Box>
                    )}
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
                      selectedTarget.config.tls?.pfxInputType === 'path' ? 'contained' : 'outlined'
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

                <SensitiveTextField
                  fullWidth
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
                    selectedTarget.config.tls?.caInputType === 'upload' ? 'contained' : 'outlined'
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
                    selectedTarget.config.tls?.caInputType === 'path' ? 'contained' : 'outlined'
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
                    selectedTarget.config.tls?.caInputType === 'inline' ? 'contained' : 'outlined'
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
                      {selectedTarget.config.tls?.ca ? 'Replace CA Certificate' : 'Choose CA File'}
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
                    Disabling certificate verification is dangerous and should never be used in
                    production!
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
    </>
  );
};

export default TlsHttpsConfigTab;
