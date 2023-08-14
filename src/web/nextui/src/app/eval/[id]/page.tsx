import React from 'react';

import Eval from '../Eval';

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: { id: string } }) {
  const response = await fetch(`https://api.promptfoo.dev/eval/${params.id}`);
  const data = await response.json();

  return <Eval preloadedData={data} />;
}
