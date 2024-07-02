import { Suspense } from 'react';
import Datasets from './Datasets';

export default function Page() {
  return (
    <div>
      <Suspense>
        <Datasets />
      </Suspense>
    </div>
  );
}
