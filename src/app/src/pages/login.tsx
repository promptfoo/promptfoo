import React, { useEffect, useState } from 'react';

import logoPanda from '@app/assets/logo.svg';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserEmail, useSetUserEmail } from '@app/hooks/useUser';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useLocation, useNavigate } from 'react-router-dom';

// Icons
import KeyIcon from '@mui/icons-material/Key';
import LaunchIcon from '@mui/icons-material/Launch';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

export default function LoginPage() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('https://www.promptfoo.app');
  const navigate = useNavigate();
  const location = useLocation();
  const { email, isLoading } = useUserEmail();
  const setEmail = useSetUserEmail();
  usePageMeta({
    title: 'Login to Promptfoo',
    description: 'Sign in to access your Promptfoo workspace',
  });

  const handleRedirect = () => {
    // Handle special case where redirect URL contains query parameters
    // e.g., ?redirect=/some-page?param1=value1&param2=value2
    const searchStr = location.search;
    const redirectMatch = searchStr.match(/[?&]redirect=([^&]*(?:&[^=]*=[^&]*)*)/);
    let redirect = null;

    if (redirectMatch) {
      redirect = decodeURIComponent(redirectMatch[1]);
    } else {
      const params = new URLSearchParams(searchStr);
      redirect = params.get('redirect');
    }

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      navigate(redirect);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!isLoading && email) {
      handleRedirect();
    }
  }, [isLoading, email, handleRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) {
      setError('Please enter your API key');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await callApi('/user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim(),
          apiHost: customUrl || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setEmail(data.user.email);
        handleRedirect();
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'Authentication failed. Please check your API key.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || (!isLoading && email)) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
          {/* Logo and Header */}
          <Stack spacing={3} alignItems="center" textAlign="center" mb={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <img src={logoPanda} alt="Promptfoo" style={{ width: 40, height: 40 }} />
              <Typography variant="h4" component="h1" fontWeight={600}>
                promptfoo
              </Typography>
            </Box>

            <Typography variant="h5" color="text.primary">
              {new URLSearchParams(location.search).get('type') === 'report'
                ? 'View Report'
                : 'Welcome to Promptfoo'}
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
              Enter your API token to authenticate.
              {!new URLSearchParams(location.search).get('type') && (
                <>
                  {' '}
                  Don't have one?{' '}
                  <Link
                    href="https://promptfoo.app/welcome"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Generate your token here
                  </Link>
                </>
              )}
            </Typography>
          </Stack>

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={3}>
              <TextField
                id="apiKey"
                name="apiKey"
                label="API Key"
                type={showApiKey ? 'text' : 'password'}
                required
                fullWidth
                autoFocus
                autoComplete="new-password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={isSubmitting}
                error={!!error}
                helperText={error}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <KeyIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle API key visibility"
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        size="small"
                      >
                        {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                id="customUrl"
                name="customUrl"
                label="API Host"
                type="url"
                fullWidth
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={isSubmitting}
                helperText="Change this for private cloud or on-premise deployments"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isSubmitting || !apiKeyInput.trim()}
                sx={{ py: 1.5 }}
              >
                {isSubmitting ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
            </Stack>
          </Box>

          {/* Help Section */}
          <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <Typography variant="body2" color="text.secondary">
                Don't have an API key?
              </Typography>

              <Link
                href="https://promptfoo.app/welcome"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  textDecoration: 'none',
                }}
              >
                Get your API key
                <LaunchIcon sx={{ fontSize: 16 }} />
              </Link>
            </Stack>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
