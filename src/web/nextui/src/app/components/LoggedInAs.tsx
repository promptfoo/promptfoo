import React from 'react';
import Link from 'next/link';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import { createClientComponentClient, User } from '@supabase/auth-helpers-nextjs'

import type { Database } from '@/types/supabase';

export default function LoggedInAs() {
  const supabase = createClientComponentClient<Database>()

  const [user, setUser] = React.useState<User | null>(null)
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const fetchUser = React.useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (data) {
      setUser(data.user)
    }
  }, [supabase.auth])

  React.useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    fetchUser();
    handleClose();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  if (!user) {
    return (
      <Link href="/auth/login/">Login</Link>
    );
  }

  return (
    <div>
      <IconButton
        edge="end"
        aria-label="account of current user"
        aria-controls="menu-appbar"
        aria-haspopup="true"
        onClick={handleMenu}
        color="inherit"
      >
        <Avatar sx={{ width: '1em', height: '1em' }} />
      </IconButton>
      <Menu
        id="menu-appbar"
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={Boolean(anchorEl)}
        onClose={handleClose}
      >
        <MenuItem disabled>Logged in as {user.email}</MenuItem>
        <MenuItem onClick={handleLogout}>Logout</MenuItem>
      </Menu>
    </div>
  );
}
