import { useEffect } from 'react';
import Progress from './Progress';

export default function ProgressPage() {
  useEffect(() => {
    document.title = 'Progress | promptfoo';
  }, []);

  return (
    <div>
      <Progress />
    </div>
  );
}
