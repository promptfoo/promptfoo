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
  const decodedId = decodeURIComponent(params.id);
  if (decodedId.startsWith('local:')) {
    // Local file
    const response = await fetch(`${API_BASE_URL}/results/${decodedId.slice(6)}`);
    if (!response.ok) {
      notFound();
    }
    data = await response.json();
  } else {
    // Cloudflare KV
    const response = await fetch(`https://api.promptfoo.dev/eval/${params.id}`);
    if (!response.ok) {
      notFound();
    }
    data = await response.json();
  }

  // TODO(ian): Pass recent files as well
  return <Eval preloadedData={data} />;
}
