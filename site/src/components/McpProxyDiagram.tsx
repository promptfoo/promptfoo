import React from 'react';
import AppsIcon from '@mui/icons-material/Apps';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import GroupIcon from '@mui/icons-material/Group';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export default function MCPProxyDiagram() {
  const AV = 80; // avatar diameter
  const PROXY_D = 200; // proxy circle diameter

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 900,
        mx: 'auto',
        p: 4,
        bgcolor: '#fff',
        borderRadius: 4,
        boxShadow: 3,
      }}
    >
      <Grid container alignItems="center" justifyContent="center">
        {/* Left column: Users & Apps */}
        <Grid item xs={12} sm={3}>
          <Stack
            spacing={8}
            justifyContent="center"
            alignItems="center"
            sx={{ height: PROXY_D + 100 }}
          >
            <Stack alignItems="center" spacing={1}>
              <Avatar sx={{ bgcolor: '#1976d2', width: AV, height: AV }}>
                <GroupIcon sx={{ fontSize: 36, color: '#fff' }} />
              </Avatar>
              <Typography variant="h6">Users</Typography>
            </Stack>
            <Stack alignItems="center" spacing={1}>
              <Avatar sx={{ bgcolor: '#7b1fa2', width: AV, height: AV }}>
                <AppsIcon sx={{ fontSize: 36, color: '#fff' }} />
              </Avatar>
              <Typography variant="h6">Apps</Typography>
            </Stack>
          </Stack>
        </Grid>

        {/* Center column: Proxy */}
        <Grid item xs={12} sm={6}>
          <Stack spacing={2} alignItems="center">
            <Box
              sx={{
                position: 'relative',
                width: PROXY_D,
                height: PROXY_D,
                border: '6px solid #43a047',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#fff',
              }}
            >
              <SecurityIcon sx={{ fontSize: 80, color: '#43a047' }} />
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  bgcolor: '#fff',
                  borderRadius: '50%',
                  p: 0.5,
                }}
              >
                <VisibilityIcon sx={{ fontSize: 24, color: '#fbc02d' }} />
              </Box>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              MCP Proxy
            </Typography>
          </Stack>
        </Grid>

        {/* Right column: Trusted & Unapproved */}
        <Grid item xs={12} sm={3}>
          <Stack
            spacing={8}
            justifyContent="center"
            alignItems="center"
            sx={{ height: PROXY_D + 100 }}
          >
            <Stack alignItems="center" spacing={1}>
              <Avatar sx={{ bgcolor: '#43a047', width: AV, height: AV }}>
                <CloudDoneIcon sx={{ fontSize: 36, color: '#fff' }} />
              </Avatar>
              <Typography variant="h6">Trusted MCP</Typography>
            </Stack>
            <Stack alignItems="center" spacing={1}>
              <Avatar sx={{ bgcolor: '#f44336', width: AV, height: AV }}>
                <CloudOffIcon sx={{ fontSize: 36, color: '#fff' }} />
              </Avatar>
              <Typography variant="h6">Unapproved MCP</Typography>
            </Stack>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
