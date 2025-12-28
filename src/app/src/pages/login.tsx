import { useActionState, useEffect, useState } from 'react';

import logoPanda from '@app/assets/logo.svg';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
// Icons
import KeyIcon from '@mui/icons-material/Key';
import LaunchIcon from '@mui/icons-material/Launch';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
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

interface LoginState {
  success: boolean;
  error?: string;
  email?: string;
}

async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const apiKey = formData.get('apiKey') as string;
  const customUrl = formData.get('customUrl') as string;

  // Validation
  if (!apiKey?.trim()) {
    return { success: false, error: 'Please enter your API key' };
  }

  try {
    const response = await callApi('/user/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: apiKey.trim(),
        apiHost: customUrl || undefined,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, email: data.user.email };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.error || 'Authentication failed. Please check your API key.',
    };
  } catch {
    return { success: false, error: 'Network error. Please check your connection and try again.' };
  }
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, { success: false });
  const [showApiKey, setShowApiKey] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { email, isLoading, setEmail, fetchEmail } = useUserStore();

  usePageMeta({
    title: 'Login to Promptfoo',
    description: 'Sign in to access your Promptfoo workspace',
  });

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

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

  // Handle successful login
  useEffect(() => {
    if (state.success && state.email) {
      setEmail(state.email);
      handleRedirect();
    }
  }, [state.success, state.email, setEmail, handleRedirect]);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && email) {
      handleRedirect();
    }
  }, [isLoading, email, handleRedirect]);

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
          <Box component="form" action={formAction} noValidate>
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
                disabled={isPending}
                error={!!state.error}
                helperText={state.error}
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
                defaultValue="https://www.promptfoo.app"
                disabled={isPending}
                helperText="Change this for private cloud or on-premise deployments"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isPending}
                sx={{ py: 1.5 }}
              >
                {isPending ? <CircularProgress size={24} /> : 'Sign In'}
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
