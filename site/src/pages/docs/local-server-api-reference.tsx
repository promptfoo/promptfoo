import React from 'react';

import CodeBlock from '@theme/CodeBlock';
import echoEvalExample from '../../../../src/openapi/examples/echo-eval.json';
import ScalarApiReference from '../../components/ScalarApiReference';

const requestFields = Object.entries(echoEvalExample).map(
  ([field, value]) => `  "${field}": ${JSON.stringify(value)}`,
);

export default function LocalServerApiReference() {
  return (
    <ScalarApiReference
      description="Browse the HTTP API served by the Promptfoo CLI on your machine."
      heading="Local Server API Reference"
      hideTestRequestButton
      specUrl="/openapi.json"
    >
      <section className="container margin-vert--md" aria-label="HTTP quickstart">
        <details>
          <summary>
            <strong>Run your first eval over HTTP</strong>
          </summary>
          <p>
            This quickstart uses the built-in <code>echo</code> provider and keeps the result on
            your machine. Use a Bash-compatible shell with Node.js 22.22 or later, curl 7.82 or
            later, and jq. No API key is required.
          </p>
          <p>
            <strong>1. Start the server.</strong> Run this in one terminal and leave it running.
          </p>
          <CodeBlock language="bash">{'npx --yes promptfoo@latest view -n --port 15500'}</CodeBlock>
          <p>
            <strong>2. Submit the eval.</strong> In a second terminal, send the request and save the
            job ID.
          </p>
          <CodeBlock language="bash">{`promptfoo_url=http://localhost:15500
job_id=$(curl -fsS "$promptfoo_url/api/eval/job" --json '{
${requestFields.join(',\n')}
}' | jq -er '.id')`}</CodeBlock>
          <p>
            <strong>3. Get the result.</strong> Run this in the same terminal. If the status is{' '}
            <code>in-progress</code>, repeat the command.
          </p>
          <CodeBlock language="bash">{`curl -fsS "$promptfoo_url/api/eval/job/$job_id" | jq '{
  status, evalId, output: .result.results[0].response.output,
  passed: .result.stats.successes, failed: .result.stats.failures
}'`}</CodeBlock>
          <p>
            A successful run returns <code>complete</code>, an <code>evalId</code> for the saved
            result, output <code>ping</code>, one pass, and zero failures.
          </p>
          <p>
            The job commands above work with <code>promptfoo@0.125.1</code>. That release predates
            the local spec endpoint. On builds that include{' '}
            <a href="https://github.com/promptfoo/promptfoo/pull/8978">#8978</a>, you can also
            inspect the spec for the version you’re running:
          </p>
          <CodeBlock language="bash">{`curl -fsS "$promptfoo_url/api/openapi.json" | jq '.info'`}</CodeBlock>
          <p>
            For Enterprise On-Prem, start jobs with <code>POST /api/v1/jobs</code>. With hosted
            Promptfoo Cloud, run the eval locally or in CI and upload the results. See the{' '}
            <a href="/docs/api-reference/#tag/jobs">Cloud and Enterprise API reference</a>.
          </p>
        </details>
      </section>
    </ScalarApiReference>
  );
}
