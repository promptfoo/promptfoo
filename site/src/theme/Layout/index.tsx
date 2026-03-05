import React from 'react';

import EventsBanner from '@site/src/components/EventsBanner';
import ForceLightTheme from '@site/src/components/ForceLightTheme';
import { CartDrawer, CartProvider } from '@site/src/components/Store';
import { useIsDocsPage, useIsEventDetailPage } from '@site/src/hooks/useIsDocsPage';
import OriginalLayout from '@theme-original/Layout';
import type { Props } from '@theme/Layout';

export default function Layout(props: Props): React.ReactElement {
  const isDocsPage = useIsDocsPage();
  const isEventDetailPage = useIsEventDetailPage();
  const shouldForceLight = !isDocsPage && !isEventDetailPage;

  return (
    <CartProvider>
      <EventsBanner />
      <OriginalLayout {...props}>
        {shouldForceLight && <ForceLightTheme />}
        {props.children}
      </OriginalLayout>
      <CartDrawer />
    </CartProvider>
  );
}
