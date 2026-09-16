import React from 'react';

import useBrokenLinks from '@docusaurus/useBrokenLinks';
import legacyNodeApiAnchors from '@site/src/data/nodeApiLegacyAnchors.json';

type LegacyNodeApiPage = keyof typeof legacyNodeApiAnchors;

export default function LegacyHeadingAnchors({
  page,
  section,
}: {
  page: LegacyNodeApiPage;
  section: string;
}) {
  const sections: Record<string, string[]> = legacyNodeApiAnchors[page];
  const anchors = sections[section] ?? [];
  const { collectAnchor } = useBrokenLinks();
  anchors.forEach(collectAnchor);

  return (
    <span aria-hidden="true">
      {anchors.map((id) => (
        <span id={id} key={id} />
      ))}
    </span>
  );
}
