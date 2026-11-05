import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { storeBlob } from '../../../src/blobs';
import { closeDb } from '../../../src/database';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import { createShareableUrl } from '../../../src/share';
import { ResultFailureReason } from '../../../src/types';

const [baseUrl, outputFile] = process.argv.slice(2);
if (!baseUrl || !outputFile) {
  throw new Error('Expected recipient URL and result filename');
}

const fetchRequest = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.origin !== baseUrl) {
    throw new Error('Share fixture only permits its local recipient');
  }
  return fetchRequest(input, init);
};

await runDbMigrations();
try {
  const source = await Eval.create(
    {
      providers: [{ id: 'test-provider' }],
      prompts: ['hello'],
      tests: [{ vars: { input: 'hello' } }],
      sharing: { apiBaseUrl: baseUrl, appBaseUrl: baseUrl },
    },
    [{ raw: 'hello', label: 'hello' }],
    { id: randomUUID() },
  );
  const mediaBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=',
    'base64',
  );
  const media = await storeBlob(mediaBytes, 'image/png', {
    evalId: source.id,
    kind: 'image',
    location: 'response.output',
    promptIdx: 0,
    testIdx: 0,
  });
  const traceId = randomUUID().replaceAll('-', '');
  await source.addResult({
    description: 'share-e2e',
    promptIdx: 0,
    testIdx: 0,
    testCase: { metadata: { evaluationId: source.id }, vars: { input: 'hello' } },
    promptId: 'share-prompt',
    provider: { id: 'test-provider', label: 'test-provider' },
    prompt: { raw: 'hello', label: 'hello' },
    vars: { input: 'hello' },
    response: { output: media.ref.uri },
    error: null,
    failureReason: ResultFailureReason.NONE,
    success: true,
    score: 1,
    latencyMs: 1,
    gradingResult: null,
    namedScores: {},
    metadata: { evaluationId: source.id, traceId },
    evaluationId: source.id,
    traceId,
  });
  await source.appendTraces([
    {
      traceId,
      evaluationId: source.id,
      testCaseId: 'share-test-case',
      metadata: {
        evaluationId: source.id,
        media: media.ref.uri,
        traceId,
      },
      spans: [
        {
          spanId: 'share-span',
          name: 'stored operation '.repeat(260),
          startTime: 1,
          attributes: {
            'evaluation.id': source.id,
            'promptfoo.eval.id': source.id,
            'promptfoo.trace_id': traceId,
          },
        },
      ],
    },
  ]);
  const shareUrl = await createShareableUrl(source, { silent: true });
  if (!shareUrl) {
    throw new Error('Local share failed');
  }
  await writeFile(
    outputFile,
    JSON.stringify({
      shareUrl,
      sourceId: source.id,
      traceId,
      media: media.ref,
      data: mediaBytes.toString('base64'),
    }),
  );
} finally {
  await closeDb();
}
