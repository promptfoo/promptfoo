import React from 'react';

import ScalarApiReference from '../../components/ScalarApiReference';

export default function LocalServerApiReference() {
  return (
    <ScalarApiReference
      description="Browse the latest local server API. For your installed version, fetch /api/openapi.json from your server."
      heading="Local Server API Reference"
      hideTestRequestButton
      specUrl="/openapi.json"
    />
  );
}
