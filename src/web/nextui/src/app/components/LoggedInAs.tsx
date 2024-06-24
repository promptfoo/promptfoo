import { useAuth } from '@/supabase-client';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Link from 'next/link';
import React from 'react';

export default function LoggedInAs() {
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleLogout = async () => {
    logout?.();
    handleClose();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  if (!user) {
    return (
      <Link href="/auth/signup/">
        <IconButton
          edge="end"
          aria-label="User not logged in"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          color="inherit"
        >
          <Avatar sx={{ width: '1em', height: '1em' }} />
        </IconButton>
      </Link>
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
        <Avatar sx={{ width: '1em', height: '1em', bgcolor: '#1976d2' }} />
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
