import React from 'react';
import { notFound } from 'next/navigation';

import Eval from '../Eval';

import './page.css';

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  const response = await fetch(`https://api.promptfoo.dev/eval/${params.id}`);
  if (!response.ok) {
    notFound();
  }
  const data = await response.json();

  return <Eval preloadedData={data} />;
}
