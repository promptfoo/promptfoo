import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CrispChat from '@app/components/CrispChat';
import { UserProvider } from '@app/contexts/UserContext';
import { useUserStore } from '@app/stores/userStore';
import Report from './components/Report';
import ReportIndex from './components/ReportIndex';

export default function ReportPage() {
  const navigate = useNavigate();
  const { email, isLoading, fetchEmail } = useUserStore();
  const searchParams = new URLSearchParams(window.location.search);
  const evalId = searchParams.get('evalId');

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  useEffect(() => {
    if (!isLoading && !email) {
      navigate(`/login?type=report&redirect=${window.location.pathname}${window.location.search}`);
    }
  }, [isLoading, email, navigate]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!email) {
    // This will prevent a flash of content before redirect
    return null;
  }

  return (
    <UserProvider>
      {evalId ? <Report /> : <ReportIndex />}
      <CrispChat />
    </UserProvider>
  );
}
