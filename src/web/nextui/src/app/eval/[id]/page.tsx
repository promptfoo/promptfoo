import React from 'react';
import { notFound } from 'next/navigation';

import { API_BASE_URL } from '@/util/api';
import Eval from '../Eval';

import './page.css';

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  let data;
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

    [data, recentFiles] = await Promise.all([
      response.json(),
      response2.json().then((res) => res.data),
    ]);
  } else {
    // Cloudflare KV
    const response = await fetch(`https://api.promptfoo.dev/eval/${params.id}`);
    if (!response.ok) {
      notFound();
    }
    data = await response.json();
  }
  return <Eval preloadedData={data} recentFiles={recentFiles} />;
}
