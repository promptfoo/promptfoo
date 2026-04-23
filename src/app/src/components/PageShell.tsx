import { Suspense } from 'react';

import Navigation from '@app/components/Navigation';
import { PostHogProvider } from '@app/components/PostHogProvider';
import UpdateBanner from '@app/components/UpdateBanner';
import { Spinner } from '@app/components/ui/spinner';
import { Outlet } from 'react-router-dom';
import { PostHogPageViewTracker } from './PostHogPageViewTracker';

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function PageShell() {
  return (
    <PostHogProvider>
      <Layout>
        <Navigation />
        <UpdateBanner />
        <Suspense fallback={<Spinner size="lg" className="h-[calc(100vh-4rem)]" />}>
          <Outlet />
        </Suspense>
        <PostHogPageViewTracker />
      </Layout>
    </PostHogProvider>
  );
}
