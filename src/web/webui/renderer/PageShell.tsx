import React from 'react';
import { PageContextProvider } from './usePageContext';
import { Stack } from '@mui/material';

import { Link } from './Link';
import Logo from './Logo';

import type { PageContext } from './types';

import './PageShell.css';

export { PageShell };

function PageShell({
  children,
  pageContext,
}: {
  children: React.ReactNode;
  pageContext: PageContext;
}) {
  return (
    <React.StrictMode>
      <PageContextProvider pageContext={pageContext}>
        <Layout>
          <Navigation />
          <div>{children}</div>
        </Layout>
      </PageContextProvider>
    </React.StrictMode>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function Navigation() {
  return (
    <Stack direction="row" spacing={2} className="nav">
      <Logo />
      <Link href="/">Home</Link>
      <Link href="/setup">Create Eval</Link>
      <Link href="/eval">View Eval</Link>
    </Stack>
  );
}
