import { useEffect } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import AssignmentIcon from '@mui/icons-material/Assignment';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useLocation, useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recordEvent } = useTelemetry();

  usePageMeta({
    title: 'Page Not Found',
    description: 'The page you are looking for could not be found',
  });

  useEffect(() => {
    recordEvent('webui_404_page_view', {
      path: location.pathname,
      search: location.search,
      referrer: document.referrer,
    });
  }, [location.pathname, location.search, recordEvent]);

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
        <Paper elevation={3} sx={{ padding: 4, width: '100%', textAlign: 'center' }}>
          <Typography
            variant="h1"
            sx={{
              fontSize: '4rem',
              fontWeight: 700,
              color: 'primary.main',
              mb: 2,
            }}
          >
            404
          </Typography>

          <Typography component="h1" variant="h4" gutterBottom>
            Page Not Found
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            The page you're looking for doesn't exist or has been moved.
          </Typography>

          <Button
            variant="contained"
            startIcon={<AssignmentIcon />}
            onClick={() => navigate('/evals')}
            size="large"
          >
            See Evals
          </Button>
        </Paper>
      </Box>
    </Container>
  );
}
