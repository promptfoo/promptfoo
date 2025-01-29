import { useEffect } from 'react';
import Datasets from './Datasets';

export default function DatasetsPage() {
  useEffect(() => {
    document.title = 'Datasets | promptfoo';
  }, []);

  return (
    <div>
      <Datasets />
    </div>
  );
}
