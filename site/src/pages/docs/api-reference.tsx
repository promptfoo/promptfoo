import React from 'react';

import ScalarApiReference from '../../components/ScalarApiReference';

const PROMPTFOO_API_SPEC_URL = 'https://api.promptfoo.app/static/openapi.json';

export default function ApiReference() {
  return (
    <ScalarApiReference
      title="API Reference | Promptfoo"
      description="Interactive OpenAPI reference for Promptfoo Cloud and Enterprise API routes"
      heading="API Reference"
      specUrl={PROMPTFOO_API_SPEC_URL}
      summary="Promptfoo's API reference uses the hosted OpenAPI document for Promptfoo Cloud and Enterprise endpoints."
    />
  );
}
