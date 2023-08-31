import React from 'react';
import { notFound } from 'next/navigation';

import { API_BASE_URL } from '@/constants';
import { getResult } from '@/database';
import { EvaluateSummary, EvaluateTestSuite, SharedResults } from '@/../../../types';
import Eval from '../Eval';

import './page.css';

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  let sharedResults: SharedResults;
  let recentFiles;
  const decodedId = decodeURIComponent(params.id);
  if (decodedId.startsWith('local:')) {
    // Load local file and list of recent files in parallel
    const [response, response2] = await Promise.all([
      fetch(`${API_BASE_URL}/results/${decodedId.slice(6)}`),
      fetch(`${API_BASE_URL}/results`),
    ]);

    if (!response.ok) {
      notFound();
    }

    [sharedResults, recentFiles] = await Promise.all([
      response.json(),
      response2.json().then((res) => res.data),
    ]);
  } else if (decodedId.startsWith('remote:')) {
    const id = decodedId.slice('remote:'.length);
    const result = await getResult(id);
    sharedResults = {
      data: {
        version: result.version,
        results: result.results as unknown as EvaluateSummary,
        config: result.config as unknown as EvaluateTestSuite,
      },
    };
  } else {
    // Cloudflare KV
    // Next.js chokes on large evals, so the client will fetch them separately.
    return <Eval fetchId={params.id} />;
  }
  return <Eval preloadedData={sharedResults} recentFiles={recentFiles} />;
}
