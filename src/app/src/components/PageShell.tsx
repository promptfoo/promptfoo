import Navigation from '@app/components/Navigation';
import { PostHogProvider } from '@app/components/PostHogProvider';
import UpdateBanner from '@app/components/UpdateBanner';
import { Outlet } from 'react-router-dom';
import { PostHogPageViewTracker } from './PostHogPageViewTracker';

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function PageShell() {
  const handleSkipToContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
      return;
    }

    event.preventDefault();
    mainContent.focus();
  };

  return (
    <PostHogProvider>
      <Layout>
        <a
          href="#main-content"
          onClick={handleSkipToContent}
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-(--z-tooltip) focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Skip to content
        </a>
        <Navigation />
        <UpdateBanner />
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <PostHogPageViewTracker />
      </Layout>
    </PostHogProvider>
  );
}
