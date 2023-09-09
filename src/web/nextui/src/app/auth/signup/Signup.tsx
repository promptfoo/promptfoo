'use client';

import React from 'react';
import Link from 'next/link';
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { createClientComponentClient, User } from '@supabase/auth-helpers-nextjs'

import type { Database } from '@/types/supabase';

export default function Login() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const supabase = createClientComponentClient<Database>()

  const [user, setUser] = React.useState<User | null>(null)

  const fetchUser = React.useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (data) {
      setUser(data.user)
    }
  }, [supabase.auth])

  React.useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handleSignUp = async (event: React.FormEvent) => {
    setLoading(true);
    event.stopPropagation();
    event.preventDefault();

    if (!user) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
      } else {
        // fetchUser();
      }
    }
    setLoading(false);
  }

  return (
    <Container component="main" maxWidth="xs">
      <Typography component="h1" variant="h5">
        Sign up
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
              sx={{marginTop: '1em'}}
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSignUp}
            >
              Sign Up
            </Button>
          </>
        )}
        <p>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </p>
      </form>
    </Container>
  )
}
