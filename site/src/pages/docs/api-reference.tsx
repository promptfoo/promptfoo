import React from 'react';

import ScalarApiReference from '../../components/ScalarApiReference';

export default function ApiReference() {
  return (
    <ScalarApiReference
      description="Browse the Promptfoo Cloud and Enterprise HTTP API."
      heading="API Reference"
      specUrl="https://api.promptfoo.app/static/openapi.json"
    />
  );
}
