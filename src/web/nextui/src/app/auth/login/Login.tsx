'use client';

import React from 'react';
import { supabase } from '@/supabase-client';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { User } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const [user, setUser] = React.useState<User | null>(null);

  const fetchUser = React.useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data) {
      setUser(data.user);
    }
  }, []);

  React.useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSignIn = async (event: React.FormEvent) => {
    setLoading(true);
    setError('');
    event.stopPropagation();
    event.preventDefault();

    if (!user) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push('/');
        // fetchUser();
      }
    }
    setLoading(false);
  };

  if (user) {
    return (
      <div style={{ textAlign: 'center' }}>You&apos;re already logged in as {user.email}.</div>
    );
  }

  return (
    <Container component="main" maxWidth="xs">
      <Typography component="h1" variant="h5">
        Sign in
      </Typography>
      <form>
        {!user && (
          <>
            <TextField
              disabled={loading}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              error={Boolean(error)}
            />
            <TextField
              disabled={loading}
              variant="outlined"
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              error={Boolean(error)}
              helperText={error}
            />
            <Button
              type="submit"
              disabled={loading}
              sx={{ marginTop: '1em' }}
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSignIn}
            >
              Sign In
            </Button>
            <p>
              Don&apos;t have an account yet? <Link href="/auth/signup">Sign up</Link>
            </p>
          </>
        )}
      </form>
    </Container>
  );
}
