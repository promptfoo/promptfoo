import { Suspense } from 'react';
import Prompts from './Prompts';

export default function Page() {
  return (
    <div>
      <Suspense>
        <Prompts />
      </Suspense>
    </div>
  );
}
