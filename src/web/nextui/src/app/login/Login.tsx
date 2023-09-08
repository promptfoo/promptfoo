import { Button, TextField, Container, Typography } from '@mui/material'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { Database } from '@/types/supabase';

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()

  const handleSignUp = async () => {
    await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    router.refresh()
  }

  const handleSignIn = async () => {
    await supabase.auth.signInWithPassword({
      email,
      password,
    })
    router.refresh()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
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
        <Button
          type="submit"
          fullWidth
          variant="contained"
          color="primary"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </form>
    </Container>
  )
}
