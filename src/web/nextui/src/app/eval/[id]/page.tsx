import React from 'react';
import { callApi } from '@app/api';
import type { ResultLightweightWithLabel, SharedResults } from '@promptfoo/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Eval from '../Eval';
import './page.css';

export const metadata: Metadata = {
  robots: 'noindex,nofollow',
};

export default async function Page({ params }: { params: { id: string } }) {
  let sharedResults: SharedResults;
  let recentEvals: ResultLightweightWithLabel[] = [];
  let defaultEvalId: string | undefined;
  const decodedId = decodeURIComponent(params.id);

  if (decodedId.startsWith('local:')) {
    // Load local file and list of recent files in parallel
    const [response, response2] = await Promise.all([
      callApi(`/results/${decodedId.slice(6)}`),
      callApi(`/api/results`),
    ]);

    if (!response.ok) {
      notFound();
    }

    [sharedResults, recentEvals] = await Promise.all([
      response.json(),
      response2.json().then((res) => res.data),
    ]);
  } else {
    // Cloudflare KV
    // Next.js chokes on large evals, so the client will fetch them separately.
    return <Eval fetchId={params.id} />;
  }
  return (
    <Eval preloadedData={sharedResults} recentEvals={recentEvals} defaultEvalId={defaultEvalId} />
  );
}
