import Navigation from '@app/components/Navigation';
import UpdateBanner from '@app/components/UpdateBanner';
import { Outlet } from 'react-router-dom';

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export default function PageShell() {
  return (
    <Layout>
      <Navigation />
      <UpdateBanner />
      <Outlet />
    </Layout>
  );
}
