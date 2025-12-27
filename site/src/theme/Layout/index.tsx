import React from 'react';

import EventsBanner from '@site/src/components/EventsBanner';
import OriginalLayout from '@theme-original/Layout';
import type { Props } from '@theme/Layout';

export default function Layout(props: Props): React.ReactElement {
  return (
    <>
      <EventsBanner />
      <OriginalLayout {...props} />
    </>
  );
}
