import AssessmentIcon from '@mui/icons-material/Assessment';
import LaunchIcon from '@mui/icons-material/Launch';
import SecurityIcon from '@mui/icons-material/Security';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import logo from '@app/assets/logo.svg';

const EmptyState = () => {
  const navigate = useNavigate();

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <Paper
        elevation={3}
        sx={{
          p: 4,
          textAlign: 'center',
          maxWidth: 500,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          sx={{ mb: 2 }}
        >
          <img src={logo} alt="Promptfoo logo" style={{ width: 48, height: 48 }} />
          <Typography variant="h5">Welcome to Promptfoo</Typography>
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Get started by creating an eval or red team
        </Typography>
        <Stack spacing={2} direction="row" justifyContent="center">
          <Button
            variant="contained"
            startIcon={<AssessmentIcon />}
            onClick={() => navigate('/setup')}
            size="large"
          >
            Create Eval
          </Button>
          <Button
            variant="outlined"
            startIcon={<SecurityIcon />}
            onClick={() => navigate('/redteam/setup')}
            size="large"
          >
            Create Red Team
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Or run <code>promptfoo init</code> from the command line
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Link
            href="https://www.promptfoo.dev/docs/getting-started/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: '0.875rem',
            }}
          >
            View documentation
            <LaunchIcon sx={{ fontSize: 16 }} />
          </Link>
        </Box>
      </Paper>
    </Box>
  );
};

export default EmptyState;
