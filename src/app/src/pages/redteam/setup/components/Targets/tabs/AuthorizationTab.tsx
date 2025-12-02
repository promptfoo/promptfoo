import React from 'react';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';

interface AuthorizationTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const AuthorizationTab: React.FC<AuthorizationTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  // Auth configuration helpers
  const getAuthType = (): string | undefined => {
    return selectedTarget.config.auth?.type;
  };

  const handleAuthTypeChange = (newType: string | undefined) => {
    if (newType === undefined) {
      // Clear all auth config
      updateCustomTarget('auth', undefined);
    } else if (newType === 'oauth') {
      // Clear existing auth and set up OAuth structure with client_credentials as default
      updateCustomTarget('auth', {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: '',
        clientSecret: '',
        tokenUrl: '',
        scopes: [],
      });
    } else if (newType === 'basic') {
      // Clear existing auth and set up Basic structure
      updateCustomTarget('auth', {
        type: 'basic',
        username: '',
        password: '',
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
  console.log(getAuthType() ?? '');
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
          <MenuItem value="oauth">OAuth 2.0</MenuItem>
          <MenuItem value="basic">Basic</MenuItem>
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
            type="password"
            value={selectedTarget.config.auth?.clientSecret || ''}
            onChange={(e) => updateAuthField('clientSecret', e.target.value)}
            margin="normal"
            required={selectedTarget.config.auth?.grantType !== 'password'}
            helperText={
              selectedTarget.config.auth?.grantType === 'password'
                ? 'Optional for password grant'
                : undefined
            }
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
                type="password"
                value={selectedTarget.config.auth?.password || ''}
                onChange={(e) => updateAuthField('password', e.target.value)}
                margin="normal"
                required
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
            type="password"
            value={selectedTarget.config.auth?.password || ''}
            onChange={(e) => updateAuthField('password', e.target.value)}
            margin="normal"
            required
          />
        </Box>
      )}
    </>
  );
};

export default AuthorizationTab;
