import { useEffect } from 'react';

import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { ClipboardList } from 'lucide-react';
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
    <div className="container max-w-md mx-auto px-4">
      <div className="mt-16 flex flex-col items-center">
        <Card className="p-8 w-full text-center shadow-lg">
          <h1 className="text-6xl font-bold text-primary mb-4">404</h1>

          <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>

          <p className="text-muted-foreground mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <Button onClick={() => navigate('/evals')} size="lg">
            <ClipboardList className="size-5 mr-2" />
            See Evals
          </Button>
        </Card>
      </div>
    </div>
  );
}
