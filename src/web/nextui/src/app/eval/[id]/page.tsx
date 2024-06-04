import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import { getApiBaseUrl } from '@/api';
import { IS_RUNNING_LOCALLY } from '@/constants';
import { getResult } from '@/database';
import { EvaluateSummary, EvaluateTestSuite, SharedResults, UnifiedConfig } from '@/../../../types';
import Eval from '../Eval';

import './page.css';

export const metadata: Metadata = {
  robots: 'noindex,nofollow',
};

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

// Don't cache database lookups.
export const revalidate = 0;

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  let sharedResults: SharedResults;
  let recentEvals: { id: string; label: string }[] = [];
  let defaultEvalId: string | undefined;
  const decodedId = decodeURIComponent(params.id);
  if (decodedId.startsWith('local:')) {
    // Load local file and list of recent files in parallel
    const apiBaseUrl = await getApiBaseUrl();
    const [response, response2] = await Promise.all([
      fetch(`${apiBaseUrl}/api/results/${decodedId.slice(6)}`),
      fetch(`${apiBaseUrl}/api/results`),
    ]);

    if (!response.ok) {
      notFound();
    }

    [sharedResults, recentEvals] = await Promise.all([
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
        createdAt: result.createdAt,
        results: result.results as unknown as EvaluateSummary,
        config: result.config as unknown as UnifiedConfig,
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
        .eq('user_id', user.id)
        .order('createdAt', { ascending: false })
        .limit(100);
      if (data) {
        recentEvals = data.map((row) => ({ id: row.id, label: row.createdAt }));
      }
    }
  } else {
    // Cloudflare KV
    // Next.js chokes on large evals, so the client will fetch them separately.
    return <Eval fetchId={params.id} />;
  }
  return (
    <Eval preloadedData={sharedResults} recentEvals={recentEvals} defaultEvalId={defaultEvalId} />
  );
}
