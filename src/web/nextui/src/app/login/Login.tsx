'use client';

import React from 'react';
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { createClientComponentClient, User } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

import type { Database } from '@/types/supabase';

export default function Login() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const supabase = createClientComponentClient<Database>()

  const [user, setUser] = React.useState<User | null>(null)

  const fetchUser = React.useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (data) {
      setUser(data.user)
    }
  }, [])

  React.useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handleSignUp = async () => {
    if (!user) {
      await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      fetchUser()
    }
  }

  const handleSignIn = async () => {
    if (!user) {
      await supabase.auth.signInWithPassword({
        email,
        password,
      })
      fetchUser()
    }
  }

  const handleSignOut = async () => {
    if (user) {
      await supabase.auth.signOut()
      fetchUser()
    }
  }

  return (
    <Container component="main" maxWidth="xs">
      <Typography component="h1" variant="h5">
        Sign in
      </Typography>
      <form>
        <TextField
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
        />
        <TextField
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
        />
        {!user && (
          <>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSignUp}
            >
              Sign Up
            </Button>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSignIn}
            >
              Sign In
            </Button>
          </>
        )}
        {user && (
          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        )}
      </form>
    </Container>
  )
}
