import React from 'react';

import ScalarApiReference from '../../components/ScalarApiReference';

const LOCAL_SERVER_OPENAPI_SPEC_URL = '/openapi.json';

export default function LocalServerApiReference() {
  return (
    <ScalarApiReference
      title="Local Server API Reference | Promptfoo"
      description="OpenAPI reference for Promptfoo local server routes"
      heading="Local Server API Reference"
      showTestRequestButton={false}
      specUrl={LOCAL_SERVER_OPENAPI_SPEC_URL}
      summary="Browse the latest local server API. For your installed version, fetch /api/openapi.json from your server."
    />
  );
}
