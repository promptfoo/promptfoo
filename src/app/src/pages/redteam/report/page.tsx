import { useEffect } from 'react';

import PylonChat from '@app/components/PylonChat';
import { UserProvider } from '@app/contexts/UserContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserStore } from '@app/stores/userStore';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useNavigate } from 'react-router-dom';
import Report from './components/Report';
import ReportIndex from './components/ReportIndex';

export default function ReportPage() {
  const navigate = useNavigate();
  const { email, isLoading, fetchEmail } = useUserStore();
  const searchParams = new URLSearchParams(window.location.search);
  const evalId = searchParams.get('evalId');
  usePageMeta({
    title: evalId ? 'Red team report' : 'Red team reports',
    description: 'View or browse red team results',
  });

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  useEffect(() => {
    if (!isLoading && !email) {
      navigate(`/login?type=report&redirect=${window.location.pathname}${window.location.search}`);
    }
  }, [isLoading, email, navigate]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          justifyContent: 'center',
          alignItems: 'center',
          height: '9rem',
        }}
      >
        <CircularProgress size={22} />
        <Box>Waiting for report data</Box>
      </Box>
    );
  }

  if (!email) {
    // This will prevent a flash of content before redirect
    return null;
  }

  return (
    <UserProvider>
      {evalId ? <Report /> : <ReportIndex />}
      <PylonChat />
    </UserProvider>
  );
}
