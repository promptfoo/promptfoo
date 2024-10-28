import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export default function LoginPage() {
  const [emailInput, setEmailInput] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { email, isLoading, setEmail, fetchEmail } = useUserStore();

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const params = new URLSearchParams(location.search);
  const handleRedirect = () => {
    const redirect = params.get('redirect');
    if (redirect) {
      navigate(redirect);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!isLoading && email) {
      handleRedirect();
    }
  }, [isLoading, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await callApi('/user/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput }),
      });

      if (response.ok) {
        // Save consent after successful login
        await callApi('/user/consent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: emailInput,
            metadata: {
              source: 'web_login',
            },
          }),
        });

        setEmail(emailInput);
        handleRedirect();
      } else {
        console.error('Failed to set email');
      }
    } catch (error) {
      console.error('Error setting email:', error);
    }
  };

  if (isLoading) {
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
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            {params.get('type') === 'report' ? 'View Report' : 'Authentication required'}
          </Typography>
          <Typography variant="body1" align="center" sx={{ mb: 3 }}>
            Please verify your email to continue
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
            <Button type="submit" fullWidth variant="contained" size="large" sx={{ mt: 3, mb: 2 }}>
              Login
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
