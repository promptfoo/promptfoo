import React from 'react';

import ScalarApiReference from '../../components/ScalarApiReference';

const LOCAL_SERVER_OPENAPI_SPEC_URL = '/openapi.json';

export default function LocalServerApiReference() {
  return (
    <ScalarApiReference
      title="Local Server API Reference | Promptfoo"
      description="Interactive OpenAPI reference for Promptfoo local server routes"
      heading="Local Server API Reference"
      specUrl={LOCAL_SERVER_OPENAPI_SPEC_URL}
      summary="Promptfoo's local server API reference is generated from the same Zod DTO schemas used by local server route validation."
    />
  );
}
