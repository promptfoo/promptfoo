import { useEffect } from 'react';

import PylonChat from '@app/components/PylonChat';
import { Spinner } from '@app/components/ui/spinner';
import { UserProvider } from '@app/contexts/UserContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useUserStore } from '@app/stores/userStore';
import { useNavigate } from 'react-router-dom';
import Report from './components/Report';
import ReportIndex from './components/ReportIndex';

export default function ReportPage() {
  const navigate = useNavigate();
  const { email, isLoading, fetchEmail } = useUserStore();
  const searchParams = new URLSearchParams(window.location.search);
  const evalId = searchParams.get('evalId');
  usePageMeta({
    title: 'Red Team Vulnerability Reports',
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
      <div className="flex flex-col gap-3 justify-center items-center h-36">
        <Spinner className="h-6 w-6" />
        <span className="text-sm text-muted-foreground">Waiting for report data</span>
      </div>
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
