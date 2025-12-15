import React, { useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { useToast } from '@app/hooks/useToast';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearIcon from '@mui/icons-material/Clear';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import KeyIcon from '@mui/icons-material/Key';
import UploadIcon from '@mui/icons-material/Upload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { convertStringKeyToPem, validatePrivateKey } from '../../../utils/crypto';
import type { ProviderOptions } from '@promptfoo/types';

interface AuthorizationTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const AuthorizationTab: React.FC<AuthorizationTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();

  // Visibility state for password fields
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showOAuthPassword, setShowOAuthPassword] = useState(false);
  const [showBasicPassword, setShowBasicPassword] = useState(false);
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showKeystorePassword, setShowKeystorePassword] = useState(false);
  const [showPfxPassword, setShowPfxPassword] = useState(false);

  // Auth configuration helpers
  const getAuthType = (): string | undefined => {
    // Check if digital signature is enabled (it's outside the auth object)
    if (selectedTarget.config.signatureAuth?.enabled) {
      return 'digital_signature';
    }
    return selectedTarget.config.auth?.type;
  };

  const handleAuthTypeChange = (newType: string | undefined) => {
    // Clear signature auth for all auth types except digital_signature
    if (newType !== 'digital_signature') {
      updateCustomTarget('signatureAuth', undefined);
    }

    if (newType === undefined || newType === 'no_auth') {
      // Clear all auth config
      updateCustomTarget('auth', undefined);
    } else if (newType === 'digital_signature') {
      // Clear auth object and enable signature auth
      updateCustomTarget('auth', undefined);
      updateCustomTarget('signatureAuth', {
        enabled: true,
        certificateType: selectedTarget.config.signatureAuth?.certificateType || 'pem',
        keyInputType: selectedTarget.config.signatureAuth?.keyInputType || 'upload',
      });
    } else if (newType === 'oauth') {
      // Set up OAuth structure with client_credentials as default
      updateCustomTarget('auth', {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: '',
        clientSecret: '',
        tokenUrl: '',
        scopes: [],
      });
    } else if (newType === 'basic') {
      // Set up Basic structure
      updateCustomTarget('auth', {
        type: 'basic',
        username: '',
        password: '',
      });
    } else if (newType === 'bearer') {
      // Set up Bearer structure
      updateCustomTarget('auth', {
        type: 'bearer',
        token: '',
      });
    } else if (newType === 'api_key') {
      // Set up API Key structure
      updateCustomTarget('auth', {
        type: 'api_key',
        value: '',
        placement: 'header',
        keyName: 'X-API-Key',
      });
    }
  };

  const handleOAuthGrantTypeChange = (newGrantType: 'client_credentials' | 'password') => {
    const currentAuth = selectedTarget.config.auth || {};
    if (newGrantType === 'password') {
      // Add username and password fields for password grant
      updateCustomTarget('auth', {
        ...currentAuth,
        grantType: 'password',
        username: currentAuth.username || '',
        password: currentAuth.password || '',
      });
    } else {
      // Remove username and password fields for client_credentials grant
      const { username: _username, password: _password, ...restAuth } = currentAuth as any;
      updateCustomTarget('auth', {
        ...restAuth,
        grantType: 'client_credentials',
      });
    }
  };

  const updateAuthField = (field: string, value: any) => {
    const currentAuth = selectedTarget.config.auth || {};
    updateCustomTarget('auth', {
      ...currentAuth,
      [field]: value,
    });
  };

  return (
    <>
      <FormControl fullWidth margin="normal">
        <InputLabel id="auth-type-label">Authentication Type</InputLabel>
        <Select
          labelId="auth-type-label"
          value={getAuthType() ?? 'no_auth'}
          onChange={(e) => {
            const value = e.target.value;
            handleAuthTypeChange(value === '' || value === 'no_auth' ? undefined : value);
          }}
          label="Authentication Type"
        >
          <MenuItem value="no_auth">No Auth</MenuItem>
          <MenuItem value="api_key">API Key</MenuItem>
          <MenuItem value="basic">Basic</MenuItem>
          <MenuItem value="bearer">Bearer</MenuItem>
          <MenuItem value="digital_signature">Digital Signature</MenuItem>
          <MenuItem value="oauth">OAuth 2.0</MenuItem>
        </Select>
      </FormControl>

      {/* OAuth 2.0 Form */}
      {getAuthType() === 'oauth' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            OAuth 2.0 Configuration
          </Typography>

          <FormControl fullWidth margin="normal">
            <InputLabel id="oauth-grant-type-label">Grant Type</InputLabel>
            <Select
              labelId="oauth-grant-type-label"
              value={selectedTarget.config.auth?.grantType || 'client_credentials'}
              onChange={(e) =>
                handleOAuthGrantTypeChange(e.target.value as 'client_credentials' | 'password')
              }
              label="Grant Type"
            >
              <MenuItem value="client_credentials">Client Credentials</MenuItem>
              <MenuItem value="password">Username & Password</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Token URL"
            value={selectedTarget.config.auth?.tokenUrl || ''}
            onChange={(e) => updateAuthField('tokenUrl', e.target.value)}
            margin="normal"
            placeholder="https://example.com/oauth/token"
            required
          />
          <TextField
            fullWidth
            label="Client ID"
            value={selectedTarget.config.auth?.clientId || ''}
            onChange={(e) => updateAuthField('clientId', e.target.value)}
            margin="normal"
            required={selectedTarget.config.auth?.grantType !== 'password'}
            helperText={
              selectedTarget.config.auth?.grantType === 'password'
                ? 'Optional for password grant'
                : undefined
            }
          />
          <TextField
            fullWidth
            label="Client Secret"
            type={showClientSecret ? 'text' : 'password'}
            value={selectedTarget.config.auth?.clientSecret || ''}
            onChange={(e) => updateAuthField('clientSecret', e.target.value)}
            margin="normal"
            required={selectedTarget.config.auth?.grantType !== 'password'}
            autoComplete="off"
            helperText={
              selectedTarget.config.auth?.grantType === 'password'
                ? 'Optional for password grant'
                : undefined
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showClientSecret ? 'Hide client secret' : 'Show client secret'}>
                    <IconButton
                      aria-label="toggle client secret visibility"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      edge="end"
                      size="small"
                    >
                      {showClientSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />

          {/* Show username/password fields only for password grant type */}
          {selectedTarget.config.auth?.grantType === 'password' && (
            <>
              <TextField
                fullWidth
                label="Username"
                value={selectedTarget.config.auth?.username || ''}
                onChange={(e) => updateAuthField('username', e.target.value)}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type={showOAuthPassword ? 'text' : 'password'}
                value={selectedTarget.config.auth?.password || ''}
                onChange={(e) => updateAuthField('password', e.target.value)}
                margin="normal"
                required
                autoComplete="off"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={showOAuthPassword ? 'Hide password' : 'Show password'}>
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowOAuthPassword(!showOAuthPassword)}
                          edge="end"
                          size="small"
                        >
                          {showOAuthPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />
            </>
          )}

          <TextField
            fullWidth
            label="Scopes (comma-separated)"
            value={
              Array.isArray(selectedTarget.config.auth?.scopes)
                ? selectedTarget.config.auth.scopes.join(', ')
                : selectedTarget.config.auth?.scopes || ''
            }
            onChange={(e) => {
              const scopes = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              updateAuthField('scopes', scopes);
            }}
            margin="normal"
            placeholder="read, write, admin"
            helperText="Enter scopes separated by commas (optional)"
          />
        </Box>
      )}

      {/* Basic Auth Form */}
      {getAuthType() === 'basic' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Basic Authentication Configuration
          </Typography>
          <TextField
            fullWidth
            label="Username"
            value={selectedTarget.config.auth?.username || ''}
            onChange={(e) => updateAuthField('username', e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Password"
            type={showBasicPassword ? 'text' : 'password'}
            value={selectedTarget.config.auth?.password || ''}
            onChange={(e) => updateAuthField('password', e.target.value)}
            margin="normal"
            required
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showBasicPassword ? 'Hide password' : 'Show password'}>
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowBasicPassword(!showBasicPassword)}
                      edge="end"
                      size="small"
                    >
                      {showBasicPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {/* Bearer Auth Form */}
      {getAuthType() === 'bearer' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Bearer Token Authentication Configuration
          </Typography>
          <TextField
            fullWidth
            label="Token"
            type={showBearerToken ? 'text' : 'password'}
            value={selectedTarget.config.auth?.token || ''}
            onChange={(e) => updateAuthField('token', e.target.value)}
            margin="normal"
            required
            placeholder="Enter your Bearer token"
            autoComplete="off"
            helperText="This token will be sent in the Authorization header as: Bearer {token}"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showBearerToken ? 'Hide token' : 'Show token'}>
                    <IconButton
                      aria-label="toggle token visibility"
                      onClick={() => setShowBearerToken(!showBearerToken)}
                      edge="end"
                      size="small"
                    >
                      {showBearerToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {/* API Key Auth Form */}
      {getAuthType() === 'api_key' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            API Key Authentication Configuration
          </Typography>
          <FormControl fullWidth margin="normal">
            <InputLabel id="api-key-placement-label">Placement</InputLabel>
            <Select
              labelId="api-key-placement-label"
              value={selectedTarget.config.auth?.placement || 'header'}
              onChange={(e) => updateAuthField('placement', e.target.value)}
              label="Placement"
            >
              <MenuItem value="header">Header</MenuItem>
              <MenuItem value="query">Query Parameter</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Key Name"
            value={selectedTarget.config.auth?.keyName || 'X-API-Key'}
            onChange={(e) => updateAuthField('keyName', e.target.value)}
            margin="normal"
            required
            placeholder="X-API-Key"
            helperText={
              selectedTarget.config.auth?.placement === 'header'
                ? 'Header name where the API key will be placed (e.g., X-API-Key, Authorization)'
                : 'Query parameter name where the API key will be placed (e.g., api_key, key)'
            }
          />
          <TextField
            fullWidth
            label="API Key Value"
            type={showApiKey ? 'text' : 'password'}
            value={selectedTarget.config.auth?.value || ''}
            onChange={(e) => updateAuthField('value', e.target.value)}
            margin="normal"
            required
            placeholder="Enter your API key"
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showApiKey ? 'Hide API key' : 'Show API key'}>
                    <IconButton
                      aria-label="toggle API key visibility"
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                      size="small"
                    >
                      {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {/* Digital Signature Auth Form */}
      {getAuthType() === 'digital_signature' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Configure signature-based authentication for secure API calls. Your private key is never
            sent to Promptfoo and will always be stored locally on your system. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/http/#digital-signature-authentication"
              target="_blank"
              rel="noreferrer"
            >
              docs
            </a>{' '}
            for more information.
          </Typography>

          <Stack spacing={4}>
            <Box>
              <FormControl fullWidth>
                <InputLabel id="certificate-type-label">Certificate Type</InputLabel>
                <Select
                  labelId="certificate-type-label"
                  label="Certificate Type"
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
                  <TextField
                    fullWidth
                    label="Private Key File Path"
                    placeholder="/path/to/private_key.pem"
                    value={selectedTarget.config.signatureAuth?.privateKeyPath || ''}
                    helperText=" Specify the path on disk to your PEM format private key file"
                    slotProps={{
                      inputLabel: {
                        shrink: true,
                      },
                    }}
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
                    type={showKeystorePassword ? 'text' : 'password'}
                    label="Keystore Password"
                    placeholder="Enter keystore password"
                    value={selectedTarget.config.signatureAuth?.keystorePassword || ''}
                    onChange={(e) => {
                      updateCustomTarget('signatureAuth', {
                        ...selectedTarget.config.signatureAuth,
                        keystorePassword: e.target.value,
                      });
                    }}
                    autoComplete="off"
                    helperText="Password for the JKS keystore. Can also be set via PROMPTFOO_JKS_PASSWORD environment variable."
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip
                            title={
                              showKeystorePassword
                                ? 'Hide keystore password'
                                : 'Show keystore password'
                            }
                          >
                            <IconButton
                              aria-label="toggle keystore password visibility"
                              onClick={() => setShowKeystorePassword(!showKeystorePassword)}
                              edge="end"
                              size="small"
                            >
                              {showKeystorePassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }}
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
                        type={showPfxPassword ? 'text' : 'password'}
                        label="PFX Password"
                        placeholder="Enter PFX password"
                        value={selectedTarget.config.signatureAuth?.pfxPassword || ''}
                        onChange={(e) => {
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config.signatureAuth,
                            pfxPassword: e.target.value,
                          });
                        }}
                        autoComplete="off"
                        helperText="Password for the PFX certificate file. Can also be set via PROMPTFOO_PFX_PASSWORD environment variable."
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip
                                title={showPfxPassword ? 'Hide PFX password' : 'Show PFX password'}
                              >
                                <IconButton
                                  aria-label="toggle PFX password visibility"
                                  onClick={() => setShowPfxPassword(!showPfxPassword)}
                                  edge="end"
                                  size="small"
                                >
                                  {showPfxPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        }}
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
        </Box>
      )}
    </>
  );
};

export default AuthorizationTab;
