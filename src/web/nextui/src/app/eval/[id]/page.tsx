import React from 'react';
import {
  EvaluateSummary,
  ResultLightweightWithLabel,
  SharedResults,
  UnifiedConfig,
} from '@/../../../types';
import { getApiBaseUrl } from '@/api';
import { IS_RUNNING_LOCALLY } from '@/constants';
import { getResult } from '@/database';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
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
  let recentEvals: ResultLightweightWithLabel[] = [];
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
        author: 'Remote User',
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
        recentEvals = data.map((row) => ({
          evalId: row.id,
          label: row.createdAt,
          createdAt: row.createdAt,
          description: 'None',
          numTests: 0,
        }));
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
