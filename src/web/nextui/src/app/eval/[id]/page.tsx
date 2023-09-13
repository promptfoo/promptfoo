import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import { API_BASE_URL } from '@/constants';
import { getResult } from '@/database';
import { EvaluateSummary, EvaluateTestSuite, SharedResults } from '@/../../../types';
import Eval from '../Eval';

import './page.css';

export const metadata: Metadata = {
  robots: 'noindex',
};

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  let sharedResults: SharedResults;
  let recentFiles;
  let defaultEvalId: string | undefined;
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
    // Load this eval
    // TODO(ian): Does this also choke on large evals?
    const id = decodedId.slice('remote:'.length);
    defaultEvalId = id;

    const supabase = createServerComponentClient({ cookies });
    const result = await getResult(supabase, id);
    sharedResults = {
      data: {
        version: result.version,
        results: result.results as unknown as EvaluateSummary,
        config: result.config as unknown as EvaluateTestSuite,
      },
    };

    // Fetch recent evals
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('EvaluationResult')
        .select('id, createdAt')
        .eq('userId', user.id)
        .order('createdAt', { ascending: false })
        .limit(100);
      if (data) {
        recentFiles = data.map((row) => ({ id: row.id, label: row.createdAt }));
      }
    }
  } else {
    // Cloudflare KV
    // Next.js chokes on large evals, so the client will fetch them separately.
    return <Eval fetchId={params.id} />;
  }
  return (
    <Eval preloadedData={sharedResults} recentEvals={recentFiles} defaultEvalId={defaultEvalId} />
  );
}
