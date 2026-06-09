import React from 'react';

import legacyNodeApiAnchors from '@site/src/data/nodeApiLegacyAnchors.json';

type LegacyNodeApiPage = keyof typeof legacyNodeApiAnchors;

export default function LegacyHeadingAnchors({ page }: { page: LegacyNodeApiPage }) {
  return (
    <span aria-hidden="true">
      {legacyNodeApiAnchors[page].map((id) => (
        <span id={id} key={id} />
      ))}
    </span>
  );
}
